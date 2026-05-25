import { Parser, type Value } from 'expr-eval';
import type { ValidationResult } from '@eam/shared';
import { parseValidationRules, type FieldValidationRules } from '@eam/shared';

export interface FieldDef {
  fieldKey: string;
  isRequiredGlobal: boolean;
  fieldType?: string;
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

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function toComparableNumber(value: unknown): number | null {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function toComparableDate(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return null;
}

function boundaryToNumber(boundary: number | string | undefined): number | null {
  if (boundary === undefined) return null;
  if (typeof boundary === 'number') return boundary;
  const d = toComparableDate(boundary);
  if (d) return Date.parse(d);
  const n = Number(boundary);
  return Number.isNaN(n) ? null : n;
}

/** Validates regex, string length, and numeric/date range rules for a single field value. */
export function validateFieldValueRules(
  fieldKey: string,
  value: unknown,
  rules: FieldValidationRules,
  fieldType?: string,
): Array<{ field_key: string; message: string }> {
  const errors: Array<{ field_key: string; message: string }> = [];
  if (isEmptyValue(value)) return errors;

  const str = typeof value === 'string' ? value : String(value);

  if (rules.regex && typeof value === 'string') {
    try {
      if (!new RegExp(rules.regex).test(value)) {
        errors.push({ field_key: fieldKey, message: `${fieldKey} format is invalid` });
      }
    } catch {
      errors.push({ field_key: fieldKey, message: `${fieldKey} has invalid validation config` });
    }
  }

  if (rules.minLength != null && str.length < rules.minLength) {
    errors.push({
      field_key: fieldKey,
      message: `${fieldKey} must be at least ${rules.minLength} characters`,
    });
  }
  if (rules.maxLength != null && str.length > rules.maxLength) {
    errors.push({
      field_key: fieldKey,
      message: `${fieldKey} must be at most ${rules.maxLength} characters`,
    });
  }

  const isDateField = fieldType === 'DATE' || fieldType === 'DATETIME';
  const minBound = boundaryToNumber(rules.min);
  const maxBound = boundaryToNumber(rules.max);

  if (minBound != null || maxBound != null) {
    let comparable: number | null = null;
    if (isDateField) {
      comparable = toComparableDate(value) ? Date.parse(toComparableDate(value)!) : null;
    } else {
      comparable = toComparableNumber(value);
    }
    if (comparable == null) {
      errors.push({ field_key: fieldKey, message: `${fieldKey} must be a valid ${isDateField ? 'date' : 'number'}` });
    } else {
      if (minBound != null && comparable < minBound) {
        errors.push({
          field_key: fieldKey,
          message: `${fieldKey} must be at least ${rules.min}`,
        });
      }
      if (maxBound != null && comparable > maxBound) {
        errors.push({
          field_key: fieldKey,
          message: `${fieldKey} must be at most ${rules.max}`,
        });
      }
    }
  }

  return errors;
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

    const parsedRules = parseValidationRules(field.validationRules);
    errors.push(
      ...validateFieldValueRules(field.fieldKey, value, parsedRules, field.fieldType),
    );

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
