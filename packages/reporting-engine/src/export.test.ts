import { describe, it, expect } from 'vitest';
import { rowsToCsv, formatReportOutput } from './export.js';

describe('report export', () => {
  const rows = [
    { wo_num: 'WO-1', status: 'WAPPR' },
    { wo_num: 'WO-2', status: 'INPRG' },
  ];

  it('generates CSV with headers', () => {
    const csv = rowsToCsv(rows, 'Work Orders');
    expect(csv).toContain('wo_num,status');
    expect(csv).toContain('WO-1');
  });

  it('generates XLSX buffer', async () => {
    const out = await formatReportOutput(rows, 'xlsx', 'Work Orders');
    expect(out.contentType).toContain('spreadsheet');
    expect(Buffer.isBuffer(out.body)).toBe(true);
    expect((out.body as Buffer).length).toBeGreaterThan(100);
  });

  it('generates PDF buffer', async () => {
    const out = await formatReportOutput(rows, 'pdf', 'Work Orders');
    expect(out.contentType).toBe('application/pdf');
    expect((out.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });
});
