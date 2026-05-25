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

export function validateRecord(
  fields: FieldDef[],
  rules: FieldRule[],
  data: Record<string, unknown>,
  _userRoles?: string[],
): ValidationResult {
  const errors: Array<{ field_key: string; message: string }> = [];

  for (const field of fields) {
    const value = data[field.fieldKey];
    if (field.isRequiredGlobal && (value === undefined || value === null || value === '')) {
      errors.push({ field_key: field.fieldKey, message: `${field.fieldKey} is required` });
    }
    const regex = field.validationRules?.regex as string | undefined;
    if (regex && value != null && typeof value === 'string') {
      if (!new RegExp(regex).test(value)) {
        errors.push({ field_key: field.fieldKey, message: `${field.fieldKey} format is invalid` });
      }
    }
  }

  for (const rule of rules) {
    if (rule.ruleType === 'REQUIRED' && rule.conditionExpression) {
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
