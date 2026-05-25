import { describe, it, expect } from 'vitest';
import { triggerApplies } from './trigger.js';

describe('triggerApplies', () => {
  it('filters by entity type', () => {
    expect(
      triggerApplies(
        { entityType: 'WorkOrder', conditionExpression: null },
        { entityType: 'WorkOrder' },
      ),
    ).toBe(true);
    expect(
      triggerApplies(
        { entityType: 'WorkOrder', conditionExpression: null },
        { entityType: 'Asset' },
      ),
    ).toBe(false);
  });

  it('evaluates condition expressions against context', () => {
    expect(
      triggerApplies(
        { entityType: null, conditionExpression: 'totalcost > 100000' },
        { context: { totalcost: 150000 } },
      ),
    ).toBe(true);
    expect(
      triggerApplies(
        { entityType: null, conditionExpression: 'totalcost > 100000' },
        { context: { totalcost: 50000 } },
      ),
    ).toBe(false);
  });

  it('passes when no condition is configured', () => {
    expect(
      triggerApplies({ entityType: null, conditionExpression: null }, { entityType: 'X' }),
    ).toBe(true);
  });
});
