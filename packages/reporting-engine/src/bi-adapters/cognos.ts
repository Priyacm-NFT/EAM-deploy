import type { BiAdapter, BiAdapterContext, BiAdapterResult } from './types.js';
import { getBiConnectionInfo } from '../bi-connection.js';

// ── Cognos Framework Manager configuration ────────────────────────────────────
// Cognos uses Framework Manager (FM) to build query subjects on top of the
// EAM reporting replica. This function returns the JDBC data source config
// plus a sample report package descriptor that can be imported into FM.

export interface CognosConfig {
  /** Cognos Gateway URL — e.g. https://cognos.example.com/ibmcognos/bi */
  gatewayUrl?: string;
  /** Cognos namespace / authentication namespace id */
  namespace?: string;
}

export function cognosFrameworkManagerConfig(tenantId: string) {
  const info = getBiConnectionInfo(tenantId);

  return {
    jdbcDataSource: {
      driver: 'org.postgresql.Driver',
      url: info.jdbcUrl,
      username: info.username,
      password: '(configure in Cognos Administration)',
      isolationLevel: 'repeatableRead',
      description: `EAM Platform read replica — tenant ${tenantId}`,
    },
    querySubjects: info.views.map((v) => ({
      name: v.subject,
      sqlDefinition: `SELECT * FROM ${v.name}`,
      comment: `Tenant-scoped view for ${v.subject}. Row-level security enforced by view definition.`,
    })),
    samplePackageDescriptor: {
      name: `EAM_${tenantId.slice(0, 8)}`,
      description: 'EAM Platform operational reporting package',
      dataSource: info.host,
      createdBy: 'EAM Platform — auto-generated',
      querySubjectCount: info.views.length,
    },
    connectionInfo: info,
  };
}

// ── JDBC connection tester ────────────────────────────────────────────────────

async function pingReportingDb(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
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

export const cognosAdapter: BiAdapter = {
  type: 'COGNOS',

  async testConnection(ctx: BiAdapterContext): Promise<BiAdapterResult> {
    const cfg = ctx.config as CognosConfig;

    const ping = await pingReportingDb();
    const fmConfig = cognosFrameworkManagerConfig(ctx.tenantId);

    if (!ping.ok) {
      return {
        success: false,
        message: `Reporting database unreachable: ${ping.error ?? 'unknown error'}`,
        data: fmConfig,
      };
    }

    return {
      success: true,
      message: `Reporting database reachable (${ping.latencyMs} ms). Framework Manager config ready.`,
      data: {
        ...fmConfig,
        latencyMs: ping.latencyMs,
        cognosGateway: cfg.gatewayUrl ?? '(not configured)',
        namespace: cfg.namespace ?? 'CognosEx',
        instructions: [
          '1. In Cognos Framework Manager → Create new project',
          '2. Add a data source using the jdbcDataSource config above',
          '3. Import querySubjects from the config into the FM project',
          '4. Publish the package to Content Manager',
          '5. Build reports in Cognos Analytics against the EAM package',
          '6. Row-level security is enforced by the tenant-scoped views — no additional filtering needed',
        ],
      },
    };
  },
};
