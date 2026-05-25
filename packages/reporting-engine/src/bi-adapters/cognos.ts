import type { BiAdapter, BiAdapterContext, BiAdapterResult } from './types.js';
import { getBiConnectionInfo } from '../bi-connection.js';

export function cognosFrameworkManagerConfig(tenantId: string) {
  const info = getBiConnectionInfo(tenantId);
  return {
    host: info.host,
    port: info.port,
    database: info.database,
    schema: info.schema,
    username: info.username,
    jdbcUrl: info.jdbcUrl,
    tenantViews: info.views,
  };
}

export const cognosAdapter: BiAdapter = {
  type: 'COGNOS',
  async testConnection(ctx: BiAdapterContext): Promise<BiAdapterResult> {
    return {
      success: true,
      message: 'Cognos JDBC configuration available',
      data: cognosFrameworkManagerConfig(ctx.tenantId),
    };
  },
};
