import type { BiAdapter, BiAdapterContext, BiAdapterResult } from './types.js';
import { rowsToCsv } from '../export.js';
import { uploadReportOutput } from '../storage.js';

// ── JDBC connection string ────────────────────────────────────────────────────

export function qlikJdbcConnectionString(tenantId: string): string {
  const host = process.env.REPORTING_DB_HOST ?? 'localhost';
  const port = process.env.REPORTING_DB_PORT ?? '5432';
  const db = process.env.REPORTING_DB_NAME ?? 'eam';
  return `jdbc:postgresql://${host}:${port}/${db}?user=eam_reporting&ssl=prefer&tenant=${tenantId}`;
}

// ── QVD-compatible CSV export ─────────────────────────────────────────────────

export async function exportQlikQvdCsv(
  tenantId: string,
  subjectId: string,
  rows: Record<string, unknown>[],
): Promise<{ outputKey: string; rowCount: number }> {
  const csv = rowsToCsv(rows, subjectId);
  const key = `bi/qlik/${tenantId}/${subjectId}/${Date.now()}.csv`;
  await uploadReportOutput(key, csv, 'text/csv');
  return { outputKey: key, rowCount: rows.length };
}

// ── JDBC data source connector ────────────────────────────────────────────────
// A thin wrapper that exercises the read-replica connection via pg client
// so the "test connection" route can validate credentials without needing
// the Java JDBC driver at runtime. The JDBC URL is returned for use in
// Qlik Sense when configuring a data connection in the Management Console.

export interface QlikJdbcConfig {
  /** Override the default JDBC URL if Qlik uses a different DB host */
  jdbcUrl?: string;
  /** Optional Qlik Sense app ID — stored for reference only */
  appId?: string;
  /** Optional Qlik Sense server URL — stored for reference only */
  host?: string;
}

async function pingReportingDb(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    // Dynamic import keeps pg out of tree-shaking when not used
    const postgres = (await import('postgres')).default;
    const url =
      process.env.READ_REPLICA_DATABASE_URL ??
      process.env.DATABASE_URL ??
      'postgresql://eam:eam@localhost:5432/eam';
    const sql = postgres(url, { max: 1, connect_timeout: 5 });
    try {
      await sql`SELECT 1`;
    } finally {
      await sql.end({ timeout: 3 });
    }
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export const qlikAdapter: BiAdapter = {
  type: 'QLIK',

  async testConnection(ctx: BiAdapterContext): Promise<BiAdapterResult> {
    const cfg = ctx.config as QlikJdbcConfig;

    // 1. Ping the underlying reporting DB to confirm connectivity
    const ping = await pingReportingDb();

    // 2. Build the JDBC URL that will be pasted into Qlik Sense Management Console
    const jdbcUrl = cfg.jdbcUrl ?? qlikJdbcConnectionString(ctx.tenantId);

    if (!ping.ok) {
      return {
        success: false,
        message: `Reporting database unreachable: ${ping.error ?? 'unknown error'}`,
        data: { jdbcUrl },
      };
    }

    return {
      success: true,
      message: `Reporting database reachable (${ping.latencyMs} ms). Copy the JDBC URL into Qlik Sense.`,
      data: {
        jdbcUrl,
        latencyMs: ping.latencyMs,
        appId: cfg.appId ?? null,
        qlikSenseHost: cfg.host ?? null,
        instructions: [
          '1. In Qlik Sense Management Console → Data connections → Create new',
          '2. Select JDBC connector and paste the jdbcUrl above',
          '3. Authenticate with the eam_reporting role credentials',
          '4. Select the tenant-scoped view (rpt_tenant_<uuid>_<table>) from the schema browser',
          '5. To export QVD: call POST /admin/reporting/bi/qlik/export/:subjectId',
        ],
      },
    };
  },
};
