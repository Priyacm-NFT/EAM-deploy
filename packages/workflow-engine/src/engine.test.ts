import { describe, it, expect } from 'vitest';
import { Parser } from 'expr-eval';

describe('workflow conditions', () => {
  it('routes high value to finance path', () => {
    const parser = new Parser();
    const expr = parser.parse('totalcost > 100000');
    expect(expr.evaluate({ totalcost: 150000 })).toBe(true);
    expect(expr.evaluate({ totalcost: 80000 })).toBe(false);
  });
});
