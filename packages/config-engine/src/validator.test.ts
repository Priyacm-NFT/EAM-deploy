import { describe, it, expect } from 'vitest';
import { validateRecord, evaluateCondition } from './validator.js';

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
