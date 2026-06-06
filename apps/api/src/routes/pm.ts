import type { FastifyInstance } from 'fastify';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import {
  db,
  pmMasters,
  pmForecasts,
  pmMeterTriggers,
  workOrders,
  assets,
  locations,
  sites,
  jobPlans,
  audit,
} from '@eam/db';
import { requirePermission } from '../plugins/auth.js';

const readGuard = { preHandler: requirePermission('pm:read') };
const writeGuard = { preHandler: requirePermission('pm:write') };

export async function pmRoutes(app: FastifyInstance) {

  // ─── PM Masters ───────────────────────────────────────────────────────────────

  app.get('/pm-masters', readGuard, async (request) => {
    const { status, siteId, assetId, frequencyType } = request.query as {
      status?: string;
      siteId?: string;
      assetId?: string;
      frequencyType?: string;
    };
    const tid = request.user!.tenantId;

    return db
      .select({
        id: pmMasters.id,
        pmNum: pmMasters.pmNum,
        description: pmMasters.description,
        status: pmMasters.status,
        frequencyType: pmMasters.frequencyType,
        interval: pmMasters.interval,
        intervalUnit: pmMasters.intervalUnit,
        nextDueDate: pmMasters.nextDueDate,
        leadDays: pmMasters.leadDays,
        priority: pmMasters.priority,
        isActive: pmMasters.isActive,
        updatedAt: pmMasters.updatedAt,
        assetNum: assets.assetNum,
        assetDescription: assets.description,
        locationName: locations.name,
        siteName: sites.name,
        jpDescription: jobPlans.description,
      })
      .from(pmMasters)
      .leftJoin(assets, eq(pmMasters.assetId, assets.id))
      .leftJoin(locations, eq(pmMasters.locationId, locations.id))
      .leftJoin(sites, eq(pmMasters.siteId, sites.id))
      .leftJoin(jobPlans, eq(pmMasters.jobPlanId, jobPlans.id))
      .where(
        and(
          eq(pmMasters.tenantId, tid),
          status
            ? eq(pmMasters.status, status as typeof pmMasters.$inferSelect.status)
            : undefined,
          siteId ? eq(pmMasters.siteId, siteId) : undefined,
          assetId ? eq(pmMasters.assetId, assetId) : undefined,
          frequencyType
            ? eq(
                pmMasters.frequencyType,
                frequencyType as typeof pmMasters.$inferSelect.frequencyType,
              )
            : undefined,
        ),
      )
      .orderBy(pmMasters.nextDueDate);
  });

  app.post('/pm-masters', writeGuard, async (request, reply) => {
    const body = request.body as {
      description: string;
      pmNum?: string;
      assetId?: string;
      locationId?: string;
      siteId?: string;
      jobPlanId?: string;
      frequencyType: string;
      interval?: number;
      intervalUnit?: string;
      seasonalMonth?: number;
      seasonalDay?: number;
      leadDays?: number;
      priority?: string;
      startDate?: string;
      meterTriggers?: Array<{ meterId: string; threshold: string; resetOnWo?: boolean }>;
    };
    const tid = request.user!.tenantId;

    const count = await db
      .select({ id: pmMasters.id })
      .from(pmMasters)
      .where(eq(pmMasters.tenantId, tid));
    const pmNum = body.pmNum ?? `PM-${String(count.length + 1).padStart(5, '0')}`;

    const nextDueDate = computeNextDueDate(
      body.frequencyType,
      body.interval,
      body.intervalUnit,
      body.seasonalMonth,
      body.seasonalDay,
      body.startDate ? new Date(body.startDate) : new Date(),
    );

    const [row] = await db
      .insert(pmMasters)
      .values({
        tenantId: tid,
        pmNum,
        description: body.description,
        assetId: body.assetId,
        locationId: body.locationId,
        siteId: body.siteId,
        jobPlanId: body.jobPlanId,
        frequencyType: body.frequencyType as typeof pmMasters.$inferInsert.frequencyType,
        interval: body.interval,
        intervalUnit: body.intervalUnit as typeof pmMasters.$inferInsert.intervalUnit,
        seasonalMonth: body.seasonalMonth,
        seasonalDay: body.seasonalDay,
        leadDays: body.leadDays ?? 7,
        nextDueDate,
        priority: (body.priority ?? 'MEDIUM') as typeof pmMasters.$inferInsert.priority,
      })
      .returning();

    if (body.meterTriggers?.length) {
      for (const mt of body.meterTriggers) {
        await db.insert(pmMeterTriggers).values({
          pmId: row!.id,
          meterId: mt.meterId,
          threshold: mt.threshold,
          resetOnWo: mt.resetOnWo ?? true,
        });
      }
    }

    await audit(db, {
      tenantId: tid,
      userId: request.user!.id,
      action: 'CREATE',
      resource: 'PMaster',
      resourceId: row!.id,
    });
    return reply.code(201).send(row);
  });

  app.get('/pm-masters/:id', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    const [pm] = await db
      .select()
      .from(pmMasters)
      .where(and(eq(pmMasters.id, id), eq(pmMasters.tenantId, tid)))
      .limit(1);
    if (!pm) return reply.code(404).send({ error: 'PM not found' });

    const triggers = await db
      .select()
      .from(pmMeterTriggers)
      .where(eq(pmMeterTriggers.pmId, id));

    const recentForecasts = await db
      .select()
      .from(pmForecasts)
      .where(eq(pmForecasts.pmId, id))
      .orderBy(desc(pmForecasts.forecastDate))
      .limit(12);

    return { ...pm, meterTriggers: triggers, recentForecasts };
  });

  app.put('/pm-masters/:id', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof pmMasters.$inferInsert>;
    const tid = request.user!.tenantId;

    if (body.frequencyType || body.interval || body.intervalUnit) {
      const [current] = await db
        .select()
        .from(pmMasters)
        .where(and(eq(pmMasters.id, id), eq(pmMasters.tenantId, tid)))
        .limit(1);
      if (current) {
        body.nextDueDate = computeNextDueDate(
          String(body.frequencyType ?? current.frequencyType),
          body.interval ?? current.interval ?? undefined,
          String(body.intervalUnit ?? current.intervalUnit ?? ''),
          body.seasonalMonth ?? current.seasonalMonth ?? undefined,
          body.seasonalDay ?? current.seasonalDay ?? undefined,
          new Date(),
        );
      }
    }

    const [row] = await db
      .update(pmMasters)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(pmMasters.id, id), eq(pmMasters.tenantId, tid)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'PM not found' });
    return row;
  });

  app.delete('/pm-masters/:id', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;
    await db
      .update(pmMasters)
      .set({ isActive: false, status: 'INACTIVE', updatedAt: new Date() })
      .where(and(eq(pmMasters.id, id), eq(pmMasters.tenantId, tid)));
    return reply.code(204).send();
  });

  // ─── PM Forecast ──────────────────────────────────────────────────────────────

  app.get('/pm-masters/:id/forecast', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    const { horizon } = request.query as { horizon?: string };
    const horizonDays = parseInt(horizon ?? '90');

    const [pm] = await db
      .select()
      .from(pmMasters)
      .where(eq(pmMasters.id, id))
      .limit(1);
    if (!pm) return [];

    const forecasts = await db
      .select()
      .from(pmForecasts)
      .where(and(eq(pmForecasts.pmId, id)))
      .orderBy(pmForecasts.forecastDate)
      .limit(20);

    const projections = generateProjections(pm, horizonDays);
    return { existing: forecasts, projected: projections };
  });

  app.post('/pm-masters/:id/generate-now', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    const [pm] = await db
      .select()
      .from(pmMasters)
      .where(and(eq(pmMasters.id, id), eq(pmMasters.tenantId, tid)))
      .limit(1);
    if (!pm) return reply.code(404).send({ error: 'PM not found' });
    if (!pm.jobPlanId)
      return reply
        .code(400)
        .send({ error: 'PM must have a job plan to generate a work order' });

    const wo = await generatePmWorkOrder(pm, tid);
    return reply.code(201).send(wo);
  });

  // ─── Global Forecast Calendar ─────────────────────────────────────────────────

  app.get('/pm-forecasts', readGuard, async (request) => {
    const { from, to, siteId } = request.query as {
      from?: string;
      to?: string;
      siteId?: string;
    };
    const tid = request.user!.tenantId;

    const fromDate = from ? new Date(from) : new Date();
    const toDate = to ? new Date(to) : new Date(Date.now() + 90 * 86400000);

    return db
      .select({
        id: pmForecasts.id,
        pmId: pmForecasts.pmId,
        forecastDate: pmForecasts.forecastDate,
        status: pmForecasts.status,
        woId: pmForecasts.woId,
        pmNum: pmMasters.pmNum,
        pmDescription: pmMasters.description,
        assetNum: assets.assetNum,
        siteName: sites.name,
      })
      .from(pmForecasts)
      .innerJoin(pmMasters, eq(pmForecasts.pmId, pmMasters.id))
      .leftJoin(assets, eq(pmMasters.assetId, assets.id))
      .leftJoin(sites, eq(pmMasters.siteId, sites.id))
      .where(
        and(
          eq(pmForecasts.tenantId, tid),
          gte(pmForecasts.forecastDate, fromDate),
          lte(pmForecasts.forecastDate, toDate),
          siteId ? eq(pmMasters.siteId, siteId) : undefined,
        ),
      )
      .orderBy(pmForecasts.forecastDate);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeNextDueDate(
  frequencyType: string,
  interval?: number,
  intervalUnit?: string,
  seasonalMonth?: number,
  seasonalDay?: number,
  baseDate: Date = new Date(),
): Date {
  const d = new Date(baseDate);

  if (frequencyType === 'SEASONAL') {
    const year =
      seasonalMonth && d.getMonth() + 1 > seasonalMonth
        ? d.getFullYear() + 1
        : d.getFullYear();
    return new Date(year, (seasonalMonth ?? 1) - 1, seasonalDay ?? 1);
  }

  if (frequencyType === 'CALENDAR' || frequencyType === 'CALENDAR_AND_METER') {
    if (!interval) return d;
    switch (intervalUnit) {
      case 'HOUR':  d.setHours(d.getHours() + interval);      break;
      case 'DAY':   d.setDate(d.getDate() + interval);         break;
      case 'WEEK':  d.setDate(d.getDate() + interval * 7);     break;
      case 'MONTH': d.setMonth(d.getMonth() + interval);       break;
      case 'YEAR':  d.setFullYear(d.getFullYear() + interval); break;
      default:      d.setDate(d.getDate() + interval);         break;
    }
  }

  return d;
}

function generateProjections(
  pm: typeof pmMasters.$inferSelect,
  horizonDays: number,
): Date[] {
  if (
    !['CALENDAR', 'CALENDAR_AND_METER'].includes(pm.frequencyType) ||
    !pm.interval
  )
    return [];

  const dates: Date[] = [];
  const endDate = new Date(Date.now() + horizonDays * 86400000);
  let d = pm.nextDueDate ? new Date(pm.nextDueDate) : new Date();

  while (d <= endDate && dates.length < 50) {
    dates.push(new Date(d));
    const next = computeNextDueDate(
      pm.frequencyType,
      pm.interval,
      pm.intervalUnit ?? undefined,
      undefined,
      undefined,
      d,
    );
    if (next.getTime() === d.getTime()) break;
    d = next;
  }

  return dates;
}

export async function generatePmWorkOrder(
  pm: typeof pmMasters.$inferSelect,
  tenantId: string,
): Promise<typeof workOrders.$inferSelect> {

  // 1. Compute the scheduled date
  const scheduledDate: Date =
    pm.nextDueDate
      ? new Date(pm.nextDueDate)
      : computeNextDueDate(
          pm.frequencyType,
          pm.interval ?? undefined,
          pm.intervalUnit ?? undefined,
          pm.seasonalMonth ?? undefined,
          pm.seasonalDay ?? undefined,
          new Date(),
        );

  // 2. Generate WO number
  const count = await db
    .select({ id: workOrders.id })
    .from(workOrders)
    .where(eq(workOrders.tenantId, tenantId));
  const woNum = `WO-${String(count.length + 1).padStart(6, '0')}`;

  // 3. Insert Work Order
  const [wo] = await db
    .insert(workOrders)
    .values({
      tenantId,
      woNum,
      description: `PM: ${pm.description}`,
      type: 'PM',
      priority: pm.priority ?? 'MEDIUM',
      assetId: pm.assetId,
      locationId: pm.locationId,
      siteId: pm.siteId,
      pmId: pm.id,
      jobPlanId: pm.jobPlanId,
      targetFinishDate: scheduledDate,
    })
    .returning();

  // 4. Insert PM Forecast
  // forecastDate is the Drizzle field name (maps to forecast_date in DB)
  // scheduled_date auto-fills via DB default (ALTER TABLE pm_forecasts ALTER COLUMN scheduled_date SET DEFAULT now())
  await db.insert(pmForecasts).values({
    pmId: pm.id,
    tenantId,
    forecastDate: scheduledDate,
    status: 'GENERATED',
    woId: wo!.id,
  });

  // 5. Advance nextDueDate on PM master
  const newNext = computeNextDueDate(
    pm.frequencyType,
    pm.interval ?? undefined,
    pm.intervalUnit ?? undefined,
    pm.seasonalMonth ?? undefined,
    pm.seasonalDay ?? undefined,
    scheduledDate,
  );

  await db
    .update(pmMasters)
    .set({
      lastWoId: wo!.id,
      lastGeneratedAt: new Date(),
      nextDueDate: newNext,
      updatedAt: new Date(),
    })
    .where(eq(pmMasters.id, pm.id));

  return wo!;
}