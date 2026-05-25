import { Worker, Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { eq } from 'drizzle-orm';
import cronParser from 'cron-parser';
import { db, reportSchedules, reportDefinitions } from '@eam/db';
import {
  runReport,
  buildReportEmailJobs,
  type ReportDistribution,
} from '@eam/reporting-engine';

export const reportRunQueueName = 'report-run';
export const reportScheduleQueueName = 'report-schedule';

export function registerReportHandlers(
  connection: Redis,
  sendEmailQueue: Queue,
): { reportRunWorker: Worker; reportScheduleWorker: Worker; reportRunQueue: Queue } {
  const reportRunQueue = new Queue(reportRunQueueName, { connection });

  const reportRunWorker = new Worker(
    reportRunQueueName,
    async (job) => {
      const data = job.data as {
        reportId: string;
        tenantId: string;
        format: string;
        scheduleId?: string;
        skipIfEmpty?: boolean;
        distribution?: ReportDistribution;
      };

      const result = await runReport(db, {
        reportId: data.reportId,
        tenantId: data.tenantId,
        format: data.format,
        scheduleId: data.scheduleId,
        skipIfEmpty: data.skipIfEmpty,
      });

      if (result.status === 'SKIPPED' || !result.downloadUrl) return result;

      if (result.status === 'COMPLETED' && data.distribution) {
        const [report] = await db
          .select()
          .from(reportDefinitions)
          .where(eq(reportDefinitions.id, data.reportId))
          .limit(1);
        const emailJobs = buildReportEmailJobs(
          data.distribution,
          report?.name ?? 'Report',
          result.downloadUrl,
        );
        for (const emailJob of emailJobs) {
          await sendEmailQueue.add('send-email', emailJob);
        }
      }

      return result;
    },
    { connection },
  );

  const reportScheduleWorker = new Worker(
    reportScheduleQueueName,
    async (job) => {
      if (job.name === 'sync-schedule') {
        const { scheduleId } = job.data as { scheduleId: string };
        const [schedule] = await db
          .select()
          .from(reportSchedules)
          .where(eq(reportSchedules.id, scheduleId))
          .limit(1);
        if (!schedule?.isActive) return;
        await reportRunQueue.add('scheduled-run', {
          reportId: schedule.reportId,
          tenantId: schedule.tenantId,
          format: schedule.outputFormat,
          scheduleId: schedule.id,
          skipIfEmpty: schedule.skipIfEmpty,
          distribution: schedule.distribution as ReportDistribution,
        });
        return;
      }

      const schedules = await db
        .select()
        .from(reportSchedules)
        .where(eq(reportSchedules.isActive, true));

      const now = new Date();
      for (const schedule of schedules) {
        try {
          const interval = cronParser.parseExpression(schedule.cronExpr);
          const prev = interval.prev();
          if (schedule.lastRunAt && schedule.lastRunAt.getTime() >= prev.getTime()) {
            continue;
          }

          await reportRunQueue.add(
            'scheduled-run',
            {
              reportId: schedule.reportId,
              tenantId: schedule.tenantId,
              format: schedule.outputFormat,
              scheduleId: schedule.id,
              skipIfEmpty: schedule.skipIfEmpty,
              distribution: schedule.distribution as ReportDistribution,
            },
            { jobId: `scheduled-${schedule.id}-${prev.getTime()}` },
          );

          await db
            .update(reportSchedules)
            .set({ lastRunAt: now, nextRunAt: interval.next().toDate() })
            .where(eq(reportSchedules.id, schedule.id));
        } catch {
          /* invalid cron */
        }
      }
    },
    { connection },
  );

  return { reportRunWorker, reportScheduleWorker, reportRunQueue };
}

export async function startReportScheduleCron(connection: Redis): Promise<void> {
  const scheduleQueue = new Queue(reportScheduleQueueName, { connection });
  await scheduleQueue.add(
    'tick',
    {},
    { repeat: { pattern: '*/15 * * * *' }, jobId: 'report-schedule-tick' },
  );
}
