import { describe, it, expect } from 'vitest';
import { ReportQueryBuilder } from './query-builder.js';

describe('ReportQueryBuilder', () => {
  const builder = new ReportQueryBuilder();

  it('always injects tenant_id', () => {
    const q = builder.buildQuery('work_orders', 'tenant-1');
    expect(q.sql).toContain('tenant_id = $1');
    expect(q.params[0]).toBe('tenant-1');
  });

  it('rejects SQL injection in filter', () => {
    expect(() =>
      builder.buildQuery('work_orders', 't1', [
        { field: 'status', operator: 'EQUALS', value: "'; DROP TABLE users; --" },
      ]),
    ).toThrow();
  });

  it('rejects unknown fields', () => {
    expect(() =>
      builder.buildQuery('work_orders', 't1', [
        { field: 'evil_column', operator: 'EQUALS', value: 'x' },
      ]),
    ).toThrow();
  });
});
