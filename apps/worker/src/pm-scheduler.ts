import type { Redis } from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { eq, and, lte } from 'drizzle-orm';
import { db, pmMasters, workOrders, pmForecasts } from '@eam/db';

async function generatePmWorkOrder(pm: typeof pmMasters.$inferSelect): Promise<void> {
  if (!pm.jobPlanId) return;
  const count = await db.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.tenantId, pm.tenantId));
  const woNum = `WO-${String(count.length + 1).padStart(6, '0')}`;

  const [wo] = await db.insert(workOrders).values({
    tenantId: pm.tenantId,
    woNum,
    description: `PM: ${pm.description}`,
    type: 'PM',
    priority: pm.priority ?? 'MEDIUM',
    assetId: pm.assetId ?? undefined,
    locationId: pm.locationId ?? undefined,
    siteId: pm.siteId ?? undefined,
    pmId: pm.id,
    jobPlanId: pm.jobPlanId,
    targetFinishDate: pm.nextDueDate,
  }).returning();

  await db.insert(pmForecasts).values({
    pmId: pm.id,
    tenantId: pm.tenantId,
    forecastDate: pm.nextDueDate ?? new Date(),
    status: 'GENERATED',
    woId: wo!.id,
  });

  // Advance nextDueDate
  const d = new Date(pm.nextDueDate ?? new Date());
  if (['CALENDAR', 'CALENDAR_AND_METER'].includes(pm.frequencyType) && pm.interval && pm.intervalUnit) {
    switch (pm.intervalUnit) {
      case 'DAY': d.setDate(d.getDate() + pm.interval); break;
      case 'WEEK': d.setDate(d.getDate() + pm.interval * 7); break;
      case 'MONTH': d.setMonth(d.getMonth() + pm.interval); break;
      case 'YEAR': d.setFullYear(d.getFullYear() + pm.interval); break;
    }
  }

  await db.update(pmMasters).set({ lastWoId: wo!.id, lastGeneratedAt: new Date(), nextDueDate: d, updatedAt: new Date() }).where(eq(pmMasters.id, pm.id));
}

export function startPmSchedulerCron(connection: Redis): void {
  const queue = new Queue('pm-scheduler', { connection });

  queue.add('cron-pm-generate', {}, {
    repeat: { pattern: '0 1 * * *' },
    jobId: 'pm-scheduler-cron',
  });

  new Worker(
    'pm-scheduler',
    async () => {
      await runPmGeneration();
    },
    { connection },
  );
}

export async function runPmGeneration(): Promise<{ generated: number }> {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  // Find all active PMs where nextDueDate <= today - leadDays
  const dueMs = await db.select().from(pmMasters)
    .where(
      and(
        eq(pmMasters.isActive, true),
        lte(pmMasters.nextDueDate, today),
      ),
    );

  let generated = 0;
  for (const pm of dueMs) {
    if (!pm.jobPlanId) continue;
    try {
      await generatePmWorkOrder(pm);
      generated++;
    } catch {
      // Log but continue with other PMs
    }
  }

  return { generated };
}
