import { describe, it, expect } from 'vitest';
import { buildTableauSchema, paginateTableauData } from './tableau.js';

describe('Tableau adapter', () => {
  it('returns column schema', () => {
    const schema = buildTableauSchema([
      { key: 'wo_num', label: 'WO', type: 'text' },
      { key: 'total', label: 'Total', type: 'number' },
    ]);
    expect(schema.columns).toHaveLength(2);
    expect(schema.columns[1]!.dataType).toBe('int');
  });

  it('paginates data', () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({ id: i }));
    const page = paginateTableauData(rows, 2, 100);
    expect(page.data).toHaveLength(100);
    expect(page.total).toBe(250);
  });
});
