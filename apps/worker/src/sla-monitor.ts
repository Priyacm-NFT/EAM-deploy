import type { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { eq, and, lt, isNull } from 'drizzle-orm';
import { db, serviceRequests } from '@eam/db';
import { globalEventBus } from '@eam/shared';

export function startSlaMonitorCron(connection: Redis): void {
  const queue = new Queue('sla-monitor', { connection });

  queue.add('cron-sla-check', {}, {
    repeat: { pattern: '*/15 * * * *' },
    jobId: 'sla-monitor-cron',
  });
}

export async function runSlaCheck(): Promise<{ breached: number }> {
  const now = new Date();

  // Find SRs that are past SLA due and not yet marked breached, and still open
  const toBreech = await db.select({ id: serviceRequests.id, tenantId: serviceRequests.tenantId })
    .from(serviceRequests)
    .where(
      and(
        lt(serviceRequests.slaDueAt, now),
        eq(serviceRequests.slaBreached, false),
        isNull(serviceRequests.closedAt),
      ),
    );

  for (const sr of toBreech) {
    await db.update(serviceRequests)
      .set({ slaBreached: true })
      .where(eq(serviceRequests.id, sr.id));

    await globalEventBus.emit('SR_SLA_BREACHED', { srId: sr.id, tenantId: sr.tenantId });
  }

  return { breached: toBreech.length };
}
