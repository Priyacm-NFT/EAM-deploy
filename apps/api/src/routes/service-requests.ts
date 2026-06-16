import type { FastifyInstance } from 'fastify';
import { eq, and, desc, ilike, or, lt } from 'drizzle-orm';
import {
  db,
  serviceRequests,
  workOrders,
  assets,
  locations,
  sites,
  users,
  statusSets,
  statusTransitions,
  audit,
} from '@eam/db';
import { entityDefinitions, fieldDefinitions } from '@eam/db';
import { FieldRulesService } from '@eam/config-engine';
import { requirePermission } from '../plugins/auth.js';
import { dispatchWebhookEvent } from '../lib/webhooks.js';

const readGuard = { preHandler: requirePermission('service_requests:read') };
const writeGuard = { preHandler: requirePermission('service_requests:write') };

/** Map priority to SLA target hours */
const SLA_HOURS: Record<string, number> = {
  URGENT: 4,
  HIGH: 8,
  MEDIUM: 24,
  LOW: 72,
};

export async function serviceRequestRoutes(app: FastifyInstance) {

// ── Custom field validation helper ──────────────────────────────────────────
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
// ─────────────────────────────────────────────────────────────────────────────

  // ─── List ─────────────────────────────────────────────────────────────────────

  app.get('/service-requests', readGuard, async (request) => {
    const { status, priority, siteId, assetId, category, slaBreached, q, page, pageSize } =
      request.query as {
        status?: string;
        priority?: string;
        siteId?: string;
        assetId?: string;
        category?: string;
        slaBreached?: string;
        q?: string;
        page?: string;
        pageSize?: string;
      };
    const tid = request.user!.tenantId;
    const limit = Math.min(Number(pageSize ?? 50), 200);
    const offset = (Number(page ?? 1) - 1) * limit;

    const rows = await db
      .select({
        id: serviceRequests.id,
        srNum: serviceRequests.srNum,
        description: serviceRequests.description,
        status: serviceRequests.status,
        priority: serviceRequests.priority,
        category: serviceRequests.category,
        channel: serviceRequests.channel,
        slaBreached: serviceRequests.slaBreached,
        slaDueAt: serviceRequests.slaDueAt,
        convertedToWoId: serviceRequests.convertedToWoId,
        createdAt: serviceRequests.createdAt,
        updatedAt: serviceRequests.updatedAt,
        requesterName: users.displayName,
        assetNum: assets.assetNum,
        locationName: locations.name,
        siteName: sites.name,
      })
      .from(serviceRequests)
      .leftJoin(users, eq(serviceRequests.requesterId, users.id))
      .leftJoin(assets, eq(serviceRequests.assetId, assets.id))
      .leftJoin(locations, eq(serviceRequests.locationId, locations.id))
      .leftJoin(sites, eq(serviceRequests.siteId, sites.id))
      .where(
        and(
          eq(serviceRequests.tenantId, tid),
          status ? eq(serviceRequests.status, status as typeof serviceRequests.$inferSelect.status) : undefined,
          priority ? eq(serviceRequests.priority, priority as typeof serviceRequests.$inferSelect.priority) : undefined,
          siteId ? eq(serviceRequests.siteId, siteId) : undefined,
          assetId ? eq(serviceRequests.assetId, assetId) : undefined,
          category ? eq(serviceRequests.category, category) : undefined,
          slaBreached === 'true' ? eq(serviceRequests.slaBreached, true) : undefined,
          q
            ? or(
                ilike(serviceRequests.srNum, `%${q}%`),
                ilike(serviceRequests.description, `%${q}%`),
              )
            : undefined,
        ),
      )
      .orderBy(desc(serviceRequests.createdAt))
      .limit(limit)
      .offset(offset);

    return { data: rows, page: Number(page ?? 1), pageSize: limit };
  });

  // ─── Create ───────────────────────────────────────────────────────────────────

  app.post('/service-requests', writeGuard, async (request, reply) => {
    const body = request.body as {
      description: string;
      priority?: string;
      category?: string;
      channel?: string;
      assetId?: string;
      locationId?: string;
      siteId?: string;
      customData?: Record<string, unknown>;
    };
    const tid = request.user!.tenantId;

    const customData = body.customData ?? {};
    const validation = await validateCustomFields(tid, 'ServiceRequest', { ...body, ...customData }, request.user!.roles ?? []);
    if (!validation.valid) return reply.code(422).send({ error: 'Validation failed', errors: validation.errors });

    const count = await db.select({ id: serviceRequests.id }).from(serviceRequests)
      .where(eq(serviceRequests.tenantId, tid));
    const srNum = `SR-${String(count.length + 1).padStart(6, '0')}`;

    const priority = (body.priority ?? 'MEDIUM') as keyof typeof SLA_HOURS;
    const slaTargetHours = SLA_HOURS[priority] ?? 24;
    const slaDueAt = new Date(Date.now() + slaTargetHours * 3600000);

    const [row] = await db.insert(serviceRequests).values({
      tenantId: tid,
      srNum,
      description: body.description,
      priority: priority as typeof serviceRequests.$inferInsert.priority,
      category: body.category,
      channel: (body.channel ?? 'WEB') as typeof serviceRequests.$inferInsert.channel,
      requesterId: request.user!.id,
      assetId: body.assetId,
      locationId: body.locationId,
      siteId: body.siteId,
      slaTargetHours,
      slaDueAt,
      customData: body.customData ?? {},
    }).returning();

    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'CREATE', resource: 'ServiceRequest', resourceId: row!.id });
    void dispatchWebhookEvent(tid, 'SR_CREATED', { srId: row!.id, srNum: row!.srNum, priority: row!.priority });
    return reply.code(201).send(row);
  });

  // ─── Assignable users (MUST be before /:id routes) ───────────────────────────

  app.get('/service-requests/assignable-users', readGuard, async (request) => {
    const tid = request.user!.tenantId;
    return db
      .select({ id: users.id, displayName: users.displayName, email: users.email })
      .from(users)
      .where(and(eq(users.tenantId, tid), eq(users.isActive, true)))
      .orderBy(users.displayName);
  });

  // ─── Get detail ───────────────────────────────────────────────────────────────

  app.get('/service-requests/:id', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    const [sr] = await db
      .select()
      .from(serviceRequests)
      .where(and(eq(serviceRequests.id, id), eq(serviceRequests.tenantId, tid)))
      .limit(1);
    if (!sr) return reply.code(404).send({ error: 'Service request not found' });

    let convertedWo = null;
    if (sr.convertedToWoId) {
      const [wo] = await db.select({ id: workOrders.id, woNum: workOrders.woNum, status: workOrders.status })
        .from(workOrders).where(eq(workOrders.id, sr.convertedToWoId)).limit(1);
      convertedWo = wo;
    }

    const slaStatus = getSlaStatus(sr);
    return { ...sr, convertedWo, slaStatus };
  });

  // ─── Update ───────────────────────────────────────────────────────────────────

  app.put('/service-requests/:id', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof serviceRequests.$inferInsert>;
    const tid = request.user!.tenantId;

    const [row] = await db.update(serviceRequests)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(serviceRequests.id, id), eq(serviceRequests.tenantId, tid)))
      .returning();

    if (!row) return reply.code(404).send({ error: 'Service request not found' });
    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'UPDATE', resource: 'ServiceRequest', resourceId: id });
    return row;
  });

  // ─── Assign ───────────────────────────────────────────────────────────────────

  app.post('/service-requests/:id/assign', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { assignedToUserId: string | null; comment?: string };
    const tid = request.user!.tenantId;

    const [sr] = await db
      .select()
      .from(serviceRequests)
      .where(and(eq(serviceRequests.id, id), eq(serviceRequests.tenantId, tid)))
      .limit(1);
    if (!sr) return reply.code(404).send({ error: 'Service request not found' });

    if (body.assignedToUserId) {
      const [assignee] = await db
        .select({ id: users.id, displayName: users.displayName, isActive: users.isActive })
        .from(users)
        .where(and(eq(users.id, body.assignedToUserId), eq(users.tenantId, tid)))
        .limit(1);
      if (!assignee) return reply.code(400).send({ error: 'Assignee not found in this tenant' });
      if (!assignee.isActive) return reply.code(400).send({ error: 'Cannot assign to an inactive user' });
    }

    const prevAssignee = sr.assignedToUserId;

    const [updated] = await db
      .update(serviceRequests)
      .set({
        assignedToUserId: body.assignedToUserId ?? null,
        status:
          sr.status === 'NEW' && body.assignedToUserId
            ? 'QUEUED'
            : sr.status,
        updatedAt: new Date(),
      })
      .where(and(eq(serviceRequests.id, id), eq(serviceRequests.tenantId, tid)))
      .returning();

    await audit(db, {
      tenantId: tid,
      userId: request.user!.id,
      action: body.assignedToUserId ? 'ASSIGN' : 'UNASSIGN',
      resource: 'ServiceRequest',
      resourceId: id,
      metadata: {
        prevAssignee,
        newAssignee: body.assignedToUserId ?? null,
        comment: body.comment ?? null,
        autoStatusAdvance: sr.status === 'NEW' && !!body.assignedToUserId,
      },
    });

    void dispatchWebhookEvent(tid, 'SR_ASSIGNED', {
      srId: id,
      srNum: sr.srNum,
      assignedToUserId: body.assignedToUserId ?? null,
      assignedByUserId: request.user!.id,
    });

    const { WorkflowEngine } = await import('@eam/workflow-engine');
    const engine = new WorkflowEngine(db);
    void engine.startWorkflow(
      'ServiceRequest',
      id,
      'SR_ASSIGNED',
      tid,
      {
        srId: id,
        srNum: sr.srNum,
        assignedToUserId: body.assignedToUserId ?? null,
        priority: sr.priority,
        description: sr.description,
      },
    );

    return updated;
  });

  // ─── Status Transition ────────────────────────────────────────────────────────

  app.post('/service-requests/:id/transition', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { toStatus: string; comment?: string };
    const tid = request.user!.tenantId;

    const [sr] = await db.select().from(serviceRequests)
      .where(and(eq(serviceRequests.id, id), eq(serviceRequests.tenantId, tid))).limit(1);
    if (!sr) return reply.code(404).send({ error: 'Service request not found' });

    const [srSet] = await db.select().from(statusSets)
      .where(and(eq(statusSets.entityType, 'ServiceRequest'), eq(statusSets.tenantId, tid))).limit(1);

    if (srSet) {
      const [transition] = await db.select().from(statusTransitions)
        .where(
          and(
            eq(statusTransitions.statusSetId, srSet.id),
            eq(statusTransitions.fromStatus, sr.status),
            eq(statusTransitions.toStatus, body.toStatus),
          ),
        ).limit(1);

      if (!transition) {
        return reply.code(400).send({ error: `Transition from ${sr.status} to ${body.toStatus} is not allowed` });
      }
      if (transition.requiresComment && !body.comment) {
        return reply.code(400).send({ error: 'A comment is required for this transition' });
      }
    }

    const updates: Partial<typeof serviceRequests.$inferInsert> = {
      status: body.toStatus as typeof serviceRequests.$inferInsert.status,
      updatedAt: new Date(),
    };
    if (body.toStatus === 'CLOSED' || body.toStatus === 'RESOLVED') {
      updates.closedAt = new Date();
      if (body.toStatus === 'RESOLVED') updates.resolvedAt = new Date();
      updates.closureNotes = body.comment ?? null;
    }

    const [updated] = await db.update(serviceRequests).set(updates)
      .where(and(eq(serviceRequests.id, id), eq(serviceRequests.tenantId, tid)))
      .returning();

    await audit(db, {
      tenantId: tid,
      userId: request.user!.id,
      action: `STATUS_${body.toStatus}`,
      resource: 'ServiceRequest',
      resourceId: id,
      metadata: { fromStatus: sr.status, toStatus: body.toStatus, comment: body.comment ?? null },
    });

    const { WorkflowEngine } = await import('@eam/workflow-engine');
    const engine = new WorkflowEngine(db);
    void engine.startWorkflow(
      'ServiceRequest',
      id,
      `SR_${sr.status}_TO_${body.toStatus}`,
      tid,
      {
        srId: id,
        srNum: sr.srNum,
        fromStatus: sr.status,
        toStatus: body.toStatus,
        requesterId: sr.requesterId ?? request.user!.id,
        priority: sr.priority,
      },
    );

    return updated;
  });

  // ─── Convert to Work Order ────────────────────────────────────────────────────

  app.post('/service-requests/:id/convert', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      description?: string;
      type?: string;
      priority?: string;
      targetStartDate?: string;
      targetFinishDate?: string;
    };
    const tid = request.user!.tenantId;

    const [sr] = await db.select().from(serviceRequests)
      .where(and(eq(serviceRequests.id, id), eq(serviceRequests.tenantId, tid))).limit(1);
    if (!sr) return reply.code(404).send({ error: 'Service request not found' });
    if (sr.convertedToWoId) return reply.code(409).send({ error: 'SR already converted to a work order' });

    const woCount = await db.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.tenantId, tid));
    const woNum = `WO-${String(woCount.length + 1).padStart(6, '0')}`;

    const [wo] = await db.insert(workOrders).values({
      tenantId: tid,
      woNum,
      description: body.description ?? sr.description,
      type: (body.type ?? 'CM') as typeof workOrders.$inferInsert.type,
      priority: (body.priority ?? sr.priority) as typeof workOrders.$inferInsert.priority,
      assetId: sr.assetId,
      locationId: sr.locationId,
      siteId: sr.siteId,
      srId: id,
      targetStartDate: body.targetStartDate ? new Date(body.targetStartDate) : undefined,
      targetFinishDate: body.targetFinishDate ? new Date(body.targetFinishDate) : undefined,
    }).returning();

    await db.update(serviceRequests).set({
      status: 'CONVERTED',
      convertedToWoId: wo!.id,
      updatedAt: new Date(),
    }).where(and(eq(serviceRequests.id, id), eq(serviceRequests.tenantId, tid)));

    await audit(db, {
      tenantId: tid,
      userId: request.user!.id,
      action: 'CONVERT_TO_WO',
      resource: 'ServiceRequest',
      resourceId: id,
      metadata: { woId: wo!.id, woNum },
    });

    return reply.code(201).send(wo);
  });

  // ─── SLA detail ───────────────────────────────────────────────────────────────

  app.get('/service-requests/:id/sla', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    const [sr] = await db.select().from(serviceRequests)
      .where(and(eq(serviceRequests.id, id), eq(serviceRequests.tenantId, tid))).limit(1);
    if (!sr) return reply.code(404).send({ error: 'Service request not found' });

    return getSlaStatus(sr);
  });

  // ─── Overdue SRs (internal — used by SLA monitor worker) ─────────────────────

  app.get('/service-requests/overdue-sla', { preHandler: requirePermission('service_requests:read') }, async (request) => {
    const tid = request.user!.tenantId;
    const now = new Date();

    return db.select().from(serviceRequests).where(
      and(
        eq(serviceRequests.tenantId, tid),
        eq(serviceRequests.slaBreached, false),
        lt(serviceRequests.slaDueAt, now),
      ),
    );
  });
}

function getSlaStatus(sr: typeof serviceRequests.$inferSelect) {
  const now = Date.now();
  const dueAt = sr.slaDueAt ? sr.slaDueAt.getTime() : null;
  const isClosed = ['CLOSED', 'RESOLVED', 'CONVERTED', 'CANCELLED'].includes(sr.status);

  if (isClosed) {
    const closedTs = sr.closedAt?.getTime() ?? sr.updatedAt.getTime();
    const breached = dueAt ? closedTs > dueAt : false;
    return {
      targetHours: sr.slaTargetHours,
      dueAt: sr.slaDueAt,
      breached,
      status: breached ? 'BREACHED' : 'MET',
      remainingMs: null,
    };
  }

  if (!dueAt) return { targetHours: sr.slaTargetHours, dueAt: null, breached: false, status: 'NOT_SET', remainingMs: null };

  const remainingMs = dueAt - now;
  const breached = remainingMs < 0;
  let status: string;
  if (breached) status = 'BREACHED';
  else if (remainingMs < 3600000) status = 'CRITICAL';
  else if (remainingMs < 14400000) status = 'WARNING';
  else status = 'OK';

  return { targetHours: sr.slaTargetHours, dueAt: sr.slaDueAt, breached, status, remainingMs };
}
