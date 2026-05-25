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
      builder.buildQuery('work_orders', 't1', {
        filters: [{ field: 'status', operator: 'EQUALS', value: "'; DROP TABLE users; --" }],
      }),
    ).toThrow();
  });

  it('rejects unknown fields', () => {
    expect(() =>
      builder.buildQuery('work_orders', 't1', {
        filters: [{ field: 'evil_column', operator: 'EQUALS', value: 'x' }],
      }),
    ).toThrow();
  });

  it('rejects invalid base table', () => {
    expect(() => builder.buildQuery('users', 't1')).toThrow(/Invalid base table/);
  });

  it('translates IN and BETWEEN filters', () => {
    const q = builder.buildQuery('work_orders', 't1', {
      filters: [
        { field: 'status', operator: 'IN', value: ['WAPPR', 'INPRG'] },
        { field: 'wo_num', operator: 'BETWEEN', value: { from: 'WO-1', to: 'WO-9' } },
      ],
    });
    expect(q.sql).toContain('IN ($2, $3)');
    expect(q.sql).toContain('wo_num >=');
    expect(q.params).toContain('WAPPR');
  });

  it('applies GROUP BY and ORDER BY', () => {
    const q = builder.buildQuery('work_orders', 't1', {
      groupBy: ['status'],
      orderBy: [{ field: 'status', direction: 'DESC' }],
    });
    expect(q.sql).toContain('GROUP BY status');
    expect(q.sql).toContain('ORDER BY status DESC');
  });
});
