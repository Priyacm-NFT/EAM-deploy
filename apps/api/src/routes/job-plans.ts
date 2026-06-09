import type { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import {
  db,
  jobPlans,
  jobPlanTasks,
  jobPlanLabour,
  jobPlanMaterials,
  jobPlanTools,
  jobPlanSafety,
  audit,
} from '@eam/db';
import { entityDefinitions, fieldDefinitions } from '@eam/db';
import { FieldRulesService } from '@eam/config-engine';
import { requirePermission } from '../plugins/auth.js';

const readGuard = { preHandler: requirePermission('work_orders:read') };
const writeGuard = { preHandler: requirePermission('work_orders:write') };

export async function jobPlanRoutes(app: FastifyInstance) {

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

  // ─── Job Plans ────────────────────────────────────────────────────────────────

  app.get('/job-plans', readGuard, async (request) => {
    const tid = request.user!.tenantId;
    return db.select().from(jobPlans)
      .where(eq(jobPlans.tenantId, tid))
      .orderBy(desc(jobPlans.updatedAt));
  });

  app.post('/job-plans', writeGuard, async (request, reply) => {
    const body = request.body as {
      jpNum?: string;
      description: string;
      longDescription?: string;
      estimatedDurationHours?: string;
    };
    const tid = request.user!.tenantId;

    // ── Custom field validation ──────────────────────────────────────────────
    const customData = (body as Record<string, unknown>).customData as Record<string, unknown> ?? {};
    const validation = await validateCustomFields(tid, 'JobPlan', { ...body as Record<string, unknown>, ...customData }, request.user!.roles ?? []);
    if (!validation.valid) return reply.code(422).send({ error: 'Validation failed', errors: validation.errors });
    // ────────────────────────────────────────────────────────────────────────

    const count = await db.select({ id: jobPlans.id }).from(jobPlans).where(eq(jobPlans.tenantId, tid));
    const jpNum = body.jpNum ?? `JP-${String(count.length + 1).padStart(5, '0')}`;

    const [row] = await db.insert(jobPlans).values({
      tenantId: tid,
      jpNum,
      description: body.description,
      longDescription: body.longDescription,
      estimatedDurationHours: body.estimatedDurationHours,
      createdByUserId: request.user!.id,
    }).returning();

    await audit(db, { tenantId: tid, userId: request.user!.id, action: 'CREATE', resource: 'JobPlan', resourceId: row!.id });
    return reply.code(201).send(row);
  });

  app.get('/job-plans/:id', readGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    const [jp] = await db.select().from(jobPlans)
      .where(and(eq(jobPlans.id, id), eq(jobPlans.tenantId, tid))).limit(1);
    if (!jp) return reply.code(404).send({ error: 'Job plan not found' });

    const [tasks, labour, materials, tools, safety] = await Promise.all([
      db.select().from(jobPlanTasks).where(eq(jobPlanTasks.jpId, id)).orderBy(jobPlanTasks.sequence),
      db.select().from(jobPlanLabour).where(eq(jobPlanLabour.jpId, id)),
      db.select().from(jobPlanMaterials).where(eq(jobPlanMaterials.jpId, id)),
      db.select().from(jobPlanTools).where(eq(jobPlanTools.jpId, id)),
      db.select().from(jobPlanSafety).where(eq(jobPlanSafety.jpId, id)).orderBy(jobPlanSafety.sequence),
    ]);

    return { ...jp, tasks, labour, materials, tools, safety };
  });

  app.put('/job-plans/:id', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof jobPlans.$inferInsert>;
    const tid = request.user!.tenantId;

    const [row] = await db.update(jobPlans).set({ ...body, updatedAt: new Date() })
      .where(and(eq(jobPlans.id, id), eq(jobPlans.tenantId, tid))).returning();
    if (!row) return reply.code(404).send({ error: 'Job plan not found' });
    return row;
  });

  app.delete('/job-plans/:id', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;
    await db.delete(jobPlans).where(and(eq(jobPlans.id, id), eq(jobPlans.tenantId, tid)));
    return reply.code(204).send();
  });

  // ─── Tasks ────────────────────────────────────────────────────────────────────

  app.get('/job-plans/:id/tasks', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    return db.select().from(jobPlanTasks).where(eq(jobPlanTasks.jpId, id)).orderBy(jobPlanTasks.sequence);
  });

  app.post('/job-plans/:id/tasks', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof jobPlanTasks.$inferInsert>;
    const [row] = await db.insert(jobPlanTasks).values({ jpId: id, ...body } as typeof jobPlanTasks.$inferInsert).returning();
    return reply.code(201).send(row);
  });

  app.put('/job-plans/:id/tasks/:taskId', writeGuard, async (request, reply) => {
    const { taskId } = request.params as { id: string; taskId: string };
    const body = request.body as Partial<typeof jobPlanTasks.$inferInsert>;
    const [row] = await db.update(jobPlanTasks).set(body).where(eq(jobPlanTasks.id, taskId)).returning();
    if (!row) return reply.code(404).send({ error: 'Task not found' });
    return row;
  });

  app.delete('/job-plans/:id/tasks/:taskId', writeGuard, async (request, reply) => {
    const { taskId } = request.params as { id: string; taskId: string };
    await db.delete(jobPlanTasks).where(eq(jobPlanTasks.id, taskId));
    return reply.code(204).send();
  });

  // ─── Labour ───────────────────────────────────────────────────────────────────

  app.get('/job-plans/:id/labour', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    return db.select().from(jobPlanLabour).where(eq(jobPlanLabour.jpId, id));
  });

  app.post('/job-plans/:id/labour', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof jobPlanLabour.$inferInsert>;
    const [row] = await db.insert(jobPlanLabour).values({ jpId: id, ...body } as typeof jobPlanLabour.$inferInsert).returning();
    return reply.code(201).send(row);
  });

  app.put('/job-plans/:id/labour/:labId', writeGuard, async (request, reply) => {
    const { labId } = request.params as { id: string; labId: string };
    const body = request.body as Partial<typeof jobPlanLabour.$inferInsert>;
    const [row] = await db.update(jobPlanLabour).set(body).where(eq(jobPlanLabour.id, labId)).returning();
    return row ?? reply.code(404).send({ error: 'Not found' });
  });

  app.delete('/job-plans/:id/labour/:labId', writeGuard, async (request, reply) => {
    const { labId } = request.params as { id: string; labId: string };
    await db.delete(jobPlanLabour).where(eq(jobPlanLabour.id, labId));
    return reply.code(204).send();
  });

  // ─── Materials ────────────────────────────────────────────────────────────────

  app.get('/job-plans/:id/materials', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    return db.select().from(jobPlanMaterials).where(eq(jobPlanMaterials.jpId, id));
  });

  app.post('/job-plans/:id/materials', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof jobPlanMaterials.$inferInsert>;
    const [row] = await db.insert(jobPlanMaterials).values({ jpId: id, ...body } as typeof jobPlanMaterials.$inferInsert).returning();
    return reply.code(201).send(row);
  });

  app.put('/job-plans/:id/materials/:matId', writeGuard, async (request, reply) => {
    const { matId } = request.params as { id: string; matId: string };
    const body = request.body as Partial<typeof jobPlanMaterials.$inferInsert>;
    const [row] = await db.update(jobPlanMaterials).set(body).where(eq(jobPlanMaterials.id, matId)).returning();
    return row ?? reply.code(404).send({ error: 'Not found' });
  });

  app.delete('/job-plans/:id/materials/:matId', writeGuard, async (request, reply) => {
    const { matId } = request.params as { id: string; matId: string };
    await db.delete(jobPlanMaterials).where(eq(jobPlanMaterials.id, matId));
    return reply.code(204).send();
  });

  // ─── Tools ────────────────────────────────────────────────────────────────────

  app.get('/job-plans/:id/tools', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    return db.select().from(jobPlanTools).where(eq(jobPlanTools.jpId, id));
  });

  app.post('/job-plans/:id/tools', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof jobPlanTools.$inferInsert>;
    const [row] = await db.insert(jobPlanTools).values({ jpId: id, ...body } as typeof jobPlanTools.$inferInsert).returning();
    return reply.code(201).send(row);
  });

  app.put('/job-plans/:id/tools/:toolId', writeGuard, async (request, reply) => {
    const { toolId } = request.params as { id: string; toolId: string };
    const body = request.body as Partial<typeof jobPlanTools.$inferInsert>;
    const [row] = await db.update(jobPlanTools).set(body).where(eq(jobPlanTools.id, toolId)).returning();
    return row ?? reply.code(404).send({ error: 'Not found' });
  });

  app.delete('/job-plans/:id/tools/:toolId', writeGuard, async (request, reply) => {
    const { toolId } = request.params as { id: string; toolId: string };
    await db.delete(jobPlanTools).where(eq(jobPlanTools.id, toolId));
    return reply.code(204).send();
  });

  // ─── Safety ───────────────────────────────────────────────────────────────────

  app.get('/job-plans/:id/safety', readGuard, async (request) => {
    const { id } = request.params as { id: string };
    return db.select().from(jobPlanSafety).where(eq(jobPlanSafety.jpId, id)).orderBy(jobPlanSafety.sequence);
  });

  app.post('/job-plans/:id/safety', writeGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<typeof jobPlanSafety.$inferInsert>;
    const [row] = await db.insert(jobPlanSafety).values({ jpId: id, ...body } as typeof jobPlanSafety.$inferInsert).returning();
    return reply.code(201).send(row);
  });

  app.put('/job-plans/:id/safety/:safId', writeGuard, async (request, reply) => {
    const { safId } = request.params as { id: string; safId: string };
    const body = request.body as Partial<typeof jobPlanSafety.$inferInsert>;
    const [row] = await db.update(jobPlanSafety).set(body).where(eq(jobPlanSafety.id, safId)).returning();
    return row ?? reply.code(404).send({ error: 'Not found' });
  });

  app.delete('/job-plans/:id/safety/:safId', writeGuard, async (request, reply) => {
    const { safId } = request.params as { id: string; safId: string };
    await db.delete(jobPlanSafety).where(eq(jobPlanSafety.id, safId));
    return reply.code(204).send();
  });
}
