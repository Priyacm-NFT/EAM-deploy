import type { FastifyInstance } from 'fastify';
import { eq, and, desc, ilike, or } from 'drizzle-orm';
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
} from '@eam/db';
import { requirePermission } from '../plugins/auth.js';
import { dispatchWebhookEvent } from '../lib/webhooks.js';
import { globalEventBus } from '@eam/shared';
import { WorkflowEngine } from '@eam/workflow-engine';
import { checkMandatoryAttachments } from './admin-attachments.js';
import { FieldRulesService } from '@eam/config-engine';

const readGuard = { preHandler: requirePermission('work_orders:read') };
const writeGuard = { preHandler: requirePermission('work_orders:write') };
const approveGuard = { preHandler: requirePermission('work_orders:approve') };

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
          siteId ? eq(workOrders.siteId, siteId) : undefined,
          assetId ? eq(workOrders.assetId, assetId) : undefined,
          assignedToUserId ? eq(workOrders.assignedToUserId, assignedToUserId) : undefined,
          q
            ? or(
                ilike(workOrders.woNum, `%${q}%`),
                ilike(workOrders.description, `%${q}%`),
              )
            : undefined,
        ),
      )
      .orderBy(desc(workOrders.updatedAt))
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

    const count = await db.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.tenantId, tid));
    const woNum = `WO-${String(count.length + 1).padStart(6, '0')}`;

    const [row] = await db.insert(workOrders).values({
      tenantId: tid,
      woNum,
      description: body.description,
      longDescription: body.longDescription,
      type: (body.type ?? 'CM') as typeof workOrders.$inferInsert.type,
      priority: (body.priority ?? 'MEDIUM') as typeof workOrders.$inferInsert.priority,
      assetId: body.assetId,
      locationId: body.locationId,
      siteId: body.siteId,
      srId: body.srId,
      jobPlanId: body.jobPlanId,
      assignedToUserId: body.assignedToUserId,
      targetStartDate: body.targetStartDate ? new Date(body.targetStartDate) : undefined,
      targetFinishDate: body.targetFinishDate ? new Date(body.targetFinishDate) : undefined,
      customData: body.customData ?? {},
    }).returning();

    // If job plan specified, copy its content
    if (body.jobPlanId) {
      await applyJobPlanToWo(body.jobPlanId, row!.id, tid);
    }

    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'CREATE', resource: 'WorkOrder', resourceId: row!.id });
    void dispatchWebhookEvent(tid, 'WO_CREATED', { woId: row!.id, woNum: row!.woNum });
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
        // Joined display fields
        assetNum: assets.assetNum,
        locationName: locations.name,
        siteName: sites.name,
        jobPlanDescription: jobPlans.description,
      })
      .from(workOrders)
      .leftJoin(assets, eq(workOrders.assetId, assets.id))
      .leftJoin(locations, eq(workOrders.locationId, locations.id))
      .leftJoin(sites, eq(workOrders.siteId, sites.id))
      .leftJoin(jobPlans, eq(workOrders.jobPlanId, jobPlans.id))
      .where(and(eq(workOrders.id, id), eq(workOrders.tenantId, tid)))
      .limit(1);
    if (!wo) return reply.code(404).send({ error: 'Work order not found' });

    // Safe fetch helper — returns [] if table has missing columns
    const safeFetch = async <T>(promise: Promise<T[]>): Promise<T[]> => {
      try { return await promise; } catch { return []; }
    };

    const [tasks, labour, materials, tools, services, safety, activePermits] = await Promise.all([
      safeFetch(db.select({ id: woTasks.id, woId: woTasks.woId, description: woTasks.description }).from(woTasks).where(eq(woTasks.woId, id))),
      safeFetch(db.select({ id: woLabour.id, woId: woLabour.woId }).from(woLabour).where(eq(woLabour.woId, id))),
      safeFetch(db.select({ id: woMaterials.id, woId: woMaterials.woId, description: woMaterials.description }).from(woMaterials).where(eq(woMaterials.woId, id))),
      safeFetch(db.select({ id: woTools.id, woId: woTools.woId, description: woTools.description }).from(woTools).where(eq(woTools.woId, id))),
      safeFetch(db.select({ id: woServices.id, woId: woServices.woId, description: woServices.description }).from(woServices).where(eq(woServices.woId, id))),
      safeFetch(db.select({ id: woSafety.id, woId: woSafety.woId }).from(woSafety).where(eq(woSafety.woId, id))),
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

    // Validate via status set
    const [woSet] = await db.select().from(statusSets)
      .where(and(eq(statusSets.entityType, 'WorkOrder'), eq(statusSets.tenantId, tid))).limit(1);

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
    void engine.startWorkflow(
      'WorkOrder',
      id,
      `WO_${wo.status}_TO_${body.toStatus}`,
      tid,
      {
        woId: id,
        woNum: wo.woNum,
        fromStatus: wo.status,
        toStatus: body.toStatus,
        requesterId: (wo as Record<string, unknown>).requesterId as string ?? request.user!.id,
        assignedToUserId: wo.assignedToUserId,
        assetId: wo.assetId,
        priority: wo.priority,
        totalcost: parseFloat(wo.totalCost ?? '0'),
      },
    );

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
    return updated;
  });

  // ─── Apply Job Plan ───────────────────────────────────────────────────────────

  app.post('/work-orders/:id/apply-job-plan', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { jobPlanId: string };
    const tid = request.user!.tenantId;

    const [wo] = await db.select().from(workOrders)
      .where(and(eq(workOrders.id, id), eq(workOrders.tenantId, tid))).limit(1);
    if (!wo) return reply.code(404).send({ error: 'Work order not found' });

    await applyJobPlanToWo(body.jobPlanId, id, tid);
    await db.update(workOrders).set({ jobPlanId: body.jobPlanId, updatedAt: new Date() })
      .where(and(eq(workOrders.id, id), eq(workOrders.tenantId, tid)));

    return reply.send({ success: true });
  });

  // ─── Costs summary ────────────────────────────────────────────────────────────

  app.get('/work-orders/:id/costs', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    const [wo] = await db.select({ laborCost: workOrders.laborCost, materialCost: workOrders.materialCost, toolCost: workOrders.toolCost, serviceCost: workOrders.serviceCost, totalCost: workOrders.totalCost })
      .from(workOrders).where(and(eq(workOrders.id, id), eq(workOrders.tenantId, tid))).limit(1);
    if (!wo) return reply.code(404).send({ error: 'Work order not found' });

    const [labourRows, materialRows, toolRows, serviceRows] = await Promise.all([
      db.select().from(woLabour).where(eq(woLabour.woId, id)),
      db.select().from(woMaterials).where(eq(woMaterials.woId, id)),
      db.select().from(woTools).where(eq(woTools.woId, id)),
      db.select().from(woServices).where(eq(woServices.woId, id)),
    ]);

    return {
      summary: wo,
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
      return await db.select({ id: woTasks.id, woId: woTasks.woId, description: woTasks.description }).from(woTasks).where(eq(woTasks.woId, id));
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
      return await db.select({ id: woLabour.id, woId: woLabour.woId }).from(woLabour).where(eq(woLabour.woId, id));
    } catch { return []; }
  });

  app.post('/work-orders/:id/labour', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof woLabour.$inferInsert>;
    const tid = request.user!.tenantId;

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
    const { labourId } = request.params as { id: string; labourId: string };
    const body = request.body as Partial<typeof woLabour.$inferInsert>;
    const [row] = await db.update(woLabour).set(body).where(eq(woLabour.id, labourId)).returning();
    if (!row) return reply.code(404).send({ error: 'Labour entry not found' });
    return row;
  });

  app.delete('/work-orders/:id/labour/:labourId', writeGuard, async (request, reply) => {
    const { labourId } = request.params as { id: string; labourId: string };
    await db.delete(woLabour).where(eq(woLabour.id, labourId));
    return reply.code(204).send();
  });

  // ─── Materials ────────────────────────────────────────────────────────────────

  app.get('/work-orders/:id/materials', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    try {
      return await db.select({ id: woMaterials.id, woId: woMaterials.woId, description: woMaterials.description }).from(woMaterials).where(eq(woMaterials.woId, id));
    } catch { return []; }
  });

  app.post('/work-orders/:id/materials', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof woMaterials.$inferInsert>;
    const tid = request.user!.tenantId;
    const [row] = await db.insert(woMaterials).values({ woId: id, tenantId: tid, ...body } as typeof woMaterials.$inferInsert).returning();
    return reply.code(201).send(row);
  });

  app.put('/work-orders/:id/materials/:matId', writeGuard, async (request, reply) => {
    const { matId } = request.params as { id: string; matId: string };
    const body = request.body as Partial<typeof woMaterials.$inferInsert>;
    const [row] = await db.update(woMaterials).set({ ...body, updatedAt: new Date() })
      .where(eq(woMaterials.id, matId)).returning();
    if (!row) return reply.code(404).send({ error: 'Material entry not found' });
    return row;
  });

  app.delete('/work-orders/:id/materials/:matId', writeGuard, async (request, reply) => {
    const { matId } = request.params as { id: string; matId: string };
    await db.delete(woMaterials).where(eq(woMaterials.id, matId));
    return reply.code(204).send();
  });

  // ─── Tools ────────────────────────────────────────────────────────────────────

  app.get('/work-orders/:id/tools', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    try {
      return await db.select({ id: woTools.id, woId: woTools.woId, description: woTools.description }).from(woTools).where(eq(woTools.woId, id));
    } catch { return []; }
  });

  app.post('/work-orders/:id/tools', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof woTools.$inferInsert>;
    const tid = request.user!.tenantId;
    const [row] = await db.insert(woTools).values({ woId: id, tenantId: tid, ...body } as typeof woTools.$inferInsert).returning();
    return reply.code(201).send(row);
  });

  app.put('/work-orders/:id/tools/:toolId', writeGuard, async (request, reply) => {
    const { toolId } = request.params as { id: string; toolId: string };
    const body = request.body as Partial<typeof woTools.$inferInsert>;
    const [row] = await db.update(woTools).set(body).where(eq(woTools.id, toolId)).returning();
    if (!row) return reply.code(404).send({ error: 'Tool entry not found' });
    return row;
  });

  app.delete('/work-orders/:id/tools/:toolId', writeGuard, async (request, reply) => {
    const { toolId } = request.params as { id: string; toolId: string };
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
    const [row] = await db.insert(woServices).values({ woId: id, tenantId: tid, ...body } as typeof woServices.$inferInsert).returning();
    return reply.code(201).send(row);
  });

  app.put('/work-orders/:id/services/:svcId', writeGuard, async (request, reply) => {
    const { svcId } = request.params as { id: string; svcId: string };
    const body = request.body as Partial<typeof woServices.$inferInsert>;
    const [row] = await db.update(woServices).set(body).where(eq(woServices.id, svcId)).returning();
    if (!row) return reply.code(404).send({ error: 'Service entry not found' });
    return row;
  });

  app.delete('/work-orders/:id/services/:svcId', writeGuard, async (request, reply) => {
    const { svcId } = request.params as { id: string; svcId: string };
    await db.delete(woServices).where(eq(woServices.id, svcId));
    return reply.code(204).send();
  });

  // ─── Safety ───────────────────────────────────────────────────────────────────

  app.get('/work-orders/:id/safety', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    try {
      return await db.select({ id: woSafety.id, woId: woSafety.woId }).from(woSafety).where(eq(woSafety.woId, id));
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
async function applyJobPlanToWo(jobPlanId: string, woId: string, tenantId: string): Promise<void> {
  const [jp] = await db.select().from(jobPlans).where(eq(jobPlans.id, jobPlanId)).limit(1);
  if (!jp) return;

  const [tasks, labour, materials, tools, safety] = await Promise.all([
    db.select().from(jobPlanTasks).where(eq(jobPlanTasks.jpId, jobPlanId)).orderBy(jobPlanTasks.sequence),
    db.select().from(jobPlanLabour).where(eq(jobPlanLabour.jpId, jobPlanId)),
    db.select().from(jobPlanMaterials).where(eq(jobPlanMaterials.jpId, jobPlanId)),
    db.select().from(jobPlanTools).where(eq(jobPlanTools.jpId, jobPlanId)),
    db.select().from(jobPlanSafety).where(eq(jobPlanSafety.jpId, jobPlanId)).orderBy(jobPlanSafety.sequence),
  ]);

  // Map jp task IDs to newly created wo task IDs
  const taskIdMap = new Map<string, string>();
  for (const t of tasks) {
    const [woTask] = await db.insert(woTasks).values({
      woId,
      tenantId,
      sequence: t.sequence,
      description: t.description,
      taskType: t.taskType,
      estimatedHours: t.estimatedHours,
      instructions: t.instructions,
    }).returning();
    taskIdMap.set(t.id, woTask!.id);
  }

  if (labour.length > 0) {
    await db.insert(woLabour).values(labour.map((l) => ({
      woId,
      tenantId,
      taskId: l.taskId ? taskIdMap.get(l.taskId) : undefined,
      craft: l.craft,
      workDate: new Date(),
      regularHours: l.hours,
      regularRate: l.rate,
    })));
  }

  if (materials.length > 0) {
    await db.insert(woMaterials).values(materials.map((m) => ({
      woId,
      tenantId,
      taskId: m.taskId ? taskIdMap.get(m.taskId) : undefined,
      itemNum: m.itemNum,
      description: m.description,
      qtyPlanned: m.quantity,
      unitCost: m.unitCost,
    })));
  }

  if (tools.length > 0) {
    await db.insert(woTools).values(tools.map((t) => ({
      woId,
      tenantId,
      taskId: t.taskId ? taskIdMap.get(t.taskId) : undefined,
      description: t.toolDescription,
      qtyPlanned: t.quantity,
    })));
  }

  if (safety.length > 0) {
    await db.insert(woSafety).values(safety.map((s) => ({
      woId,
      tenantId,
      hazard: s.hazard,
      control: s.control,
      ppe: s.ppe,
      sequence: s.sequence,
    })));
  }
}
