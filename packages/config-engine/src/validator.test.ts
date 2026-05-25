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
});
