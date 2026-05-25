/** Field-level validation rules stored on field_definitions.validation_rules */
export interface FieldValidationRules {
  regex?: string;
  minLength?: number;
  maxLength?: number;
  /** Minimum numeric value or ISO date string (YYYY-MM-DD) for DATE fields */
  min?: number | string;
  /** Maximum numeric value or ISO date string (YYYY-MM-DD) for DATE fields */
  max?: number | string;
}

export function parseValidationRules(
  raw: Record<string, unknown> | null | undefined,
): FieldValidationRules {
  if (!raw || typeof raw !== 'object') return {};
  const rules: FieldValidationRules = {};
  if (typeof raw.regex === 'string') rules.regex = raw.regex;
  if (typeof raw.minLength === 'number') rules.minLength = raw.minLength;
  if (typeof raw.maxLength === 'number') rules.maxLength = raw.maxLength;
  if (typeof raw.min === 'number' || typeof raw.min === 'string') rules.min = raw.min;
  if (typeof raw.max === 'number' || typeof raw.max === 'string') rules.max = raw.max;
  return rules;
}
