import cronParser from 'cron-parser';
import { and, eq, lte, isNotNull } from 'drizzle-orm';
import type { Database } from '@eam/db';
import {
  integrationConnections,
  integrationJobs,
  integrationRunLog,
} from '@eam/db';
import { getAdapter } from './registry.js';

export function computeNextRun(cronExpr: string, from: Date = new Date()): Date {
  const interval = cronParser.parseExpression(cronExpr, { currentDate: from });
  return interval.next().toDate();
}

export async function runIntegrationJob(
  db: Database,
  jobId: string,
  payload: Record<string, unknown> = {},
): Promise<{ success: boolean; runLogId: string; error?: string }> {
  const [job] = await db.select().from(integrationJobs).where(eq(integrationJobs.id, jobId)).limit(1);
  if (!job || !job.isActive) {
    return { success: false, runLogId: '', error: 'Job not found or inactive' };
  }

  const [conn] = await db
    .select()
    .from(integrationConnections)
    .where(eq(integrationConnections.id, job.connectionId))
    .limit(1);
  if (!conn || !conn.isActive) {
    return { success: false, runLogId: '', error: 'Connection not found or inactive' };
  }

  const [logRow] = await db
    .insert(integrationRunLog)
    .values({ jobId: job.id, status: 'RUNNING' })
    .returning({ id: integrationRunLog.id });

  const adapter = getAdapter(conn.adapterType);
  if (!adapter) {
    await db
      .update(integrationRunLog)
      .set({
        status: 'FAILED',
        errorDetails: [{ message: `Unsupported adapter: ${conn.adapterType}` }],
        finishedAt: new Date(),
      })
      .where(eq(integrationRunLog.id, logRow.id));
    return { success: false, runLogId: logRow.id, error: 'Unsupported adapter' };
  }

  const jobPayload = {
    jobType: job.jobType,
    mappingConfig: job.mappingConfig ?? {},
    ...payload,
  };

  const result = await adapter.execute(conn.config, jobPayload);
  const now = new Date();
  const nextRunAt = job.scheduleCron ? computeNextRun(job.scheduleCron, now) : job.nextRunAt;

  await db
    .update(integrationRunLog)
    .set({
      status: result.success ? 'SUCCESS' : 'FAILED',
      recordsProcessed: result.success ? 1 : 0,
      recordsFailed: result.success ? 0 : 1,
      errorDetails: result.success ? [] : [{ message: result.error ?? 'unknown' }],
      finishedAt: now,
    })
    .where(eq(integrationRunLog.id, logRow.id));

  await db
    .update(integrationJobs)
    .set({
      lastRunAt: now,
      nextRunAt,
    })
    .where(eq(integrationJobs.id, job.id));

  return {
    success: result.success,
    runLogId: logRow.id,
    error: result.error,
  };
}

export async function processDueIntegrationJobs(db: Database): Promise<number> {
  const now = new Date();
  const due = await db
    .select()
    .from(integrationJobs)
    .where(
      and(
        eq(integrationJobs.isActive, true),
        isNotNull(integrationJobs.scheduleCron),
        isNotNull(integrationJobs.nextRunAt),
        lte(integrationJobs.nextRunAt, now),
      ),
    );

  let processed = 0;
  for (const job of due) {
    await runIntegrationJob(db, job.id);
    processed++;
  }
  return processed;
}

export async function scheduleIntegrationJob(
  db: Database,
  jobId: string,
  cronExpr: string,
): Promise<void> {
  const nextRunAt = computeNextRun(cronExpr);
  await db
    .update(integrationJobs)
    .set({ scheduleCron: cronExpr, nextRunAt })
    .where(eq(integrationJobs.id, jobId));
}
