import type { Database } from '@eam/db';
import { eq } from 'drizzle-orm';
import { reportDefinitions, reportRunLog, reportSubjects } from '@eam/db';
import postgres from 'postgres';
import { ReportQueryBuilder } from './query-builder.js';
import { formatReportOutput, outputFormatToExport } from './export.js';
import {
  buildReportOutputKey,
  presignReportDownload,
  uploadReportOutput,
} from './storage.js';
import type { ReportDefinitionBody, ReportRunResult } from './types.js';

export interface RunReportOptions {
  reportId: string;
  tenantId: string;
  userId?: string;
  format: string;
  scheduleId?: string;
  limit?: number;
  skipIfEmpty?: boolean;
}

function readReplicaUrl(): string {
  return (
    process.env.READ_REPLICA_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgresql://eam:eam@localhost:5432/eam'
  );
}

export async function executeReportQuery(
  sql: string,
  params: unknown[],
  limit?: number,
): Promise<Record<string, unknown>[]> {
  const sqlClient = postgres(readReplicaUrl(), { max: 1 });
  try {
    const query = limit ? `${sql} LIMIT ${limit}` : sql;
    const rows = await sqlClient.unsafe(query, params as never[]);
    return rows as Record<string, unknown>[];
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}

export async function runReport(
  db: Database,
  options: RunReportOptions,
): Promise<ReportRunResult> {
  const [report] = await db
    .select()
    .from(reportDefinitions)
    .where(eq(reportDefinitions.id, options.reportId))
    .limit(1);

  if (!report || report.tenantId !== options.tenantId) {
    throw new Error('Report not found');
  }

  const [subject] = await db
    .select()
    .from(reportSubjects)
    .where(eq(reportSubjects.id, report.subjectId))
    .limit(1);

  if (!subject) throw new Error('Report subject not found');

  const definition = report.definition as ReportDefinitionBody;
  const builder = new ReportQueryBuilder();
  const safeQuery = builder.buildQuery(subject.name, options.tenantId, {
    fields: definition.fields,
    filters: definition.filters,
    groupBy: definition.groupBy,
    orderBy: definition.orderBy,
  });

  const [runLog] = await db
    .insert(reportRunLog)
    .values({
      reportId: options.reportId,
      scheduleId: options.scheduleId ?? null,
      status: 'RUNNING',
    })
    .returning();

  const runLogId = runLog!.id;

  try {
    const rows = await executeReportQuery(
      safeQuery.sql,
      safeQuery.params,
      options.limit,
    );
    const rowCount = rows.length;

    if (options.skipIfEmpty && rowCount === 0) {
      await db
        .update(reportRunLog)
        .set({
          status: 'SKIPPED',
          rowCount: 0,
          finishedAt: new Date(),
        })
        .where(eq(reportRunLog.id, runLogId));
      return { runLogId, status: 'SKIPPED', rowCount: 0 };
    }

    const exportFormat = outputFormatToExport(options.format);
    const formatted = await formatReportOutput(rows, exportFormat, report.name);
    const outputKey = buildReportOutputKey(
      options.tenantId,
      options.reportId,
      runLogId,
      formatted.extension,
    );
    await uploadReportOutput(
      outputKey,
      formatted.body,
      formatted.contentType,
    );
    const downloadUrl = await presignReportDownload(outputKey);

    await db
      .update(reportRunLog)
      .set({
        status: 'COMPLETED',
        rowCount,
        outputKey,
        finishedAt: new Date(),
      })
      .where(eq(reportRunLog.id, runLogId));

    return { runLogId, status: 'COMPLETED', rowCount, outputKey, downloadUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(reportRunLog)
      .set({
        status: 'FAILED',
        error: message,
        finishedAt: new Date(),
      })
      .where(eq(reportRunLog.id, runLogId));
    return { runLogId, status: 'FAILED', rowCount: 0, error: message };
  }
}

export async function previewReport(
  db: Database,
  reportId: string,
  tenantId: string,
  previewLimit = 50,
): Promise<{ query: { sql: string; params: unknown[] }; rows: Record<string, unknown>[] }> {
  const [report] = await db
    .select()
    .from(reportDefinitions)
    .where(eq(reportDefinitions.id, reportId))
    .limit(1);

  if (!report || report.tenantId !== tenantId) {
    throw new Error('Report not found');
  }

  const [subject] = await db
    .select()
    .from(reportSubjects)
    .where(eq(reportSubjects.id, report.subjectId))
    .limit(1);

  if (!subject) throw new Error('Report subject not found');

  const definition = report.definition as ReportDefinitionBody;
  const builder = new ReportQueryBuilder();
  const query = builder.buildQuery(subject.name, tenantId, {
    fields: definition.fields,
    filters: definition.filters,
    groupBy: definition.groupBy,
    orderBy: definition.orderBy,
  });

  const rows = await executeReportQuery(query.sql, query.params, previewLimit);
  return { query, rows };
}
