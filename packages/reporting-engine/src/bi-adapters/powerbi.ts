import type { BiAdapter, BiAdapterContext, BiAdapterResult } from './types.js';

export interface PowerBiPushConfig {
  datasetId?: string;
  pushUrl?: string;
  accessToken?: string;
}

export async function pushPowerBiRows(
  config: PowerBiPushConfig,
  rows: Record<string, unknown>[],
): Promise<BiAdapterResult> {
  const pushUrl = config.pushUrl ?? process.env.POWERBI_PUSH_URL;
  if (!pushUrl) {
    return {
      success: true,
      message: 'Power BI push skipped (no push URL configured)',
      data: { rowCount: rows.length },
    };
  }

  const res = await fetch(pushUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.accessToken ? { Authorization: `Bearer ${config.accessToken}` } : {}),
    },
    body: JSON.stringify({ rows }),
  });

  if (!res.ok) {
    return { success: false, message: `Power BI push failed: ${res.status}` };
  }
  return { success: true, message: 'Power BI dataset updated', data: { rowCount: rows.length } };
}

export const powerBiAdapter: BiAdapter = {
  type: 'POWERBI',
  async testConnection(ctx: BiAdapterContext): Promise<BiAdapterResult> {
    const cfg = ctx.config as PowerBiPushConfig;
    if (cfg.pushUrl || process.env.POWERBI_PUSH_URL) {
      return { success: true, message: 'Power BI push endpoint configured' };
    }
    return {
      success: true,
      message: 'Power BI Direct Query — use PostgreSQL connector with eam_reporting credentials',
      data: { mode: 'direct_query' },
    };
  },
};

export function powerBiDirectQueryConnectionString(tenantId: string): string {
  const host = process.env.REPORTING_DB_HOST ?? 'localhost';
  const port = process.env.REPORTING_DB_PORT ?? '5432';
  const db = process.env.REPORTING_DB_NAME ?? 'eam';
  return `Host=${host};Port=${port};Database=${db};Username=eam_reporting;SSL Mode=Prefer;TenantId=${tenantId}`;
}
