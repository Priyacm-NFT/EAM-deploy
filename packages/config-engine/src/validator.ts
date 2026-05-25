import { Parser, type Value } from 'expr-eval';
import type { ValidationResult } from '@eam/shared';

export interface FieldDef {
  fieldKey: string;
  isRequiredGlobal: boolean;
  validationRules?: Record<string, unknown>;
}

export interface FieldRule {
  fieldKey: string;
  ruleType: 'REQUIRED' | 'READONLY' | 'HIDDEN' | 'VISIBLE';
  conditionExpression?: string | null;
  roleId?: string | null;
  statusCondition?: string | null;
}

export interface FieldRuleState {
  visible: boolean;
  readonly: boolean;
  required: boolean;
}

const parser = new Parser();

export function evaluateCondition(expression: string, data: Record<string, unknown>): boolean {
  if (!expression?.trim()) return true;
  try {
    const expr = parser.parse(expression);
    return Boolean(expr.evaluate(data as Value));
  } catch {
    return false;
  }
}

function ruleAppliesToUser(rule: FieldRule, userRoleIds: string[]): boolean {
  if (!rule.roleId) return true;
  return userRoleIds.includes(rule.roleId);
}

export function applyFieldRules(
  rules: FieldRule[],
  data: Record<string, unknown>,
  userRoleIds: string[],
  _userRoleNames?: string[],
): Record<string, FieldRuleState> {
  const states: Record<string, FieldRuleState> = {};

  const fieldKeys = new Set(rules.map((r) => r.fieldKey));
  for (const key of fieldKeys) {
    states[key] = { visible: true, readonly: false, required: false };
  }

  const sorted = [...rules].sort((a, b) => {
    const order = { VISIBLE: 0, HIDDEN: 1, READONLY: 2, REQUIRED: 3 };
    return order[a.ruleType] - order[b.ruleType];
  });

  for (const rule of sorted) {
    if (!ruleAppliesToUser(rule, userRoleIds)) continue;
    if (rule.conditionExpression && !evaluateCondition(rule.conditionExpression, data)) continue;

    const state = states[rule.fieldKey] ?? { visible: true, readonly: false, required: false };

    switch (rule.ruleType) {
      case 'HIDDEN':
        state.visible = false;
        break;
      case 'VISIBLE':
        state.visible = true;
        break;
      case 'READONLY':
        state.readonly = true;
        break;
      case 'REQUIRED':
        state.required = true;
        break;
    }
    states[rule.fieldKey] = state;
  }

  return states;
}

export function validateRecord(
  fields: FieldDef[],
  rules: FieldRule[],
  data: Record<string, unknown>,
  userRoleIds?: string[],
  userRoleNames?: string[],
): ValidationResult {
  const errors: Array<{ field_key: string; message: string }> = [];
  const roleIds = userRoleIds ?? [];

  const states =
    roleIds.length > 0 || rules.some((r) => r.roleId)
      ? applyFieldRules(rules, data, roleIds, userRoleNames)
      : applyFieldRules(rules, data, [], userRoleNames);

  for (const field of fields) {
    const value = data[field.fieldKey];
    const state = states[field.fieldKey];

    if (state && !state.visible) {
      if (value !== undefined && value !== null && value !== '') {
        errors.push({ field_key: field.fieldKey, message: `${field.fieldKey} is not writable` });
      }
      continue;
    }

    if (state?.readonly && value !== undefined && data[field.fieldKey] !== undefined) {
      errors.push({ field_key: field.fieldKey, message: `${field.fieldKey} is read-only` });
    }

    if (field.isRequiredGlobal && (value === undefined || value === null || value === '')) {
      errors.push({ field_key: field.fieldKey, message: `${field.fieldKey} is required` });
    }

    const regex = field.validationRules?.regex as string | undefined;
    if (regex && value != null && typeof value === 'string') {
      if (!new RegExp(regex).test(value)) {
        errors.push({ field_key: field.fieldKey, message: `${field.fieldKey} format is invalid` });
      }
    }

    if (state?.required && (value === undefined || value === null || value === '')) {
      errors.push({ field_key: field.fieldKey, message: `${field.fieldKey} is required by rule` });
    }
  }

  for (const rule of rules) {
    if (rule.ruleType === 'REQUIRED' && rule.conditionExpression) {
      if (!ruleAppliesToUser(rule, roleIds)) continue;
      if (evaluateCondition(rule.conditionExpression, data)) {
        const value = data[rule.fieldKey];
        if (value === undefined || value === null || value === '') {
          errors.push({
            field_key: rule.fieldKey,
            message: `${rule.fieldKey} is required by rule`,
          });
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
