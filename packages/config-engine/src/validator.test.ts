import { describe, it, expect } from 'vitest';
import { validateRecord, evaluateCondition, validateFieldValueRules } from './validator.js';

describe('ValidationEngine', () => {
  it('enforces global required', () => {
    const r = validateRecord(
      [{ fieldKey: 'asset_tag', isRequiredGlobal: true }],
      [],
      {},
    );
    expect(r.valid).toBe(false);
  });

  it('evaluates conditional required', () => {
    const r = validateRecord(
      [{ fieldKey: 'asset_tag', isRequiredGlobal: false }],
      [
        {
          fieldKey: 'asset_tag',
          ruleType: 'REQUIRED',
          conditionExpression: 'priority == "CRITICAL"',
        },
      ],
      { priority: 'CRITICAL' },
    );
    expect(r.valid).toBe(false);
  });

  it('evaluates condition expressions', () => {
    expect(evaluateCondition('totalcost > 100000', { totalcost: 150000 })).toBe(true);
  });

  it('rejects writes to hidden fields for role', () => {
    const r = validateRecord(
      [{ fieldKey: 'salary', isRequiredGlobal: false }],
      [{ fieldKey: 'salary', ruleType: 'HIDDEN', roleId: 'role-a' }],
      { salary: 100 },
      ['role-a'],
    );
    expect(r.valid).toBe(false);
  });

  it('enforces min and max numeric range', () => {
    const r = validateRecord(
      [
        {
          fieldKey: 'quantity',
          isRequiredGlobal: false,
          fieldType: 'NUMBER',
          validationRules: { min: 1, max: 100 },
        },
      ],
      [],
      { quantity: 0 },
    );
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.message).toContain('at least');

    const ok = validateRecord(
      [
        {
          fieldKey: 'quantity',
          isRequiredGlobal: false,
          fieldType: 'NUMBER',
          validationRules: { min: 1, max: 100 },
        },
      ],
      [],
      { quantity: 50 },
    );
    expect(ok.valid).toBe(true);
  });

  it('enforces minLength and maxLength', () => {
    const errors = validateFieldValueRules('code', 'ab', {
      minLength: 3,
      maxLength: 5,
    });
    expect(errors.length).toBe(1);
    expect(validateFieldValueRules('code', 'abc', { minLength: 3, maxLength: 5 })).toHaveLength(0);
  });

  it('enforces date range', () => {
    const errors = validateFieldValueRules('due_date', '2020-01-01', {
      min: '2024-01-01',
      max: '2025-12-31',
    }, 'DATE');
    expect(errors.length).toBe(1);
  });

  it('applyFieldRules marks readonly', async () => {
    const { applyFieldRules } = await import('./validator.js');
    const states = applyFieldRules(
      [{ fieldKey: 'status', ruleType: 'READONLY', roleId: 'r1' }],
      {},
      ['r1'],
    );
    expect(states.status?.readonly).toBe(true);
  });
});
