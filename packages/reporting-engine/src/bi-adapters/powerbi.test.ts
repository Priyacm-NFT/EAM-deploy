import { describe, it, expect } from 'vitest';
import { powerBiDirectQueryConnectionString } from './powerbi.js';

describe('Power BI adapter', () => {
  it('builds direct query connection string', () => {
    const cs = powerBiDirectQueryConnectionString('tenant-abc');
    expect(cs).toContain('eam_reporting');
    expect(cs).toContain('tenant-abc');
  });
});
