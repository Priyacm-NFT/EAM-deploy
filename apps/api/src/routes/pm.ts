import type { FastifyInstance } from 'fastify';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import {
  db,
  pmMasters,
  pmForecasts,
  pmMeterTriggers,
  pmRouteMasters,
  pmRouteAssets,
  workOrders,
  woTasks,
  assets,
  locations,
  sites,
  jobPlans,
  audit,
} from '@eam/db';
import { validateCustomFields } from '../lib/entity-fields.js';
import { requirePermission } from '../plugins/auth.js';
import { nextAutoRecordCode } from '@eam/shared';

const readGuard = { preHandler: requirePermission('pm:read') };
const writeGuard = { preHandler: requirePermission('pm:write') };

export async function pmRoutes(app: FastifyInstance) {

  // ─── PM Routes (P1-5 gap — AC-P1-5.7) ───────────────────────────────────────
  // "Route PM generates a single WO covering all route assets." These
  // are the CRUD routes the PRD's API surface names explicitly
  // (POST /pm-routes — "Create route-based PM (many assets, one visit)").

  app.get('/pm-routes', readGuard, async (request) => {
    const tid = request.user!.tenantId;
    const routesList = await db.select().from(pmRouteMasters).where(eq(pmRouteMasters.tenantId, tid)).orderBy(pmRouteMasters.name);
    const counts = await db
      .select({ routeId: pmRouteAssets.routeId, id: pmRouteAssets.id })
      .from(pmRouteAssets)
      .innerJoin(pmRouteMasters, eq(pmRouteMasters.id, pmRouteAssets.routeId))
      .where(eq(pmRouteMasters.tenantId, tid));
    const countByRoute = new Map<string, number>();
    for (const c of counts) countByRoute.set(c.routeId, (countByRoute.get(c.routeId) ?? 0) + 1);
    return routesList.map((r) => ({ ...r, assetCount: countByRoute.get(r.id) ?? 0 }));
  });

  app.get('/pm-routes/:id', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;
    const [route] = await db.select().from(pmRouteMasters)
      .where(and(eq(pmRouteMasters.id, id), eq(pmRouteMasters.tenantId, tid))).limit(1);
    if (!route) return reply.code(404).send({ error: 'PM route not found' });

    const routeAssetRows = await db
      .select({ id: pmRouteAssets.id, assetId: pmRouteAssets.assetId, seq: pmRouteAssets.seq, assetNum: assets.assetNum, assetDescription: assets.description })
      .from(pmRouteAssets)
      .innerJoin(assets, eq(assets.id, pmRouteAssets.assetId))
      .where(eq(pmRouteAssets.routeId, id))
      .orderBy(pmRouteAssets.seq);

    return { ...route, assets: routeAssetRows };
  });

  app.post('/pm-routes', writeGuard, async (request, reply) => {
    const tid = request.user!.tenantId;
    const body = request.body as { name: string; description?: string; siteId?: string; assetIds?: string[] };
    if (!body.name?.trim()) return reply.code(422).send({ error: 'name is required' });

    const [route] = await db.insert(pmRouteMasters).values({
      tenantId: tid,
      name: body.name.trim(),
      description: body.description,
      siteId: body.siteId,
      createdByUserId: request.user!.id,
    }).returning();

    if (body.assetIds?.length) {
      await db.insert(pmRouteAssets).values(
        body.assetIds.map((assetId, i) => ({ routeId: route!.id, assetId, seq: i })),
      );
    }

    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'CREATE', resource: 'PMRoute', resourceId: route!.id });
    return reply.code(201).send(route);
  });

  app.put('/pm-routes/:id', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;
    const body = request.body as Partial<{ name: string; description: string; siteId: string; isActive: boolean }>;

    const [row] = await db.update(pmRouteMasters)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(pmRouteMasters.id, id), eq(pmRouteMasters.tenantId, tid)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'PM route not found' });
    return row;
  });

  app.delete('/pm-routes/:id', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;
    const [row] = await db.update(pmRouteMasters)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(pmRouteMasters.id, id), eq(pmRouteMasters.tenantId, tid)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'PM route not found' });
    return reply.code(204).send();
  });

  // Route asset membership — add/remove/reorder stops on the route.
  app.post('/pm-routes/:id/assets', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { assetId: string; seq?: number };
    const tid = request.user!.tenantId;

    const [route] = await db.select({ id: pmRouteMasters.id }).from(pmRouteMasters)
      .where(and(eq(pmRouteMasters.id, id), eq(pmRouteMasters.tenantId, tid))).limit(1);
    if (!route) return reply.code(404).send({ error: 'PM route not found' });

    const [existing] = await db.select().from(pmRouteAssets)
      .where(and(eq(pmRouteAssets.routeId, id), eq(pmRouteAssets.assetId, body.assetId))).limit(1);
    if (existing) return reply.code(409).send({ error: 'This asset is already on the route' });

    const [row] = await db.insert(pmRouteAssets).values({ routeId: id, assetId: body.assetId, seq: body.seq ?? 0 }).returning();
    return reply.code(201).send(row);
  });

  app.delete('/pm-routes/:id/assets/:routeAssetId', writeGuard, async (request, reply) => {
    const { id, routeAssetId } = request.params as { id: string; routeAssetId: string };
    const [row] = await db.delete(pmRouteAssets)
      .where(and(eq(pmRouteAssets.id, routeAssetId), eq(pmRouteAssets.routeId, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'Route asset not found' });
    return reply.code(204).send();
  });

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
      // FIX (P1-5 gap — AC-P1-5.7): a PM master can now target a Route
      // instead of a single asset/location. When set, assetId/locationId
      // above are ignored at generation time — see generatePmWorkOrder.
      routeId?: string;
      frequencyType: string;
      interval?: number;
      intervalUnit?: string;
      seasonalMonth?: number;
      seasonalDay?: number;
      leadDays?: number;
      priority?: string;
      startDate?: string;
      // FIX: same explicit-override pattern as PUT /pm-masters/:id
      // above — lets the New PM form set a genuine starting due date
      // directly (e.g. backdated for testing, or just a planner's known
      // correct date) instead of always deriving one from "now" via
      // computeNextDueDate.
      manualNextDueDate?: string;
      meterTriggers?: Array<{ meterId: string; threshold: string; resetOnWo?: boolean }>;
    };
    const tid = request.user!.tenantId;

    // ── Custom field validation ──────────────────────────────────────────────
    const customData = (body as Record<string, unknown>).customData as Record<string, unknown> ?? {};
    const validation = await validateCustomFields(tid, 'PMaster', { ...body as Record<string, unknown>, ...customData }, request.user!.roles ?? []);
    if (!validation.valid) return reply.code(422).send({ error: 'Validation failed', errors: validation.errors });
    // ────────────────────────────────────────────────────────────────────────

    const count = await db
      .select({ id: pmMasters.id })
      .from(pmMasters)
      .where(eq(pmMasters.tenantId, tid));
    const pmNum = body.pmNum ?? nextAutoRecordCode(count.length);

    const nextDueDate = body.manualNextDueDate
      ? new Date(body.manualNextDueDate)
      : computeNextDueDate(
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
        routeId: body.routeId,
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
    const body = request.body as Partial<typeof pmMasters.$inferInsert> & { manualNextDueDate?: string };
    const tid = request.user!.tenantId;

    // FIX: real bug found during PM Compliance testing — this route
    // unconditionally recomputed nextDueDate relative to "right now"
    // whenever frequencyType/interval/intervalUnit were present in the
    // body, which was EVERY save from the Edit PM form (it always
    // submits all three together, even when only the description
    // changed) — so a PM's due date silently drifted to "an interval
    // from today" on every single edit, with no way to ever set or keep
    // a deliberate due date (e.g. a genuinely overdue one, useful for
    // testing the "Late" bucket in PM Compliance, or just a planner
    // correcting a date by hand). `manualNextDueDate` is a new,
    // explicit opt-in: when the caller sends it, it wins outright and
    // the auto-recompute is skipped entirely — otherwise behaviour is
    // unchanged from before.
    if (body.manualNextDueDate) {
      body.nextDueDate = new Date(body.manualNextDueDate);
    } else if (body.frequencyType || body.interval || body.intervalUnit) {
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
    delete body.manualNextDueDate;

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

  // FIX (PRD 9.4.1 gap — "PM compliance % KPI — on time / late / missed"):
  // this was entirely absent — the forecast list above shows individual
  // rows, but nothing rolled them up into the compliance rate real
  // Maximo tracks. Classification per forecast in the window:
  //   ON_TIME  — completed (status COMPLETED, linked WO closed) with the
  //              WO's actualFinishDate on or before the forecast's due
  //              date (forecastDate).
  //   LATE     — completed, but actualFinishDate is after forecastDate.
  //   MISSED   — status SKIPPED, OR still PROJECTED/GENERATED with
  //              forecastDate already in the past (due, never actioned).
  //   PENDING  — PROJECTED/GENERATED with forecastDate still in the
  //              future — excluded from the compliance % denominator,
  //              since it isn't due yet and hasn't failed anything.
  // compliancePct = onTime / (onTime + late + missed) * 100.
  app.get('/pm-compliance', readGuard, async (request) => {
    const { from, to, siteId } = request.query as {
      from?: string;
      to?: string;
      siteId?: string;
    };
    const tid = request.user!.tenantId;

    // Default window: trailing 90 days — "how has PM compliance been
    // recently," matching the same default horizon /pm-forecasts uses
    // going forward; this one looks backward since compliance can only
    // be judged on forecasts that have already come due.
    const fromDate = from ? new Date(from) : new Date(Date.now() - 90 * 86400000);
    const toDate = to ? new Date(to) : new Date();
    const now = new Date();

    const rows = await db
      .select({
        forecastId: pmForecasts.id,
        forecastDate: pmForecasts.forecastDate,
        status: pmForecasts.status,
        woId: pmForecasts.woId,
        woStatus: workOrders.status,
        woActualFinishDate: workOrders.actualFinishDate,
      })
      .from(pmForecasts)
      .innerJoin(pmMasters, eq(pmForecasts.pmId, pmMasters.id))
      .leftJoin(workOrders, eq(pmForecasts.woId, workOrders.id))
      .where(
        and(
          eq(pmForecasts.tenantId, tid),
          gte(pmForecasts.forecastDate, fromDate),
          lte(pmForecasts.forecastDate, toDate),
          siteId ? eq(pmMasters.siteId, siteId) : undefined,
        ),
      );

    // FIX: real bug found during testing — comparing full timestamps
    // (woActualFinishDate <= forecastDate) meant a WO closed on the
    // SAME CALENDAR DAY as its due date, but a few hours later, counted
    // as "Late" — because forecastDate typically defaults to midnight
    // of the due date, and any real closure happens later in that same
    // day. "On time" should mean "finished on or before the due DATE,"
    // not "before the exact due timestamp." Comparing at day granularity
    // (year/month/day only, ignoring time-of-day) fixes this.
    const toDateOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

    let onTime = 0, late = 0, missed = 0, pending = 0;
    for (const r of rows) {
      if (r.status === 'COMPLETED' && r.woActualFinishDate) {
        if (toDateOnly(r.woActualFinishDate) <= toDateOnly(r.forecastDate)) onTime++; else late++;
      } else if (r.status === 'SKIPPED') {
        missed++;
      } else if (r.forecastDate < now) {
        missed++; // due, never actioned
      } else {
        pending++;
      }
    }
    const dueTotal = onTime + late + missed;
    const compliancePct = dueTotal > 0 ? (onTime / dueTotal) * 100 : null;

    return { windowStart: fromDate, windowEnd: toDate, onTime, late, missed, pending, dueTotal, compliancePct };
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
  const woNum = nextAutoRecordCode(count.length);

  // FIX (P1-5 gap — AC-P1-5.7): "Route PM generates a single WO covering
  // all route assets." When this PM targets a route, the WO's own
  // top-level assetId is left null (a route WO isn't "about" any one
  // asset) and every asset on the route gets its own wo_task line
  // instead — same WO, same visit, one line per stop.
  const routeAssets = pm.routeId
    ? await db
        .select({ assetId: pmRouteAssets.assetId, seq: pmRouteAssets.seq, assetNum: assets.assetNum, assetDescription: assets.description })
        .from(pmRouteAssets)
        .innerJoin(assets, eq(assets.id, pmRouteAssets.assetId))
        .where(eq(pmRouteAssets.routeId, pm.routeId))
        .orderBy(pmRouteAssets.seq)
    : [];

  // 3. Insert Work Order
  const [wo] = await db
    .insert(workOrders)
    .values({
      tenantId,
      woNum,
      description: pm.routeId
        ? `PM Route: ${pm.description} (${routeAssets.length} asset${routeAssets.length === 1 ? '' : 's'})`
        : `PM: ${pm.description}`,
      type: 'PM',
      priority: pm.priority ?? 'MEDIUM',
      assetId: pm.routeId ? undefined : pm.assetId,
      locationId: pm.locationId,
      siteId: pm.siteId,
      pmId: pm.id,
      jobPlanId: pm.jobPlanId,
      targetFinishDate: scheduledDate,
    })
    .returning();

  if (pm.routeId && routeAssets.length > 0) {
    await db.insert(woTasks).values(
      routeAssets.map((ra, i) => ({
        woId: wo!.id,
        tenantId,
        sequence: i + 1,
        assetId: ra.assetId,
        description: `PM inspection: ${ra.assetNum} — ${ra.assetDescription}`,
        taskType: 'PM_ROUTE_STOP',
      })),
    );
  }

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