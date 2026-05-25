import { ALLOWED_TABLES } from './query-builder.js';

export function tenantReportViewName(tenantId: string, subject: string): string {
  const safeTenant = tenantId.replace(/-/g, '_');
  return `rpt_tenant_${safeTenant}_${subject}`;
}

export interface BiConnectionInfo {
  host: string;
  port: number;
  database: string;
  username: string;
  schema: string;
  ssl: boolean;
  views: { name: string; subject: string }[];
  jdbcUrl: string;
  directQueryNote: string;
}

export function getBiConnectionInfo(tenantId: string): BiConnectionInfo {
  const host = process.env.REPORTING_DB_HOST ?? 'localhost';
  const port = Number(process.env.REPORTING_DB_PORT ?? 5432);
  const database = process.env.REPORTING_DB_NAME ?? 'eam';
  const username = process.env.REPORTING_DB_USER ?? 'eam_reporting';
  const schema = process.env.REPORTING_DB_SCHEMA ?? 'public';
  const ssl = process.env.REPORTING_DB_SSL === 'true';

  const views = [...ALLOWED_TABLES].map((subject) => ({
    name: tenantReportViewName(tenantId, subject),
    subject,
  }));

  const jdbcUrl = `jdbc:postgresql://${host}:${port}/${database}?user=${username}&ssl=${ssl}`;

  return {
    host,
    port,
    database,
    username,
    schema,
    ssl,
    views,
    jdbcUrl,
    directQueryNote:
      'Connect with the eam_reporting role (SELECT only). Use tenant-scoped views listed in views[].',
  };
}

export function tenantViewDdl(tenantId: string, subject: string): string {
  const viewName = tenantReportViewName(tenantId, subject);
  return `CREATE OR REPLACE VIEW ${viewName} AS SELECT * FROM ${subject} WHERE tenant_id = '${tenantId}'`;
}
