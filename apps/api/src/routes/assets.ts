import type { FastifyInstance } from 'fastify';
import { eq, and, desc, ilike, or, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import QRCode from 'qrcode';
import { WorkflowEngine } from '@eam/workflow-engine';
import {
  db,
  assets,
  locations,
  sites,
  organisations,
  assetClassifications,
  assetClassAttributes,
  assetMeters,
  assetMeterReadings,
  assetMoveHistory,
  failureCodes,
  workOrders,
  audit,
  entityDefinitions,
  fieldDefinitions,
} from '@eam/db';
import { requirePermission } from '../plugins/auth.js';
import { FieldRulesService } from '@eam/config-engine';

const readGuard = { preHandler: requirePermission('assets:read') };
const writeGuard = { preHandler: requirePermission('assets:write') };
const adminGuard = { preHandler: requirePermission('admin:config:manage') };

// Aliases used to resolve site/org via the asset's location when the asset's
// own siteId/orgId are not set directly.
const locationSites = alias(sites, 'location_sites');
const locationOrgs = alias(organisations, 'location_orgs');

export async function assetRoutes(app: FastifyInstance) {

  // ─── Custom field validation helper ──────────────────────────────────────────
  async function validateCustomFields(
    tid: string,
    entityName: string,
    data: Record<string, unknown>,
    userRoles: string[],
    currentStatus?: string,
  ): Promise<{ valid: boolean; errors: Array<{ field_key: string; message: string }> }> {
    const [entity] = await db
      .select()
      .from(entityDefinitions)
      .where(and(eq(entityDefinitions.tenantId, tid), eq(entityDefinitions.name, entityName)))
      .limit(1);
    if (!entity) return { valid: true, errors: [] };

    const fields = await db
      .select()
      .from(fieldDefinitions)
      .where(and(eq(fieldDefinitions.entityId, entity.id), eq(fieldDefinitions.tenantId, tid), eq(fieldDefinitions.isActive, true)));

    const svc = new FieldRulesService(db);
    const rules = await svc.loadRules(tid, entity.id, currentStatus);
    return svc.validateWrite(fields, rules, data, userRoles);
  }
  // ─── Locations ────────────────────────────────────────────────────────────────

  app.get('/locations', readGuard, async (request) => {
    const { siteId, parentId, flat } = request.query as {
      siteId?: string;
      parentId?: string;
      flat?: string;
    };
    const tid = request.user!.tenantId;

    const rows = await db
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.tenantId, tid),
          siteId ? eq(locations.siteId, siteId) : undefined,
          parentId === 'null'
            ? isNull(locations.parentId)
            : parentId
            ? eq(locations.parentId, parentId)
            : undefined,
        ),
      )
      .orderBy(locations.code);

    if (flat === 'true') return rows;

    // Build tree when parentId not specified
    const map = new Map<string, (typeof rows[0] & { children: unknown[] })>();
    for (const r of rows) map.set(r.id, { ...r, children: [] });
    const roots: unknown[] = [];
    for (const r of rows) {
      if (r.parentId && map.has(r.parentId)) {
        map.get(r.parentId)!.children.push(map.get(r.id)!);
      } else {
        roots.push(map.get(r.id)!);
      }
    }
    return roots;
  });

  app.post('/locations', writeGuard, async (request, reply) => {
    const body = request.body as {
      code: string;
      name: string;
      description?: string;
      siteId?: string;
      orgId?: string;
      parentId?: string;
      type?: string;
      glAccount?: string;
      costCenter?: string;
    };
    const tid = request.user!.tenantId;

    const [row] = await db
      .insert(locations)
      .values({ tenantId: tid, ...body } as typeof locations.$inferInsert)
      .returning();

    await audit(db, {
      tenantId: tid,
      userId: request.user!.id,
      action: 'CREATE',
      resource: 'Location',
      resourceId: row!.id,
    });

    return reply.code(201).send(row);
  });

  app.put('/locations/:id', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof locations.$inferInsert>;
    const tid = request.user!.tenantId;

    const [row] = await db
      .update(locations)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(locations.id, id), eq(locations.tenantId, tid)))
      .returning();

    if (!row) return reply.code(404).send({ error: 'Location not found' });
    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'UPDATE', resource: 'Location', resourceId: id });
    return row;
  });

  app.delete('/locations/:id', adminGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    // Check for child locations or assets
    const [childLoc] = await db.select({ id: locations.id }).from(locations)
      .where(and(eq(locations.parentId, id), eq(locations.tenantId, tid))).limit(1);
    if (childLoc) return reply.code(409).send({ error: 'Cannot delete location with child locations' });

    const [childAsset] = await db.select({ id: assets.id }).from(assets)
      .where(and(eq(assets.locationId, id), eq(assets.tenantId, tid))).limit(1);
    if (childAsset) return reply.code(409).send({ error: 'Cannot delete location with assets' });

    await db.delete(locations).where(and(eq(locations.id, id), eq(locations.tenantId, tid)));
    return reply.code(204).send();
  });

  // ─── Asset Classifications ────────────────────────────────────────────────────

  app.get('/asset-classifications', readGuard, async (request) => {
    const tid = request.user!.tenantId;
    return db.select().from(assetClassifications)
      .where(and(eq(assetClassifications.tenantId, tid), eq(assetClassifications.isActive, true)))
      .orderBy(assetClassifications.classCode);
  });

  app.post('/asset-classifications', adminGuard, async (request, reply) => {
    const body = request.body as {
      classCode: string;
      description: string;
      parentId?: string;
    };
    const tid = request.user!.tenantId;
    const [row] = await db.insert(assetClassifications).values({ tenantId: tid, ...body }).returning();
    return reply.code(201).send(row);
  });

  app.put('/asset-classifications/:id', adminGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof assetClassifications.$inferInsert>;
    const tid = request.user!.tenantId;
    const [row] = await db.update(assetClassifications).set(body)
      .where(and(eq(assetClassifications.id, id), eq(assetClassifications.tenantId, tid)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'Classification not found' });
    return row;
  });

  app.get('/asset-classifications/:id/attributes', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    return db.select().from(assetClassAttributes).where(eq(assetClassAttributes.classId, id));
  });

  app.post('/asset-classifications/:id/attributes', adminGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { attrName: string; attrType?: string; isRequired?: boolean; defaultValue?: string };
    const [row] = await db.insert(assetClassAttributes).values({ classId: id, ...body }).returning();
    return reply.code(201).send(row);
  });

  // ─── Failure Codes ────────────────────────────────────────────────────────────

  app.get('/failure-codes', readGuard, async (request) => {
    const { type } = request.query as { type?: string };
    const tid = request.user!.tenantId;
    return db.select().from(failureCodes).where(
      and(
        eq(failureCodes.tenantId, tid),
        eq(failureCodes.isActive, true),
        type ? eq(failureCodes.type, type as 'PROBLEM' | 'CAUSE' | 'REMEDY') : undefined,
      ),
    ).orderBy(failureCodes.type, failureCodes.code);
  });

  app.post('/failure-codes', adminGuard, async (request, reply) => {
    const body = request.body as {
      type: 'PROBLEM' | 'CAUSE' | 'REMEDY';
      code: string;
      description: string;
      parentId?: string;
    };
    const tid = request.user!.tenantId;
    const [row] = await db.insert(failureCodes).values({ tenantId: tid, ...body }).returning();
    return reply.code(201).send(row);
  });

  app.put('/failure-codes/:id', adminGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof failureCodes.$inferInsert>;
    const tid = request.user!.tenantId;
    const [row] = await db.update(failureCodes).set(body)
      .where(and(eq(failureCodes.id, id), eq(failureCodes.tenantId, tid))).returning();
    if (!row) return reply.code(404).send({ error: 'Failure code not found' });
    return row;
  });

  // ─── Assets ───────────────────────────────────────────────────────────────────

  app.get('/assets', readGuard, async (request) => {
    const { status, siteId, orgId, locationId, classId, criticality, q, page, pageSize } =
      request.query as {
        status?: string;
        siteId?: string;
        orgId?: string;
        locationId?: string;
        classId?: string;
        criticality?: string;
        q?: string;
        page?: string;
        pageSize?: string;
      };
    const tid = request.user!.tenantId;
    const limit = Math.min(Number(pageSize ?? 50), 200);
    const offset = (Number(page ?? 1) - 1) * limit;

    const rows = await db
      .select({
        id: assets.id,
        assetNum: assets.assetNum,
        description: assets.description,
        status: assets.status,
        criticality: assets.criticality,
        manufacturer: assets.manufacturer,
        model: assets.model,
        serialNum: assets.serialNum,
        installDate: assets.installDate,
        warrantyExpiry: assets.warrantyExpiry,
        locationId: assets.locationId,
        siteId: assets.siteId,
        classId: assets.classId,
        updatedAt: assets.updatedAt,
        locationCode: locations.code,
        locationName: locations.name,
        siteName: sql<string | null>`coalesce(${sites.name}, ${locationSites.name})`,
        className: assetClassifications.description,
      })
      .from(assets)
      .leftJoin(locations, eq(assets.locationId, locations.id))
      .leftJoin(sites, eq(assets.siteId, sites.id))
      .leftJoin(locationSites, eq(locations.siteId, locationSites.id))
      .leftJoin(assetClassifications, eq(assets.classId, assetClassifications.id))
      .where(
        and(
          eq(assets.tenantId, tid),
          status ? eq(assets.status, status as typeof assets.$inferSelect.status) : undefined,
          siteId ? or(eq(assets.siteId, siteId), eq(locations.siteId, siteId)) : undefined,
          orgId ? eq(assets.orgId, orgId) : undefined,
          locationId ? eq(assets.locationId, locationId) : undefined,
          classId ? eq(assets.classId, classId) : undefined,
          criticality ? eq(assets.criticality, criticality as Exclude<typeof assets.$inferSelect.criticality, null>) : undefined,
          q
            ? or(
                ilike(assets.assetNum, `%${q}%`),
                ilike(assets.description, `%${q}%`),
                ilike(assets.serialNum, `%${q}%`),
              )
            : undefined,
        ),
      )
      .orderBy(desc(assets.updatedAt))
      .limit(limit)
      .offset(offset);

    return { data: rows, page: Number(page ?? 1), pageSize: limit };
  });

  app.post('/assets', writeGuard, async (request, reply) => {
    const body = request.body as {
      assetNum: string;
      description: string;
      locationId?: string;
      siteId?: string;
      orgId?: string;
      classId?: string;
      parentAssetId?: string;
      status?: string;
      criticality?: string;
      manufacturer?: string;
      model?: string;
      serialNum?: string;
      installDate?: string;
      warrantyExpiry?: string;
      glAccount?: string;
      costCenter?: string;
      purchaseCost?: string;
      replacementCost?: string;
      classAttributes?: Record<string, unknown>;
      customData?: Record<string, unknown>;
    };
    const tid = request.user!.tenantId;

    const customData = body.customData ?? {};
    const validation = await validateCustomFields(tid, 'Asset', { ...body, ...customData }, request.user!.roles ?? []);
    if (!validation.valid) {
      return reply.status(422).send({ error: 'Validation failed', errors: validation.errors });
    }

    const [row] = await db
      .insert(assets)
      .values({ tenantId: tid, ...body } as typeof assets.$inferInsert)
      .returning();

    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'CREATE', resource: 'Asset', resourceId: row!.id });
    return reply.code(201).send(row);
  });

  app.get('/assets/:id', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    const [asset] = await db
      .select({
        id: assets.id,
        assetNum: assets.assetNum,
        description: assets.description,
        status: assets.status,
        criticality: assets.criticality,
        manufacturer: assets.manufacturer,
        model: assets.model,
        serialNum: assets.serialNum,
        installDate: assets.installDate,
        warrantyExpiry: assets.warrantyExpiry,
        locationId: assets.locationId,
        siteId: assets.siteId,
        orgId: assets.orgId,
        parentAssetId: assets.parentAssetId,
        classId: assets.classId,
        glAccount: assets.glAccount,
        costCenter: assets.costCenter,
        purchaseCost: assets.purchaseCost,
        replacementCost: assets.replacementCost,
        classAttributes: assets.classAttributes,
        customData: assets.customData,
        createdAt: assets.createdAt,
        updatedAt: assets.updatedAt,
        locationCode: locations.code,
        locationName: locations.name,
        siteName: sql<string | null>`coalesce(${sites.name}, ${locationSites.name})`,
        orgName: sql<string | null>`coalesce(${organisations.name}, ${locationOrgs.name})`,
        className: assetClassifications.description,
      })
      .from(assets)
      .leftJoin(locations, eq(assets.locationId, locations.id))
      .leftJoin(sites, eq(assets.siteId, sites.id))
      .leftJoin(organisations, eq(assets.orgId, organisations.id))
      .leftJoin(locationSites, eq(locations.siteId, locationSites.id))
      .leftJoin(locationOrgs, eq(locations.orgId, locationOrgs.id))
      .leftJoin(assetClassifications, eq(assets.classId, assetClassifications.id))
      .where(and(eq(assets.id, id), eq(assets.tenantId, tid)))
      .limit(1);

    if (!asset) return reply.code(404).send({ error: 'Asset not found' });

    // Get meters
    const meters = await db.select().from(assetMeters)
      .where(and(eq(assetMeters.assetId, id), eq(assetMeters.isActive, true)));

    // Open work orders count
    const openWOs = await db.select({ id: workOrders.id, woNum: workOrders.woNum, status: workOrders.status })
      .from(workOrders)
      .where(and(
        eq(workOrders.assetId, id),
        eq(workOrders.tenantId, tid),
      ))
      .orderBy(desc(workOrders.createdAt))
      .limit(5);

    return { ...asset, meters, recentWorkOrders: openWOs };
  });

  app.put('/assets/:id', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof assets.$inferInsert>;
    const tid = request.user!.tenantId;

    // Get current status before update for transition detection
    const [current] = await db.select({ status: assets.status })
      .from(assets).where(and(eq(assets.id, id), eq(assets.tenantId, tid))).limit(1);

    const [row] = await db.update(assets)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(assets.id, id), eq(assets.tenantId, tid)))
      .returning();

    if (!row) return reply.code(404).send({ error: 'Asset not found' });
    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'UPDATE', resource: 'Asset', resourceId: id });

    // Auto-start matching workflow on status transition
    if (body.status && current?.status && body.status !== current.status) {
      const engine = new WorkflowEngine(db);
      void engine.startWorkflow({
        tenantId: tid,
        entityType: 'Asset',
        entityId: id,
        fromStatus: current.status,
        toStatus: body.status,
        triggeredBy: request.user!.id,
      }).catch((e: unknown) => console.warn('[workflow] Asset trigger failed:', e));
    }

    return row;
  });

  // Move asset to new location
  app.post('/assets/:id/move', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { toLocationId: string; reason?: string };
    const tid = request.user!.tenantId;

    const [asset] = await db.select().from(assets)
      .where(and(eq(assets.id, id), eq(assets.tenantId, tid))).limit(1);
    if (!asset) return reply.code(404).send({ error: 'Asset not found' });

    await db.insert(assetMoveHistory).values({
      assetId: id,
      tenantId: tid,
      fromLocationId: asset.locationId,
      toLocationId: body.toLocationId,
      movedByUserId: request.user!.id,
      reason: body.reason,
    });

    const [updated] = await db.update(assets)
      .set({ locationId: body.toLocationId, updatedAt: new Date() })
      .where(and(eq(assets.id, id), eq(assets.tenantId, tid)))
      .returning();

    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'MOVE', resource: 'Asset', resourceId: id, metadata: { toLocationId: body.toLocationId } });
    return updated;
  });

  // Asset move history
  app.get('/assets/:id/move-history', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    return db.select().from(assetMoveHistory)
      .where(eq(assetMoveHistory.assetId, id))
      .orderBy(desc(assetMoveHistory.movedAt));
  });

  // QR code label
  app.get('/assets/:id/qrcode', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    const [asset] = await db.select({ assetNum: assets.assetNum, description: assets.description })
      .from(assets).where(and(eq(assets.id, id), eq(assets.tenantId, tid))).limit(1);
    if (!asset) return reply.code(404).send({ error: 'Asset not found' });

    const qrData = JSON.stringify({ type: 'asset', id, assetNum: asset.assetNum });
    const dataUrl = await QRCode.toDataURL(qrData, { width: 256 });
    return { assetNum: asset.assetNum, description: asset.description, qrDataUrl: dataUrl };
  });

  // ─── Asset Meters ─────────────────────────────────────────────────────────────

  app.get('/assets/:id/meters', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    return db.select().from(assetMeters)
      .where(and(eq(assetMeters.assetId, id), eq(assetMeters.isActive, true)));
  });

  app.post('/assets/:id/meters', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name: string;
      unit: string;
      meterType?: 'GAUGE' | 'CONTINUOUS' | 'CHARACTERISTIC';
      rolloverValue?: string;
    };
    const tid = request.user!.tenantId;

    const [row] = await db.insert(assetMeters).values({
      assetId: id,
      tenantId: tid,
      name: body.name,
      unit: body.unit,
      meterType: body.meterType ?? 'CONTINUOUS',
      rolloverValue: body.rolloverValue,
    }).returning();

    return reply.code(201).send(row);
  });

  app.post('/assets/:id/meters/:meterId/readings', writeGuard, async (request, reply) => {
    const { id, meterId } = request.params as { id: string; meterId: string };
    const body = request.body as { value: string; readingDate?: string; notes?: string };
    const tid = request.user!.tenantId;

    const [meter] = await db.select().from(assetMeters)
      .where(and(eq(assetMeters.id, meterId), eq(assetMeters.assetId, id))).limit(1);
    if (!meter) return reply.code(404).send({ error: 'Meter not found' });

    const prev = meter.lastReading ? parseFloat(String(meter.lastReading)) : null;
    const curr = parseFloat(body.value);
    const delta = prev !== null ? (curr - prev).toString() : null;

    const [reading] = await db.insert(assetMeterReadings).values({
      meterId,
      tenantId: tid,
      value: body.value,
      delta,
      readingDate: body.readingDate ? new Date(body.readingDate) : new Date(),
      loggedByUserId: request.user!.id,
      notes: body.notes,
    }).returning();

    await db.update(assetMeters).set({
      lastReading: body.value,
      lastReadingDate: reading!.readingDate,
    }).where(eq(assetMeters.id, meterId));

    return reply.code(201).send(reading);
  });

  app.get('/assets/:id/meters/:meterId/readings', readGuard, async (request) => {
    const { meterId } = request.params as { id: string; meterId: string };
    return db.select().from(assetMeterReadings)
      .where(eq(assetMeterReadings.meterId, meterId))
      .orderBy(desc(assetMeterReadings.readingDate))
      .limit(100);
  });

  // ─── Asset KPIs ───────────────────────────────────────────────────────────────

  app.get('/assets/:id/kpis', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    const [asset] = await db.select().from(assets)
      .where(and(eq(assets.id, id), eq(assets.tenantId, tid))).limit(1);
    if (!asset) return reply.code(404).send({ error: 'Asset not found' });

    // All closed WOs for this asset
    const closedWOs = await db.select({
      type: workOrders.type,
      downtimeHours: workOrders.downtimeHours,
      totalCost: workOrders.totalCost,
      actualStartDate: workOrders.actualStartDate,
      actualFinishDate: workOrders.actualFinishDate,
    }).from(workOrders)
      .where(and(
        eq(workOrders.assetId, id),
        eq(workOrders.tenantId, tid),
        eq(workOrders.status, 'CLOSE'),
      ));

    const cmWOs = closedWOs.filter((w) => w.type === 'CM');
    const totalDowntimeHours = cmWOs.reduce((sum, w) => sum + parseFloat(String(w.downtimeHours ?? '0')), 0);
    const totalCost = closedWOs.reduce((sum, w) => sum + parseFloat(String(w.totalCost ?? '0')), 0);

    // MTTR = avg repair time (hours) for CM WOs
    const repairTimes = cmWOs
      .filter((w) => w.actualStartDate && w.actualFinishDate)
      .map((w) => (w.actualFinishDate!.getTime() - w.actualStartDate!.getTime()) / 3600000);
    const mttr = repairTimes.length > 0 ? repairTimes.reduce((a, b) => a + b, 0) / repairTimes.length : null;

    // MTBF: age / failure count
    const ageDays = asset.installDate
      ? (Date.now() - asset.installDate.getTime()) / 86400000
      : null;
    const mtbf = ageDays && cmWOs.length > 0 ? (ageDays * 24) / cmWOs.length : null;

    // Availability % = 1 - (downtime / operating hours)
    const operatingHours = ageDays ? ageDays * 24 : null;
    const availability =
      operatingHours && operatingHours > 0
        ? Math.max(0, (1 - totalDowntimeHours / operatingHours) * 100)
        : null;

    return {
      assetId: id,
      assetNum: asset.assetNum,
      totalMaintenanceCost: totalCost,
      totalDowntimeHours,
      cmCount: cmWOs.length,
      mttrHours: mttr,
      mtbfHours: mtbf,
      availabilityPct: availability,
      ageDays,
    };
  });
}