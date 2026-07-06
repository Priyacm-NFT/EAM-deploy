import type { FastifyInstance } from 'fastify';
import { eq, and, desc, ilike, or, inArray, gte, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  db,
  workOrders,
  woTasks,
  woLabour,
  woMaterials,
  woTools,
  woServices,
  woSafety,
  assets,
  locations,
  sites,
  users,
  jobPlans,
  jobPlanTasks,
  jobPlanLabour,
  jobPlanMaterials,
  jobPlanTools,
  jobPlanSafety,
  statusSets,
  statusTransitions,
  permits,
  audit,
  entityDefinitions,
  fieldDefinitions,
  statusHistory,
  recordStatusHistory,
  pmForecasts,
} from '@eam/db';
import { requirePermission } from '../plugins/auth.js';
import { dispatchWebhookEvent } from '../lib/webhooks.js';
import { globalEventBus, nextAutoRecordCode } from '@eam/shared';
import { WorkflowEngine } from '@eam/workflow-engine';
import { checkMandatoryAttachments } from './admin-attachments.js';
import { FieldRulesService } from '@eam/config-engine';
 
const readGuard = { preHandler: requirePermission('work_orders:read') };

/** Descending numeric WO number order (…, 10001, 10000). */
const woNumDesc = desc(
  sql`CASE WHEN ${workOrders.woNum} ~ '^[0-9]+$' THEN ${workOrders.woNum}::bigint ELSE 0 END`,
);
const writeGuard = { preHandler: requirePermission('work_orders:write') };
const approveGuard = { preHandler: requirePermission('work_orders:approve') };
// FIX: alias for resolving reportedByUserId -> a display name on the
// GET /work-orders/:id response, without colliding with any other
// `users` join this file might use elsewhere.
const reporters = alias(users, 'wo_reporters');

// FIX (P1-3 gap — AC-P1-3.9): "Cost freeze on CLOSE — no further edits to
// labour/material/tool lines." Previously none of the labour/materials/
// tools/services POST/PUT/DELETE routes below checked WO status at all —
// a CLOSEd (or even already-COMP) work order's cost lines could still be
// silently edited, which is exactly the actual-vs-planned cost data the
// WO cost-summary and cost-by-asset reports (P1-8) depend on staying
// frozen once work is done. Returns an error string if editing should be
// blocked, or null if it's fine to proceed.
async function costLinesFrozenReason(woId: string, tid: string): Promise<string | null> {
  const [wo] = await db.select({ status: workOrders.status }).from(workOrders)
    .where(and(eq(workOrders.id, woId), eq(workOrders.tenantId, tid))).limit(1);
  if (!wo) return 'Work order not found';
  if (wo.status === 'CLOSE') return 'This work order is CLOSEd — labour, material, tool, and service lines cannot be added, edited, or removed.';
  if (wo.status === 'COMP') return 'This work order is COMP — labour and material lines cannot be added or edited; only closing (which freezes costs) is allowed from here.';
  return null;
}

export async function workOrderRoutes(app: FastifyInstance) {
  // ─── List ─────────────────────────────────────────────────────────────────────
 
  app.get('/work-orders', readGuard, async (request) => {
    const { status, type, priority, siteId, assetId, assignedToUserId, q, page, pageSize } =
      request.query as {
        status?: string;
        type?: string;
        priority?: string;
        siteId?: string;
        assetId?: string;
        assignedToUserId?: string;
        q?: string;
        page?: string;
        pageSize?: string;
      };
    const tid = request.user!.tenantId;
    const limit = Math.min(Number(pageSize ?? 50), 200);
    const offset = (Number(page ?? 1) - 1) * limit;

    // FIX: real Maximo manages Work Orders at the Site level — same rule
    // and same already-proven pattern as /assets and /locations. Without
    // this, any user with work_orders:read saw every Work Order in the
    // tenant regardless of their Security Group's Site authorization.
    const scope = request.user!.scope;
    const scopeFilter = scope?.unrestricted
      ? undefined
      : or(
          scope?.organisationIds?.length ? inArray(workOrders.orgId, scope.organisationIds) : undefined,
          scope?.siteIds?.length ? inArray(workOrders.siteId, scope.siteIds) : undefined,
          scope?.locationIds?.length ? inArray(workOrders.locationId, scope.locationIds) : undefined,
        );

    const rows = await db
      .select({
        id: workOrders.id,
        woNum: workOrders.woNum,
        description: workOrders.description,
        type: workOrders.type,
        status: workOrders.status,
        priority: workOrders.priority,
        targetFinishDate: workOrders.targetFinishDate,
        totalCost: workOrders.totalCost,
        createdAt: workOrders.createdAt,
        updatedAt: workOrders.updatedAt,
        assetNum: assets.assetNum,
        locationName: locations.name,
        siteName: sites.name,
        assigneeName: users.displayName,
      })
      .from(workOrders)
      .leftJoin(assets, eq(workOrders.assetId, assets.id))
      .leftJoin(locations, eq(workOrders.locationId, locations.id))
      .leftJoin(sites, eq(workOrders.siteId, sites.id))
      .leftJoin(users, eq(workOrders.assignedToUserId, users.id))
      .where(
        and(
          eq(workOrders.tenantId, tid),
          status ? eq(workOrders.status, status as typeof workOrders.$inferSelect.status) : undefined,
          type ? eq(workOrders.type, type as typeof workOrders.$inferSelect.type) : undefined,
          priority ? eq(workOrders.priority, priority as typeof workOrders.$inferSelect.priority) : undefined,
          siteId
            ? or(
                eq(workOrders.siteId, siteId),
                eq(locations.siteId, siteId),
                eq(assets.siteId, siteId),
              )
            : undefined,
          assetId ? eq(workOrders.assetId, assetId) : undefined,
          assignedToUserId ? eq(workOrders.assignedToUserId, assignedToUserId) : undefined,
          q
            ? or(
                ilike(workOrders.woNum, `%${q}%`),
                ilike(workOrders.description, `%${q}%`),
              )
            : undefined,
          scopeFilter,
        ),
      )
      .orderBy(woNumDesc)
      .limit(limit)
      .offset(offset);
 
    return { data: rows, page: Number(page ?? 1), pageSize: limit };
  });
 
  // ─── Custom field validation helper ──────────────────────────────────────────
  async function validateCustomFields(
    tid: string,
    entityName: string,
    data: Record<string, unknown>,
    userRoleIds: string[],
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
    return svc.validateWrite(fields, rules, data, userRoleIds);
  }
 
  // ─── Create ───────────────────────────────────────────────────────────────────
 
  app.post('/work-orders', writeGuard, async (request, reply) => {
    const body = request.body as {
      description: string;
      type?: string;
      priority?: string;
      assetId?: string;
      locationId?: string;
      siteId?: string;
      srId?: string;
      jobPlanId?: string;
      assignedToUserId?: string;
      // FIX: real Maximo "Reported By" / "Report Date" fields — who
      // originally reported the problem and when, independently
      // editable and NOT assumed to be the same person/moment as
      // whoever is filling in this form right now. Both optional in the
      // request; default to the creating user / now below when omitted,
      // so every WO still gets a sensible answer without forcing the
      // caller to always supply them.
      reportedByUserId?: string;
      reportedDate?: string;
      targetStartDate?: string;
      targetFinishDate?: string;
      longDescription?: string;
      customData?: Record<string, unknown>;
    };
    const tid = request.user!.tenantId;

    // Validate custom fields against field rules
    const customData = body.customData ?? {};
    const validation = await validateCustomFields(
      tid, 'WorkOrder', { ...body, ...customData },
      request.user!.roles ?? [],
    );
    if (!validation.valid) {
      return reply.status(422).send({ error: 'Validation failed', errors: validation.errors });
    }

    // FIX: same gap as asset creation — Security Group data scoping was
    // only ever enforced on reads (GET /work-orders already filters by
    // scope), never on writes. A scoped user creating a WO with no Site
    // picked got a NULL siteId; one who did pick a Site (or an
    // Asset/Location outside their authorized scope) was never stopped.
    let siteId = body.siteId;
    const scope = request.user!.scope;
    if (!siteId && !scope?.unrestricted) {
      const [me] = await db.select({ defaultSiteId: users.defaultSiteId }).from(users)
        .where(eq(users.id, request.user!.id)).limit(1);
      if (me?.defaultSiteId) siteId = me.defaultSiteId;
    }
    if (siteId && !scope?.unrestricted) {
      const inScope =
        (scope?.siteIds?.length && scope.siteIds.includes(siteId)) ||
        (scope?.locationIds?.length && body.locationId && scope.locationIds.includes(body.locationId));
      if (!inScope) {
        return reply.code(403).send({ error: 'You are not authorized to create work orders in this Site.' });
      }
    }

    const count = await db.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.tenantId, tid));
    const woNum = nextAutoRecordCode(count.length);
 
    const [row] = await db.insert(workOrders).values({
      tenantId: tid,
      woNum,
      description: body.description,
      longDescription: body.longDescription,
      type: (body.type ?? 'CM') as typeof workOrders.$inferInsert.type,
      priority: (body.priority ?? 'MEDIUM') as typeof workOrders.$inferInsert.priority,
      assetId: body.assetId,
      locationId: body.locationId,
      siteId,
      srId: body.srId,
      jobPlanId: body.jobPlanId,
      assignedToUserId: body.assignedToUserId,
      reportedByUserId: body.reportedByUserId ?? request.user!.id,
      reportedDate: body.reportedDate ? new Date(body.reportedDate) : new Date(),
      targetStartDate: body.targetStartDate ? new Date(body.targetStartDate) : undefined,
      targetFinishDate: body.targetFinishDate ? new Date(body.targetFinishDate) : undefined,
      customData: body.customData ?? {},
    }).returning();
 
    // If job plan specified, copy its content
    if (body.jobPlanId) {
      await applyJobPlanToWo(body.jobPlanId, row!.id, tid);
    }
 
    // FIX: seed the status history with the WO's initial status — every
    // WO created starts in WAPPR (see the column default) with no
    // fromStatus, matching the same "first entry has null fromStatus"
    // convention any status-history log needs for a record's origin.
    void recordStatusHistory(db, {
      tenantId: tid,
      entityType: 'WorkOrder',
      entityId: row!.id,
      fromStatus: null,
      toStatus: row!.status,
      changedByUserId: request.user!.id,
      notes: 'Work Order created',
    }).catch((e: unknown) => console.warn('[status-history] WorkOrder create record failed:', e));

    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'CREATE', resource: 'WorkOrder', resourceId: row!.id });
    void dispatchWebhookEvent(tid, 'WO_CREATED', { woId: row!.id, woNum: row!.woNum });
    // Fire notification dispatcher
    void globalEventBus.emit('WO_CREATED', {
      tenantId: tid,
      entityType: 'WorkOrder',
      entityId: row!.id,
      woNum: row!.woNum,
      assignedToUserId: row!.assignedToUserId,
      subject: `Work Order ${row!.woNum} created`,
      body: `<p>Work Order <strong>${row!.woNum}</strong> has been created.</p>`,
      context: { wo_num: row!.woNum, description: row!.description },
    });
    return reply.code(201).send(row);
  });
 
  // ─── Get Detail ───────────────────────────────────────────────────────────────
 
  app.get('/work-orders/:id', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;
 
    const [wo] = await db
      .select({
        id: workOrders.id,
        tenantId: workOrders.tenantId,
        woNum: workOrders.woNum,
        description: workOrders.description,
        status: workOrders.status,
        type: workOrders.type,
        priority: workOrders.priority,
        assignedToUserId: workOrders.assignedToUserId,
        assetId: workOrders.assetId,
        locationId: workOrders.locationId,
        siteId: workOrders.siteId,
        srId: workOrders.srId,
        pmId: workOrders.pmId,
        jobPlanId: workOrders.jobPlanId,
        targetStartDate: workOrders.targetStartDate,
        targetFinishDate: workOrders.targetFinishDate,
        actualStartDate: workOrders.actualStartDate,
        actualFinishDate: workOrders.actualFinishDate,
        longDescription: workOrders.longDescription,
        closureNotes: workOrders.closureNotes,
        laborCost: workOrders.laborCost,
        materialCost: workOrders.materialCost,
        serviceCost: workOrders.serviceCost,
        toolCost: workOrders.toolCost,
        totalCost: workOrders.totalCost,
        customData: workOrders.customData,
        createdAt: workOrders.createdAt,
        updatedAt: workOrders.updatedAt,
        // FIX: real Maximo "Reported By" / "Report Date" — see the
        // schema comment on work_orders.reported_by_user_id for why
        // these are distinct from createdAt/createdBy.
        reportedByUserId: workOrders.reportedByUserId,
        reportedByName: reporters.displayName,
        reportedDate: workOrders.reportedDate,
        // Joined display fields
        assetNum: assets.assetNum,
        locationCode: locations.code,
        locationName: locations.name,
        siteNum: sites.siteNum,
        siteName: sites.name,
        jobPlanDescription: jobPlans.description,
      })
      .from(workOrders)
      .leftJoin(assets, eq(workOrders.assetId, assets.id))
      .leftJoin(locations, eq(workOrders.locationId, locations.id))
      .leftJoin(sites, eq(workOrders.siteId, sites.id))
      .leftJoin(jobPlans, eq(workOrders.jobPlanId, jobPlans.id))
      .leftJoin(reporters, eq(workOrders.reportedByUserId, reporters.id))
      .where(and(eq(workOrders.id, id), eq(workOrders.tenantId, tid)))
      .limit(1);
    if (!wo) return reply.code(404).send({ error: 'Work order not found' });
 
    // Safe fetch helper — returns [] if table has missing columns
    const safeFetch = async <T>(promise: Promise<T[]>): Promise<T[]> => {
      try { return await promise; } catch { return []; }
    };
 
    const [tasks, labour, materials, tools, services, safety, activePermits] = await Promise.all([
      safeFetch(db.select().from(woTasks).where(eq(woTasks.woId, id)).orderBy(woTasks.sequence)),
      safeFetch(db.select().from(woLabour).where(eq(woLabour.woId, id))),
      safeFetch(db.select().from(woMaterials).where(eq(woMaterials.woId, id))),
      safeFetch(db.select().from(woTools).where(eq(woTools.woId, id))),
      safeFetch(db.select().from(woServices).where(eq(woServices.woId, id))),
      safeFetch(db.select().from(woSafety).where(eq(woSafety.woId, id))),
      safeFetch(db.select().from(permits).where(and(eq(permits.woId, id), eq(permits.tenantId, tid)))),
    ]);
 
    return { ...wo, tasks, labour, materials, tools, services, safety, permits: activePermits };
  });
 
  // ─── Update ───────────────────────────────────────────────────────────────────
 
  app.put('/work-orders/:id', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof workOrders.$inferInsert>;
    const tid = request.user!.tenantId;
 
    // Validate custom fields
    const customData = (body.customData as Record<string, unknown>) ?? {};
    const [existing] = await db.select({ status: workOrders.status }).from(workOrders)
      .where(and(eq(workOrders.id, id), eq(workOrders.tenantId, tid))).limit(1);
    const validation = await validateCustomFields(
      tid, 'WorkOrder', { ...body, ...customData },
      request.user!.roles ?? [],
      existing?.status,
    );
    if (!validation.valid) {
      return reply.status(422).send({ error: 'Validation failed', errors: validation.errors });
    }
 
    const [row] = await db.update(workOrders)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(workOrders.id, id), eq(workOrders.tenantId, tid)))
      .returning();
 
    if (!row) return reply.code(404).send({ error: 'Work order not found' });
    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'UPDATE', resource: 'WorkOrder', resourceId: id });
    return row;
  });
 
  // FIX: "status history for all the application" — read side for Work
  // Orders. Covers both entry points that change wo.status (the generic
  // transition route and the dedicated /close route, both further
  // below), since both call recordStatusHistory.
  app.get('/work-orders/:id/status-history', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;
    return db
      .select({
        id: statusHistory.id,
        fromStatus: statusHistory.fromStatus,
        toStatus: statusHistory.toStatus,
        changedAt: statusHistory.changedAt,
        notes: statusHistory.notes,
        changedByName: users.displayName,
      })
      .from(statusHistory)
      .leftJoin(users, eq(statusHistory.changedByUserId, users.id))
      .where(and(eq(statusHistory.entityType, 'WorkOrder'), eq(statusHistory.entityId, id), eq(statusHistory.tenantId, tid)))
      .orderBy(desc(statusHistory.changedAt));
  });
 
  // ─── Status Transition ────────────────────────────────────────────────────────
 
  app.post('/work-orders/:id/transition', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { toStatus: string; comment?: string };
    const tid = request.user!.tenantId;
 
    const [wo] = await db.select().from(workOrders)
      .where(and(eq(workOrders.id, id), eq(workOrders.tenantId, tid))).limit(1);
    if (!wo) return reply.code(404).send({ error: 'Work order not found' });
 
    // ── Mandatory attachment check ─────────────────────────────────────────
    const mandatoryCheck = await checkMandatoryAttachments(tid, 'WorkOrder', id, body.toStatus);
    if (!mandatoryCheck.valid) {
      return reply.code(422).send({
        error: 'Mandatory attachments missing',
        missing: mandatoryCheck.missing,
        message: `The following documents are required before transitioning to ${body.toStatus}: ${mandatoryCheck.missing.join(', ')}`,
      });
    }
 
    // Guard: cannot start work (INPRG) without active permit on hot work / hazard WOs
    if (body.toStatus === 'INPRG' && wo.permitId) {
      const [p] = await db.select().from(permits)
        .where(and(eq(permits.id, wo.permitId), eq(permits.tenantId, tid))).limit(1);
      if (!p || p.status !== 'ACTIVE') {
        return reply.code(400).send({ error: 'An active permit is required before starting this work order' });
      }
    }
 
    // Validate via status set — check both casing conventions
    const [woSet] = await db.select().from(statusSets)
      .where(and(
        or(eq(statusSets.entityType, 'WorkOrder'), eq(statusSets.entityType, 'work_order')),
        eq(statusSets.tenantId, tid)
      )).limit(1);
 
    if (woSet) {
      const [transition] = await db.select().from(statusTransitions)
        .where(
          and(
            eq(statusTransitions.statusSetId, woSet.id),
            eq(statusTransitions.fromStatus, wo.status),
            eq(statusTransitions.toStatus, body.toStatus),
          ),
        ).limit(1);
 
      if (!transition) {
        return reply.code(400).send({ error: `Transition from ${wo.status} to ${body.toStatus} is not allowed` });
      }
      if (transition.requiresComment && !body.comment) {
        return reply.code(400).send({ error: 'A comment is required for this transition' });
      }
    }

    // FIX (P1-3 gap — AC-P1-3.5): same failure-report gate as
    // POST /work-orders/:id/close, applied here too since this general
    // status-transition endpoint can also move a WO straight to COMP —
    // without this, a CM/HIGH-criticality WO could skip the dedicated
    // /close endpoint entirely and bypass the check there.
    if (['COMP', 'CLOSE'].includes(body.toStatus) && wo.type === 'CM' && wo.assetId) {
      const [asset] = await db.select({ criticality: assets.criticality }).from(assets)
        .where(eq(assets.id, wo.assetId)).limit(1);
      if (asset?.criticality === 'HIGH' && !wo.failureProblemId) {
        return reply.code(400).send({
          error: 'This is a Corrective Maintenance work order on a HIGH-criticality asset. Use POST /work-orders/:id/close with a failure report (problem code, at minimum) instead of a direct status change.',
        });
      }
    }

    const updates: Partial<typeof workOrders.$inferInsert> = {
      status: body.toStatus as typeof workOrders.$inferInsert.status,
      updatedAt: new Date(),
    };
    if (body.toStatus === 'INPRG' && !wo.actualStartDate) updates.actualStartDate = new Date();
    if (['COMP', 'CLOSE'].includes(body.toStatus) && !wo.actualFinishDate) updates.actualFinishDate = new Date();
 
    const [updated] = await db.update(workOrders).set(updates)
      .where(and(eq(workOrders.id, id), eq(workOrders.tenantId, tid))).returning();
 
    await audit(db, {
      tenantId: tid,
      userId: request.user!.id,
      action: `STATUS_${body.toStatus}`,
      resource: 'WorkOrder',
      resourceId: id,
      metadata: { fromStatus: wo.status, toStatus: body.toStatus, comment: body.comment ?? null },
    });

    void recordStatusHistory(db, {
      tenantId: tid,
      entityType: 'WorkOrder',
      entityId: id,
      fromStatus: wo.status,
      toStatus: body.toStatus,
      changedByUserId: request.user!.id,
      notes: body.comment ?? null,
    }).catch((e: unknown) => console.warn('[status-history] WorkOrder transition record failed:', e));
 
    void dispatchWebhookEvent(tid, 'WO_STATUS_CHANGED', { woId: id, fromStatus: wo.status, toStatus: body.toStatus });
    void globalEventBus.emit('WO_STATUS_CHANGED', {
      tenantId: tid,
      woId: id,
      entityId: id,
      entityType: 'WorkOrder',
      fromStatus: wo.status,
      toStatus: body.toStatus,
      status: body.toStatus,
      assignedToUserId: wo.assignedToUserId,
      userId: request.user!.id,
      context: {
        status: body.toStatus,
        toStatus: body.toStatus,
        fromStatus: wo.status,
        woNum: wo.woNum,
        description: wo.description,
        assignedToUserId: wo.assignedToUserId,
      },
    });
 
    // ── Auto-start matching workflow on status transition ──────────────────
    const engine = new WorkflowEngine(db);
    const triggerEvent = `${wo.status} → ${body.toStatus}`;
    const triggerEventAlt = `WO_${wo.status}_TO_${body.toStatus}`;
    console.info(`[workflow] Firing trigger: "${triggerEvent}" for WorkOrder ${id} (tenant: ${tid})`);
    void (async () => {
      const r = await engine.startWorkflow('WorkOrder', id, triggerEvent, tid, {
        woId: id, woNum: wo.woNum, fromStatus: wo.status, toStatus: body.toStatus,
        requesterId: (wo as Record<string, unknown>).requesterId as string ?? request.user!.id,
        assignedToUserId: wo.assignedToUserId, assetId: wo.assetId,
        priority: wo.priority, totalcost: parseFloat(wo.totalCost ?? '0'),
      });
      if (r) {
        console.info(`[workflow] ✅ Instance created: ${r.id}`);
      } else {
        console.warn(`[workflow] ❌ No matching workflow for trigger: "${triggerEvent}" — also trying: "${triggerEventAlt}"`);
        const r2 = await engine.startWorkflow('WorkOrder', id, triggerEventAlt, tid, {
          woId: id, woNum: wo.woNum, fromStatus: wo.status, toStatus: body.toStatus,
          requesterId: (wo as Record<string, unknown>).requesterId as string ?? request.user!.id,
          assignedToUserId: wo.assignedToUserId, assetId: wo.assetId,
          priority: wo.priority, totalcost: parseFloat(wo.totalCost ?? '0'),
        });
        if (r2) console.info(`[workflow] ✅ Instance created via alt trigger: ${r2.id}`);
        else console.warn(`[workflow] ❌ Still no match. Check trigger_event in workflow_definitions table.`);
      }
    })().catch((e: unknown) => console.warn('[workflow] trigger failed:', e));
 
    return updated;
  });
 
  // ─── Close WO (with failure codes + downtime) ─────────────────────────────────
 
  app.post('/work-orders/:id/close', approveGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      closureNotes?: string;
      failureProblemId?: string;
      failureCauseId?: string;
      failureRemedyId?: string;
      downtimeHours?: string;
    };
    const tid = request.user!.tenantId;
 
    const [wo] = await db.select().from(workOrders)
      .where(and(eq(workOrders.id, id), eq(workOrders.tenantId, tid))).limit(1);
    if (!wo) return reply.code(404).send({ error: 'Work order not found' });
    if (!['COMP', 'INPRG'].includes(wo.status)) {
      return reply.code(400).send({ error: 'Work order must be COMP or INPRG to close' });
    }

    // FIX (P1-3 gap — AC-P1-3.5): "CM WO on HIGH-criticality asset
    // requires failure report before COMP." Previously the close
    // endpoint accepted failureProblemId/failureCauseId/failureRemedyId
    // as optional fields with no enforcement at all — a CM work order on
    // a HIGH-criticality asset could close with zero record of what
    // actually failed, which is exactly the MTTR/MTBF/top-failing-assets
    // reporting data (P1-8) silently losing its source data.
    if (wo.type === 'CM' && wo.assetId) {
      const [asset] = await db.select({ criticality: assets.criticality }).from(assets)
        .where(eq(assets.id, wo.assetId)).limit(1);
      const problemId = body.failureProblemId ?? wo.failureProblemId;
      if (asset?.criticality === 'HIGH' && !problemId) {
        return reply.code(400).send({
          error: 'This is a Corrective Maintenance work order on a HIGH-criticality asset. A failure report (problem code, at minimum) is required before it can be closed.',
        });
      }
    }

    // Roll-up costs from children
    const labourRows = await db.select({ totalCost: woLabour.totalCost }).from(woLabour).where(eq(woLabour.woId, id));
    const materialRows = await db.select({ totalCost: woMaterials.totalCost }).from(woMaterials).where(eq(woMaterials.woId, id));
    const toolRows = await db.select({ totalCost: woTools.totalCost }).from(woTools).where(eq(woTools.woId, id));
    const serviceRows = await db.select({ cost: woServices.cost }).from(woServices).where(eq(woServices.woId, id));
 
    const laborCost = labourRows.reduce((s, r) => s + parseFloat(String(r.totalCost ?? '0')), 0);
    const materialCost = materialRows.reduce((s, r) => s + parseFloat(String(r.totalCost ?? '0')), 0);
    const toolCost = toolRows.reduce((s, r) => s + parseFloat(String(r.totalCost ?? '0')), 0);
    const serviceCost = serviceRows.reduce((s, r) => s + parseFloat(String(r.cost ?? '0')), 0);
    const totalCost = laborCost + materialCost + toolCost + serviceCost;
 
    const [updated] = await db.update(workOrders).set({
      status: 'CLOSE',
      closureNotes: body.closureNotes,
      failureProblemId: body.failureProblemId,
      failureCauseId: body.failureCauseId,
      failureRemedyId: body.failureRemedyId,
      downtimeHours: body.downtimeHours,
      actualFinishDate: wo.actualFinishDate ?? new Date(),
      laborCost: laborCost.toString(),
      materialCost: materialCost.toString(),
      toolCost: toolCost.toString(),
      serviceCost: serviceCost.toString(),
      totalCost: totalCost.toString(),
      updatedAt: new Date(),
    }).where(and(eq(workOrders.id, id), eq(workOrders.tenantId, tid))).returning();
 
    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'CLOSE', resource: 'WorkOrder', resourceId: id, metadata: { totalCost } });
    void recordStatusHistory(db, {
      tenantId: tid,
      entityType: 'WorkOrder',
      entityId: id,
      fromStatus: wo.status,
      toStatus: 'CLOSE',
      changedByUserId: request.user!.id,
      notes: body.closureNotes ?? null,
    }).catch((e: unknown) => console.warn('[status-history] WorkOrder close record failed:', e));

    // FIX (PRD 9.4.1 gap — PM Compliance % KPI): this was the missing
    // link that made "On Time"/"Late" impossible to ever populate —
    // nothing anywhere ever flipped a pm_forecasts row to COMPLETED, so
    // GET /pm-compliance's on-time/late buckets could never contain
    // anything no matter how the underlying Work Order was actually
    // handled; a WO closed well before its PM's due date was
    // indistinguishable from one that never got done at all. If this WO
    // is the one a PM Forecast points to (pmForecasts.woId), closing it
    // now marks that forecast COMPLETED — the compliance endpoint then
    // compares this WO's actualFinishDate against the forecast's
    // forecastDate to decide on-time vs late.
    try {
      await db.update(pmForecasts)
        .set({ status: 'COMPLETED', updatedAt: new Date() })
        .where(and(eq(pmForecasts.woId, id), eq(pmForecasts.tenantId, tid)));
    } catch (e: unknown) {
      console.warn('[pm-compliance] forecast completion record failed:', e);
    }

    // FIX (PRD 9.4.2 gap — Repeat failure detection): "alert when same
    // failure code logged within a window" — previously nothing checked
    // this at all; a Problem code recurring on the same Asset went
    // completely unnoticed unless someone manually scrolled through its
    // Work Order history. 30-day window, same Asset + same Problem code,
    // counting other already-CLOSEd WOs — deliberately Problem-code-only
    // (not Cause/Remedy) since "same problem recurring" is the
    // meaningful signal; the cause/remedy can differ each time without
    // that being a repeat failure in the sense this alert cares about.
    let repeatFailure: { isRepeat: boolean; occurrencesInWindow: number; windowDays: number } | null = null;
    if (body.failureProblemId && wo.assetId) {
      const windowDays = 30;
      const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
      const priorOccurrences = await db
        .select({ id: workOrders.id })
        .from(workOrders)
        .where(and(
          eq(workOrders.tenantId, tid),
          eq(workOrders.assetId, wo.assetId),
          eq(workOrders.failureProblemId, body.failureProblemId),
          eq(workOrders.status, 'CLOSE'),
          gte(workOrders.actualFinishDate, windowStart),
        ));
      // priorOccurrences includes the WO just closed above (already
      // written to CLOSE by the update before this query runs), so the
      // count already reflects "this occurrence + however many others."
      const occurrencesInWindow = priorOccurrences.length;
      repeatFailure = { isRepeat: occurrencesInWindow >= 2, occurrencesInWindow, windowDays };

      if (repeatFailure.isRepeat) {
        void globalEventBus.emit('WO_REPEAT_FAILURE_DETECTED', {
          tenantId: tid,
          entityType: 'WorkOrder',
          entityId: id,
          woNum: wo.woNum,
          assetId: wo.assetId,
          assignedToUserId: wo.assignedToUserId,
          subject: `Repeat failure detected on Work Order ${wo.woNum}`,
          body: `<p>The same failure Problem code has now occurred <strong>${occurrencesInWindow} times</strong> on this Asset within the last ${windowDays} days.</p>`,
          context: { wo_num: wo.woNum, occurrences: occurrencesInWindow, window_days: windowDays },
        }).catch((e: unknown) => console.warn('[repeat-failure] notification emit failed:', e));
      }
    }

    return { ...updated, repeatFailure };
  });
 
  // ─── Apply Job Plan ───────────────────────────────────────────────────────────
 
  app.post('/work-orders/:id/apply-job-plan', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { jobPlanId?: string };
    const tid = request.user!.tenantId;

    const [wo] = await db.select().from(workOrders)
      .where(and(eq(workOrders.id, id), eq(workOrders.tenantId, tid))).limit(1);
    if (!wo) return reply.code(404).send({ error: 'Work order not found' });

    // FIX: the toolbar "Apply Job Plan" button sends this endpoint no
    // body at all (see WODetail.tsx applyJobPlan) — relying entirely on
    // this only ever working by accident, when the WO happened to
    // already have a jobPlanId set from creation and body.jobPlanId
    // being undefined didn't matter because nothing downstream checked
    // it. Falls back to the WO's own jobPlanId when the request doesn't
    // supply one; if neither exists, there's nothing to apply.
    const jobPlanId = body.jobPlanId ?? wo.jobPlanId;
    if (!jobPlanId) {
      return reply.code(400).send({
        error: 'No job plan to apply — set one via Edit first, or pass jobPlanId explicitly.',
      });
    }

    // FIX: applyJobPlanToWo unconditionally inserts a fresh copy of
    // every task/labour/material/tool/safety line from the job plan on
    // every call, with no check for whether it's already been applied —
    // clicking "Apply Job Plan" twice (a double-click, a slow network
    // retry, re-clicking after not seeing an immediate visual change,
    // etc.) silently duplicated the entire job plan's contents onto the
    // WO, over and over, with no error and no warning. Now blocks a
    // second application of the *same* job plan outright; applying a
    // *different* job plan is still allowed (e.g. switching plans
    // deliberately), since that's a real, intentional action.
    if (wo.jobPlanId === jobPlanId) {
      return reply.code(400).send({
        error: 'This job plan has already been applied to this work order. Remove the existing task/labour/material/tool lines first if you need to re-apply it.',
      });
    }

    await applyJobPlanToWo(jobPlanId, id, tid);
    await db.update(workOrders).set({ jobPlanId, updatedAt: new Date() })
      .where(and(eq(workOrders.id, id), eq(workOrders.tenantId, tid)));

    return reply.send({ success: true });
  });

  // ─── Costs summary ────────────────────────────────────────────────────────────
 
  app.get('/work-orders/:id/costs', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    const [wo] = await db.select({ status: workOrders.status, laborCost: workOrders.laborCost, materialCost: workOrders.materialCost, toolCost: workOrders.toolCost, serviceCost: workOrders.serviceCost, totalCost: workOrders.totalCost })
      .from(workOrders).where(and(eq(workOrders.id, id), eq(workOrders.tenantId, tid))).limit(1);
    if (!wo) return reply.code(404).send({ error: 'Work order not found' });

    const [labourRows, materialRows, toolRows, serviceRows] = await Promise.all([
      db.select().from(woLabour).where(eq(woLabour.woId, id)),
      db.select().from(woMaterials).where(eq(woMaterials.woId, id)),
      db.select().from(woTools).where(eq(woTools.woId, id)),
      db.select().from(woServices).where(eq(woServices.woId, id)),
    ]);

    // FIX: this previously returned only wo.laborCost/materialCost/
    // toolCost/serviceCost/totalCost — columns on work_orders itself
    // that only get populated by the roll-up logic in POST
    // /work-orders/:id/close. For any WO that isn't CLOSEd yet, those
    // columns are still their zero default, so the Costs tab showed
    // $0 across the board even with real labour/material/tool lines
    // attached (visible right there in the Labour(1)/Materials(1)/
    // Tools(1) tab counts). Computing live sums from the actual line
    // items means the Costs tab reflects reality at any WO status, not
    // just after closing — while still returning the frozen
    // wo.*Cost columns too (as frozenSummary) for anyone specifically
    // checking what got locked in at close.
    const sum = (rows: Array<{ totalCost?: string | null; cost?: string | null }>) =>
      rows.reduce((acc, r) => acc + parseFloat(String(r.totalCost ?? r.cost ?? '0')) || acc, 0);

    const laborCost = labourRows.reduce((acc, r) => acc + (parseFloat(String(r.totalCost ?? '0')) || 0), 0);
    const materialCost = sum(materialRows);
    const toolCost = sum(toolRows);
    const serviceCost = sum(serviceRows);
    const totalCost = laborCost + materialCost + toolCost + serviceCost;

    return {
      summary: {
        laborCost: laborCost.toFixed(2),
        materialCost: materialCost.toFixed(2),
        toolCost: toolCost.toFixed(2),
        serviceCost: serviceCost.toFixed(2),
        totalCost: totalCost.toFixed(2),
      },
      frozenSummary: wo.status === 'CLOSE' ? wo : null,
      labour: labourRows,
      materials: materialRows,
      tools: toolRows,
      services: serviceRows,
    };
  });
 
  // ─── Tasks ────────────────────────────────────────────────────────────────────
 
  app.get('/work-orders/:id/tasks', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    try {
      return await db.select().from(woTasks).where(eq(woTasks.woId, id)).orderBy(woTasks.sequence);
    } catch { return []; }
  });
 
  app.post('/work-orders/:id/tasks', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof woTasks.$inferInsert>;
    const tid = request.user!.tenantId;
    const [row] = await db.insert(woTasks).values({ woId: id, tenantId: tid, ...body } as typeof woTasks.$inferInsert).returning();
    return reply.code(201).send(row);
  });
 
  app.put('/work-orders/:id/tasks/:taskId', writeGuard, async (request, reply) => {
    const { taskId } = request.params as { id: string; taskId: string };
    const body = request.body as Partial<typeof woTasks.$inferInsert>;
    const [row] = await db.update(woTasks).set({ ...body, updatedAt: new Date() })
      .where(eq(woTasks.id, taskId)).returning();
    if (!row) return reply.code(404).send({ error: 'Task not found' });
    return row;
  });
 
  app.delete('/work-orders/:id/tasks/:taskId', writeGuard, async (request, reply) => {
    const { taskId } = request.params as { id: string; taskId: string };
    await db.delete(woTasks).where(eq(woTasks.id, taskId));
    return reply.code(204).send();
  });
 
  // ─── Labour ───────────────────────────────────────────────────────────────────
 
  app.get('/work-orders/:id/labour', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    try {
      return await db.select().from(woLabour).where(eq(woLabour.woId, id));
    } catch { return []; }
  });
 
  app.post('/work-orders/:id/labour', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof woLabour.$inferInsert>;
    const tid = request.user!.tenantId;

    const frozen = await costLinesFrozenReason(id, tid);
    if (frozen) return reply.code(400).send({ error: frozen });

    const regularHours = parseFloat(String(body.regularHours ?? '0'));
    const overtimeHours = parseFloat(String(body.overtimeHours ?? '0'));
    const regularRate = parseFloat(String(body.regularRate ?? '0'));
    const overtimeRate = parseFloat(String(body.overtimeRate ?? regularRate));
    const totalCost = regularHours * regularRate + overtimeHours * overtimeRate;
 
    const [row] = await db.insert(woLabour).values({
      woId: id,
      tenantId: tid,
      userId: body.userId ?? request.user!.id,
      craft: body.craft ?? 'GEN',
      workDate: body.workDate ? new Date(String(body.workDate)) : new Date(),
      regularHours: regularHours.toString(),
      overtimeHours: overtimeHours.toString(),
      regularRate: regularRate.toString(),
      overtimeRate: overtimeRate.toString(),
      totalCost: totalCost.toString(),
      taskId: body.taskId,
      notes: body.notes,
    }).returning();
 
    return reply.code(201).send(row);
  });
 
  app.post('/work-orders/:id/labour/:labourId/approve', approveGuard, async (request, reply) => {
    const { labourId } = request.params as { id: string; labourId: string };
    const [row] = await db.update(woLabour).set({
      approved: true,
      approvedByUserId: request.user!.id,
      approvedAt: new Date(),
    }).where(and(eq(woLabour.id, labourId))).returning();
    if (!row) return reply.code(404).send({ error: 'Labour entry not found' });
    return row;
  });
 
  app.put('/work-orders/:id/labour/:labourId', writeGuard, async (request, reply) => {
    const { id, labourId } = request.params as { id: string; labourId: string };
    const body = request.body as Partial<typeof woLabour.$inferInsert>;
    const tid = request.user!.tenantId;

    const frozen = await costLinesFrozenReason(id, tid);
    if (frozen) return reply.code(400).send({ error: frozen });

    const [row] = await db.update(woLabour).set(body).where(eq(woLabour.id, labourId)).returning();
    if (!row) return reply.code(404).send({ error: 'Labour entry not found' });
    return row;
  });
 
  app.delete('/work-orders/:id/labour/:labourId', writeGuard, async (request, reply) => {
    const { id, labourId } = request.params as { id: string; labourId: string };
    const tid = request.user!.tenantId;

    const frozen = await costLinesFrozenReason(id, tid);
    if (frozen) return reply.code(400).send({ error: frozen });

    await db.delete(woLabour).where(eq(woLabour.id, labourId));
    return reply.code(204).send();
  });
 
  // ─── Materials ────────────────────────────────────────────────────────────────
 
  app.get('/work-orders/:id/materials', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    try {
      return await db.select().from(woMaterials).where(eq(woMaterials.woId, id));
    } catch { return []; }
  });
 
  app.post('/work-orders/:id/materials', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof woMaterials.$inferInsert>;
    const tid = request.user!.tenantId;

    const frozen = await costLinesFrozenReason(id, tid);
    if (frozen) return reply.code(400).send({ error: frozen });

    // FIX: unlike labour (which already computes totalCost server-side
    // from hours × rate), materials never computed this at all — the
    // row saved qtyActual and unitCost but left totalCost NULL forever,
    // so the WO's Costs tab (which sums these columns) showed $0 even
    // with real material lines attached.
    const qtyActual = parseFloat(String(body.qtyActual ?? body.qtyPlanned ?? '0'));
    const unitCost = parseFloat(String(body.unitCost ?? '0'));
    const totalCost = Number.isFinite(qtyActual) && Number.isFinite(unitCost) ? (qtyActual * unitCost).toFixed(2) : undefined;

    const [row] = await db.insert(woMaterials).values({
      woId: id,
      tenantId: tid,
      ...body,
      totalCost,
    } as typeof woMaterials.$inferInsert).returning();
    return reply.code(201).send(row);
  });
 
  app.put('/work-orders/:id/materials/:matId', writeGuard, async (request, reply) => {
    const { id, matId } = request.params as { id: string; matId: string };
    const body = request.body as Partial<typeof woMaterials.$inferInsert>;
    const tid = request.user!.tenantId;

    const frozen = await costLinesFrozenReason(id, tid);
    if (frozen) return reply.code(400).send({ error: frozen });

    // FIX: same missing totalCost computation as the POST route above —
    // editing qty/unitCost on an existing line never recalculated the
    // stored total, leaving it stale (or still null) after an edit.
    const [existing] = await db.select().from(woMaterials).where(eq(woMaterials.id, matId)).limit(1);
    const mergedQty = parseFloat(String(body.qtyActual ?? body.qtyPlanned ?? existing?.qtyActual ?? existing?.qtyPlanned ?? '0'));
    const mergedUnitCost = parseFloat(String(body.unitCost ?? existing?.unitCost ?? '0'));
    const recomputedTotal = Number.isFinite(mergedQty) && Number.isFinite(mergedUnitCost) ? (mergedQty * mergedUnitCost).toFixed(2) : undefined;

    const [row] = await db.update(woMaterials).set({ ...body, totalCost: recomputedTotal, updatedAt: new Date() })
      .where(eq(woMaterials.id, matId)).returning();
    if (!row) return reply.code(404).send({ error: 'Material entry not found' });
    return row;
  });
 
  app.delete('/work-orders/:id/materials/:matId', writeGuard, async (request, reply) => {
    const { id, matId } = request.params as { id: string; matId: string };
    const tid = request.user!.tenantId;

    const frozen = await costLinesFrozenReason(id, tid);
    if (frozen) return reply.code(400).send({ error: frozen });

    await db.delete(woMaterials).where(eq(woMaterials.id, matId));
    return reply.code(204).send();
  });
 
  // ─── Tools ────────────────────────────────────────────────────────────────────
 
  app.get('/work-orders/:id/tools', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    try {
      return await db.select().from(woTools).where(eq(woTools.woId, id));
    } catch { return []; }
  });
 
  app.post('/work-orders/:id/tools', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof woTools.$inferInsert>;
    const tid = request.user!.tenantId;

    const frozen = await costLinesFrozenReason(id, tid);
    if (frozen) return reply.code(400).send({ error: frozen });

    // FIX: same missing totalCost computation as materials — qtyActual
    // × chargeRate was collected but never multiplied into totalCost,
    // so tool lines always contributed $0 to the WO's Costs tab.
    const qtyActual = parseFloat(String(body.qtyActual ?? body.qtyPlanned ?? '0'));
    const chargeRate = parseFloat(String(body.chargeRate ?? '0'));
    const totalCost = Number.isFinite(qtyActual) && Number.isFinite(chargeRate) ? (qtyActual * chargeRate).toFixed(2) : undefined;

    const [row] = await db.insert(woTools).values({
      woId: id,
      tenantId: tid,
      ...body,
      totalCost,
    } as typeof woTools.$inferInsert).returning();
    return reply.code(201).send(row);
  });
 
  app.put('/work-orders/:id/tools/:toolId', writeGuard, async (request, reply) => {
    const { id, toolId } = request.params as { id: string; toolId: string };
    const body = request.body as Partial<typeof woTools.$inferInsert>;
    const tid = request.user!.tenantId;

    const frozen = await costLinesFrozenReason(id, tid);
    if (frozen) return reply.code(400).send({ error: frozen });

    const [existing] = await db.select().from(woTools).where(eq(woTools.id, toolId)).limit(1);
    const mergedQty = parseFloat(String(body.qtyActual ?? body.qtyPlanned ?? existing?.qtyActual ?? existing?.qtyPlanned ?? '0'));
    const mergedRate = parseFloat(String(body.chargeRate ?? existing?.chargeRate ?? '0'));
    const recomputedTotal = Number.isFinite(mergedQty) && Number.isFinite(mergedRate) ? (mergedQty * mergedRate).toFixed(2) : undefined;

    const [row] = await db.update(woTools).set({ ...body, totalCost: recomputedTotal }).where(eq(woTools.id, toolId)).returning();
    if (!row) return reply.code(404).send({ error: 'Tool entry not found' });
    return row;
  });
 
  app.delete('/work-orders/:id/tools/:toolId', writeGuard, async (request, reply) => {
    const { id, toolId } = request.params as { id: string; toolId: string };
    const tid = request.user!.tenantId;

    const frozen = await costLinesFrozenReason(id, tid);
    if (frozen) return reply.code(400).send({ error: frozen });

    await db.delete(woTools).where(eq(woTools.id, toolId));
    return reply.code(204).send();
  });
 
  // ─── Services ─────────────────────────────────────────────────────────────────
 
  app.get('/work-orders/:id/services', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    return db.select().from(woServices).where(eq(woServices.woId, id));
  });
 
  app.post('/work-orders/:id/services', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof woServices.$inferInsert>;
    const tid = request.user!.tenantId;

    const frozen = await costLinesFrozenReason(id, tid);
    if (frozen) return reply.code(400).send({ error: frozen });

    const [row] = await db.insert(woServices).values({ woId: id, tenantId: tid, ...body } as typeof woServices.$inferInsert).returning();
    return reply.code(201).send(row);
  });
 
  app.put('/work-orders/:id/services/:svcId', writeGuard, async (request, reply) => {
    const { id, svcId } = request.params as { id: string; svcId: string };
    const body = request.body as Partial<typeof woServices.$inferInsert>;
    const tid = request.user!.tenantId;

    const frozen = await costLinesFrozenReason(id, tid);
    if (frozen) return reply.code(400).send({ error: frozen });

    const [row] = await db.update(woServices).set(body).where(eq(woServices.id, svcId)).returning();
    if (!row) return reply.code(404).send({ error: 'Service entry not found' });
    return row;
  });
 
  app.delete('/work-orders/:id/services/:svcId', writeGuard, async (request, reply) => {
    const { id, svcId } = request.params as { id: string; svcId: string };
    const tid = request.user!.tenantId;

    const frozen = await costLinesFrozenReason(id, tid);
    if (frozen) return reply.code(400).send({ error: frozen });

    await db.delete(woServices).where(eq(woServices.id, svcId));
    return reply.code(204).send();
  });
 
  // ─── Safety ───────────────────────────────────────────────────────────────────
 
  app.get('/work-orders/:id/safety', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    try {
      return await db.select().from(woSafety).where(eq(woSafety.woId, id));
    } catch { return []; }
  });
 
  app.post('/work-orders/:id/safety', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof woSafety.$inferInsert>;
    const tid = request.user!.tenantId;
    const [row] = await db.insert(woSafety).values({ woId: id, tenantId: tid, ...body } as typeof woSafety.$inferInsert).returning();
    return reply.code(201).send(row);
  });
 
  app.put('/work-orders/:id/safety/:safetyId', writeGuard, async (request, reply) => {
    const { safetyId } = request.params as { id: string; safetyId: string };
    const body = request.body as Partial<typeof woSafety.$inferInsert>;
    const [row] = await db.update(woSafety).set(body).where(eq(woSafety.id, safetyId)).returning();
    if (!row) return reply.code(404).send({ error: 'Safety item not found' });
    return row;
  });
 
  app.delete('/work-orders/:id/safety/:safetyId', writeGuard, async (request, reply) => {
    const { safetyId } = request.params as { id: string; safetyId: string };
    await db.delete(woSafety).where(eq(woSafety.id, safetyId));
    return reply.code(204).send();
  });
}
 
/** Copies job plan tasks/labour/materials/tools/safety into a WO */
export async function applyJobPlanToWo(jobPlanId: string, woId: string, tenantId: string): Promise<void> {
  const tasks = await db.select({
    id: jobPlanTasks.id,
    sequence: jobPlanTasks.sequence,
    description: jobPlanTasks.description,
    taskType: jobPlanTasks.taskType,
    estimatedHours: jobPlanTasks.estimatedHours,
    instructions: jobPlanTasks.instructions,
  }).from(jobPlanTasks).where(eq(jobPlanTasks.jpId, jobPlanId)).orderBy(jobPlanTasks.sequence);
 
  const taskIdMap = new Map<string, string>();
  for (const t of tasks) {
    // Only pass fields that exist in schema — no undefined values
    const insertVal: Record<string, unknown> = {
      woId,
      tenantId,
      sequence: t.sequence ?? 0,
      description: t.description ?? '',
    };
    if (t.taskType !== undefined && t.taskType !== null) insertVal.taskType = t.taskType;
    if (t.estimatedHours !== undefined && t.estimatedHours !== null) insertVal.estimatedHours = t.estimatedHours;
    if (t.instructions !== undefined && t.instructions !== null) insertVal.instructions = t.instructions;
 
    const [woTask] = await db.insert(woTasks).values(insertVal as typeof woTasks.$inferInsert).returning({ id: woTasks.id });
    if (woTask) taskIdMap.set(t.id, woTask.id);
  }
 
  const labour = await db.select({
    id: jobPlanLabour.id,
    craft: jobPlanLabour.craft,
    hours: jobPlanLabour.hours,
    rate: jobPlanLabour.rate,
    taskId: jobPlanLabour.taskId,
  }).from(jobPlanLabour).where(eq(jobPlanLabour.jpId, jobPlanId));
 
  for (const l of labour) {
    const insertVal: Record<string, unknown> = {
      woId,
      tenantId,
      craft: l.craft ?? 'GEN',
      workDate: new Date(),
      regularHours: String(l.hours ?? '0'),
    };
    if (l.taskId) insertVal.taskId = taskIdMap.get(l.taskId) ?? null;
    if (l.rate !== undefined && l.rate !== null) insertVal.regularRate = String(l.rate);
 
    await db.insert(woLabour).values(insertVal as typeof woLabour.$inferInsert);
  }
 
  const materials = await db.select({
    id: jobPlanMaterials.id,
    description: jobPlanMaterials.description,
    itemNum: jobPlanMaterials.itemNum,
    quantity: jobPlanMaterials.quantity,
    unitCost: jobPlanMaterials.unitCost,
    taskId: jobPlanMaterials.taskId,
  }).from(jobPlanMaterials).where(eq(jobPlanMaterials.jpId, jobPlanId));
 
  for (const m of materials) {
    const insertVal: Record<string, unknown> = {
      woId,
      tenantId,
      description: m.description ?? '',
      qtyPlanned: String(m.quantity ?? '1'),
    };
    if (m.taskId) insertVal.taskId = taskIdMap.get(m.taskId) ?? null;
    if (m.itemNum !== undefined && m.itemNum !== null) insertVal.itemNum = m.itemNum;
    if (m.unitCost !== undefined && m.unitCost !== null) insertVal.unitCost = String(m.unitCost);
 
    await db.insert(woMaterials).values(insertVal as typeof woMaterials.$inferInsert);
  }
 
  const tools = await db.select({
    id: jobPlanTools.id,
    toolDescription: jobPlanTools.toolDescription,
    quantity: jobPlanTools.quantity,
    taskId: jobPlanTools.taskId,
  }).from(jobPlanTools).where(eq(jobPlanTools.jpId, jobPlanId));
 
  for (const t of tools) {
    const insertVal: Record<string, unknown> = {
      woId,
      tenantId,
      description: t.toolDescription ?? 'Tool',
    };
    if (t.taskId) insertVal.taskId = taskIdMap.get(t.taskId) ?? null;
    if (t.quantity !== undefined && t.quantity !== null) insertVal.qtyPlanned = Number(t.quantity);
 
    await db.insert(woTools).values(insertVal as typeof woTools.$inferInsert);
  }
 
  const safety = await db.select({
    id: jobPlanSafety.id,
    hazard: jobPlanSafety.hazard,
    control: jobPlanSafety.control,
    ppe: jobPlanSafety.ppe,
    sequence: jobPlanSafety.sequence,
  }).from(jobPlanSafety).where(eq(jobPlanSafety.jpId, jobPlanId)).orderBy(jobPlanSafety.sequence);
 
  for (const s of safety) {
    const insertVal: Record<string, unknown> = {
      woId,
      tenantId,
      hazard: s.hazard ?? '',
      control: s.control ?? '',
      sequence: s.sequence ?? 0,
    };
    if (s.ppe !== undefined && s.ppe !== null) insertVal.ppe = s.ppe;
 
    await db.insert(woSafety).values(insertVal as typeof woSafety.$inferInsert);
  }
}
 