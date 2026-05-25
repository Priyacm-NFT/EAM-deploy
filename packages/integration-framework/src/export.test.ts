import { describe, it, expect } from 'vitest';
import { rowsToCsv, rowsToJson } from './export.js';

describe('bulk export', () => {
  it('serializes rows to CSV', () => {
    const csv = rowsToCsv([
      { id: '1', name: 'Alpha' },
      { id: '2', name: 'Beta, Inc' },
    ]);
    expect(csv).toContain('id,name');
    expect(csv).toContain('"Beta, Inc"');
  });

  it('serializes rows to JSON', () => {
    const json = rowsToJson([{ id: '1' }]);
    expect(JSON.parse(json)).toEqual([{ id: '1' }]);
  });
});
