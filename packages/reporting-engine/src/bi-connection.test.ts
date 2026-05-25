import { describe, it, expect } from 'vitest';
import { tenantReportViewName, getBiConnectionInfo, tenantViewDdl } from './bi-connection.js';

describe('BI connection info', () => {
  it('builds tenant-scoped view names', () => {
    expect(tenantReportViewName('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'work_orders')).toBe(
      'rpt_tenant_aaaaaaaa_bbbb_cccc_dddd_eeeeeeeeeeee_work_orders',
    );
  });

  it('returns read-replica connection details', () => {
    const info = getBiConnectionInfo('tenant-1');
    expect(info.username).toBe('eam_reporting');
    expect(info.views.length).toBeGreaterThan(0);
    expect(info.jdbcUrl).toContain('postgresql');
  });

  it('generates safe tenant view DDL', () => {
    const ddl = tenantViewDdl('tenant-1', 'work_orders');
    expect(ddl).toContain('rpt_tenant_tenant_1_work_orders');
    expect(ddl).toContain("tenant_id = 'tenant-1'");
  });
});
