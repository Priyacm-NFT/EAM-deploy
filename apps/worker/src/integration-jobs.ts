import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { eq, and, isNotNull } from 'drizzle-orm';
import { db, integrationJobs } from '@eam/db';
import { globalEventBus } from '@eam/shared';
import { processDueIntegrationJobs, runIntegrationJob } from '@eam/integration-framework';

export function registerIntegrationJobHandlers(connection: Redis): void {
  const integrationQueue = new Queue('integration-jobs', { connection });

  new Worker(
    'integration-jobs',
    async (job) => {
      if (job.name === 'poll-due') {
        await processDueIntegrationJobs(db);
        return;
      }
      const { jobId, payload } = job.data as {
        jobId: string;
        payload?: Record<string, unknown>;
      };
      await runIntegrationJob(db, jobId, payload ?? {});
    },
    { connection },
  );

  void integrationQueue.add(
    'poll-due',
    {},
    { repeat: { pattern: '* * * * *' }, jobId: 'integration-jobs-poll' },
  );

  globalEventBus.onAny(async (eventType, raw) => {
    const payload = raw as Record<string, unknown>;
    const triggered = await db
      .select()
      .from(integrationJobs)
      .where(
        and(
          eq(integrationJobs.isActive, true),
          isNotNull(integrationJobs.triggerEvent),
          eq(integrationJobs.triggerEvent, eventType),
        ),
      );
    for (const job of triggered) {
      await integrationQueue.add('run-job', { jobId: job.id, payload });
    }
  });
}
