import type { IntegrationAdapter, AdapterResult, TestResult } from './base.js';
import { isDryRun } from './base.js';

export interface JdbcConfig {
  connectionString: string;
  query?: string;
  dryRun?: boolean;
}

export class JdbcAdapter implements IntegrationAdapter {
  type = 'JDBC' as const;

  async test(config: unknown): Promise<TestResult> {
    const c = config as JdbcConfig;
    if (!c.connectionString) return { success: false, message: 'connectionString required' };
    if (isDryRun(config)) return { success: true, message: 'dry run' };
    try {
      const postgres = (await import('postgres')).default;
      const sql = postgres(c.connectionString, { max: 1 });
      await sql`SELECT 1 AS ok`;
      await sql.end({ timeout: 5 });
      return { success: true };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'jdbc connect failed' };
    }
  }

  async execute(config: unknown, payload: unknown): Promise<AdapterResult> {
    const c = config as JdbcConfig;
    if (!c.connectionString) return { success: false, error: 'connectionString required' };
    if (isDryRun(config)) return { success: true, data: { dryRun: true } };

    const query =
      c.query ??
      (typeof payload === 'object' && payload && 'query' in payload
        ? String((payload as { query: string }).query)
        : undefined);
    if (!query) return { success: false, error: 'query required in config or payload' };

    try {
      const postgres = (await import('postgres')).default;
      const sql = postgres(c.connectionString, { max: 1 });
      const rows = await sql.unsafe(query);
      await sql.end({ timeout: 5 });
      return { success: true, data: rows };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'jdbc query failed' };
    }
  }
}
