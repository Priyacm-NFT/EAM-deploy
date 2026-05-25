import type { BiAdapter, BiAdapterContext, BiAdapterResult } from './types.js';
import { rowsToCsv } from '../export.js';
import { uploadReportOutput } from '../storage.js';

export function qlikJdbcConnectionString(tenantId: string): string {
  const host = process.env.REPORTING_DB_HOST ?? 'localhost';
  const port = process.env.REPORTING_DB_PORT ?? '5432';
  const db = process.env.REPORTING_DB_NAME ?? 'eam';
  return `jdbc:postgresql://${host}:${port}/${db}?user=eam_reporting&tenant=${tenantId}`;
}

export async function exportQlikQvdCsv(
  tenantId: string,
  subjectId: string,
  rows: Record<string, unknown>[],
): Promise<{ outputKey: string }> {
  const csv = rowsToCsv(rows, subjectId);
  const key = `bi/qlik/${tenantId}/${subjectId}/${Date.now()}.csv`;
  await uploadReportOutput(key, csv, 'text/csv');
  return { outputKey: key };
}

export const qlikAdapter: BiAdapter = {
  type: 'QLIK',
  async testConnection(ctx: BiAdapterContext): Promise<BiAdapterResult> {
    return {
      success: true,
      message: 'Qlik JDBC connection string ready',
      data: { jdbcUrl: qlikJdbcConnectionString(ctx.tenantId) },
    };
  },
};
