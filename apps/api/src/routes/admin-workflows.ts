import type { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { db, workflowDefinitions, workflowInstances, workflowTasks, workflowHistory } from '@eam/db';
import { requirePermission } from '../plugins/auth.js';

const guard = { preHandler: requirePermission('admin:workflows:manage') };

export async function adminWorkflowRoutes(app: FastifyInstance) {
  // ── List workflows ──────────────────────────────────────────────────────────
  app.get('/admin/workflows', guard, async (request) => {
    const rows = await db
      .select()
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.tenantId, request.user!.tenantId))
      .orderBy(desc(workflowDefinitions.createdAt));

    return rows.map((w: typeof rows[0]) => ({
      id: w.id,
      name: w.name,
      entityType: w.entityType,
      triggerCondition: w.triggerEvent,
      currentVersion: Number(w.version),
      isActive: w.isActive === 'true',
      createdAt: w.createdAt,
      updatedAt: w.publishedAt ?? w.createdAt,
    }));
  });

  // ── Create workflow ─────────────────────────────────────────────────────────
  app.post('/admin/workflows', guard, async (request, reply) => {
    const body = request.body as {
      name: string;
      entityType: string;
      triggerCondition?: string;
    };

    const [row] = await db
      .insert(workflowDefinitions)
      .values({
        tenantId: request.user!.tenantId,
        name: body.name,
        entityType: body.entityType,
        triggerEvent: body.triggerCondition ?? '',
        definition: { nodes: [], edges: [] },
        version: '1',
        isActive: 'false',
        createdBy: request.user!.id,
      })
      .returning();

    return reply.code(201).send({
      id: row!.id,
      name: row!.name,
      entityType: row!.entityType,
      triggerCondition: row!.triggerEvent,
      currentVersion: Number(row!.version),
      isActive: row!.isActive === 'true',
      createdAt: row!.createdAt,
      updatedAt: row!.publishedAt ?? row!.createdAt,
    });
  });

  // ── Get workflow ────────────────────────────────────────────────────────────
  app.get('/admin/workflows/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await db
      .select()
      .from(workflowDefinitions)
      .where(
        and(
          eq(workflowDefinitions.id, id),
          eq(workflowDefinitions.tenantId, request.user!.tenantId),
        ),
      )
      .limit(1);

    if (!row) return reply.code(404).send({ error: 'Workflow not found' });

    return {
      id: row.id,
      name: row.name,
      entityType: row.entityType,
      triggerCondition: row.triggerEvent,
      definition: row.definition,
      currentVersion: Number(row.version),
      isActive: row.isActive === 'true',
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
      updatedAt: row.publishedAt ?? row.createdAt,
    };
  });

  // ── Update workflow metadata / toggle active ────────────────────────────────
  app.patch('/admin/workflows/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      name?: string;
      isActive?: boolean;
      triggerCondition?: string;
    };

    const updates: Partial<typeof workflowDefinitions.$inferInsert> = {};
    if (body.name != null) updates.name = body.name;
    if (body.isActive != null) updates.isActive = body.isActive ? 'true' : 'false';
    if (body.triggerCondition != null) updates.triggerEvent = body.triggerCondition;

    const [row] = await db
      .update(workflowDefinitions)
      .set(updates)
      .where(
        and(
          eq(workflowDefinitions.id, id),
          eq(workflowDefinitions.tenantId, request.user!.tenantId),
        ),
      )
      .returning();

    if (!row) return reply.code(404).send({ error: 'Workflow not found' });

    return {
      id: row.id,
      name: row.name,
      entityType: row.entityType,
      triggerCondition: row.triggerEvent,
      currentVersion: Number(row.version),
      isActive: row.isActive === 'true',
      createdAt: row.createdAt,
      updatedAt: row.publishedAt ?? row.createdAt,
    };
  });

  // ── Delete workflow ─────────────────────────────────────────────────────────
  app.delete('/admin/workflows/:id', guard, async (request, reply) => {
    const { id } = request.params as { id: string };

    // Prevent deleting active workflows that have in-flight instances
    const [active] = await db
      .select()
      .from(workflowInstances)
      .where(
        and(
          eq(workflowInstances.workflowDefId, id),
          eq(workflowInstances.status, 'RUNNING'),
        ),
      )
      .limit(1);

    if (active) {
      return reply.code(409).send({ error: 'Cannot delete workflow with in-flight instances' });
    }

    await db
      .delete(workflowDefinitions)
      .where(
        and(
          eq(workflowDefinitions.id, id),
          eq(workflowDefinitions.tenantId, request.user!.tenantId),
        ),
      );

    return reply.code(204).send();
  });

  // ── Save designer canvas ────────────────────────────────────────────────────
  app.put('/admin/workflows/:id/designer', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { definition: Record<string, unknown> };

    const [row] = await db
      .update(workflowDefinitions)
      .set({ definition: body.definition })
      .where(
        and(
          eq(workflowDefinitions.id, id),
          eq(workflowDefinitions.tenantId, request.user!.tenantId),
        ),
      )
      .returning();

    if (!row) return reply.code(404).send({ error: 'Workflow not found' });
    return { ok: true, id: row.id, definition: row.definition };
  });

  // ── Publish workflow (version bump) ────────────────────────────────────────
  app.post('/admin/workflows/:id/publish', guard, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [existing] = await db
      .select()
      .from(workflowDefinitions)
      .where(
        and(
          eq(workflowDefinitions.id, id),
          eq(workflowDefinitions.tenantId, request.user!.tenantId),
        ),
      )
      .limit(1);

    if (!existing) return reply.code(404).send({ error: 'Workflow not found' });

    const newVersion = String(Number(existing.version) + 1);
    const now = new Date();

    const [row] = await db
      .update(workflowDefinitions)
      .set({
        version: newVersion,
        isActive: 'true',
        publishedAt: now,
      })
      .where(eq(workflowDefinitions.id, id))
      .returning();

    return {
      id: row!.id,
      name: row!.name,
      currentVersion: Number(row!.version),
      isActive: true,
      publishedAt: row!.publishedAt,
    };
  });

  // ── Simulate workflow ───────────────────────────────────────────────────────
  app.post('/admin/workflows/:id/simulate', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as Record<string, unknown>;

    const [wf] = await db
      .select()
      .from(workflowDefinitions)
      .where(
        and(
          eq(workflowDefinitions.id, id),
          eq(workflowDefinitions.tenantId, request.user!.tenantId),
        ),
      )
      .limit(1);

    if (!wf) return reply.code(404).send({ error: 'Workflow not found' });

    const definition = wf.definition as {
      nodes?: Array<{ id: string; type: string; label?: string; data?: Record<string, unknown> }>;
      edges?: Array<{ fromId?: string; toId?: string; source?: string; target?: string; label?: string }>;
    };

    const nodes = definition.nodes ?? [];
    const edges = definition.edges ?? [];

    // Support both fromId/toId (designer) and source/target (react-flow)
    const adj: Record<string, string[]> = {};
    for (const e of edges) {
      const from = e.fromId ?? e.source;
      const to = e.toId ?? e.target;
      if (!from || !to) continue;
      if (!adj[from]) adj[from] = [];
      adj[from]!.push(to);
    }

    const nodeMap: Record<string, (typeof nodes)[0]> = {};
    for (const n of nodes) nodeMap[n.id] = n;

    const startNode = nodes.find((n) => n.type === 'START');
    const trace: Array<{ nodeId: string; type: string; label: string; status: string }> = [];
    const visited = new Set<string>();

    function traverse(nodeId: string) {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      const node = nodeMap[nodeId];
      if (!node) return;
      const label = node.label ?? (node.data?.label as string) ?? node.type;
      trace.push({ nodeId, type: node.type, label, status: 'SIMULATED' });
      for (const next of adj[nodeId] ?? []) {
        traverse(next);
      }
    }

    if (startNode) traverse(startNode.id);

    return {
      simulationId: `sim-${Date.now()}`,
      workflowId: id,
      context: body,
      trace,
      result: trace[trace.length - 1]?.type === 'END' ? 'COMPLETED' : 'INCOMPLETE',
    };
  });

  // ── Workflow version history ─────────────────────────────────────────────────
  app.get('/admin/workflows/:id/history', guard, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [wf] = await db
      .select()
      .from(workflowDefinitions)
      .where(
        and(
          eq(workflowDefinitions.id, id),
          eq(workflowDefinitions.tenantId, request.user!.tenantId),
        ),
      )
      .limit(1);

    if (!wf) return reply.code(404).send({ error: 'Workflow not found' });

    // Get workflow instances for this definition
    const instances = await db
      .select()
      .from(workflowInstances)
      .where(eq(workflowInstances.workflowDefId, id))
      .orderBy(desc(workflowInstances.startedAt))
      .limit(50);

    return {
      workflowId: id,
      workflowName: wf.name,
      currentVersion: Number(wf.version),
      publishedAt: wf.publishedAt,
      instances: instances.map((inst: typeof instances[0]) => ({
        id: inst.id,
        entityType: inst.entityType,
        entityId: inst.entityId,
        status: inst.status,
        startedAt: inst.startedAt,
        completedAt: inst.completedAt,
      })),
    };
  });

  // ── Get workflow tasks for an instance ─────────────────────────────────────
  app.get('/admin/workflows/instances/:instanceId/tasks', guard, async (request, _reply) => {
    const { instanceId } = request.params as { instanceId: string };

    const tasks = await db
      .select()
      .from(workflowTasks)
      .where(eq(workflowTasks.instanceId, instanceId))
      .orderBy(desc(workflowTasks.createdAt));

    return tasks;
  });

  // ── Get audit trail for an instance ────────────────────────────────────────
  app.get('/admin/workflows/instances/:instanceId/audit', guard, async (request, _reply) => {
    const { instanceId } = request.params as { instanceId: string };

    const history = await db
      .select()
      .from(workflowHistory)
      .where(eq(workflowHistory.instanceId, instanceId))
      .orderBy(desc(workflowHistory.createdAt));

    return history;
  });

  // ── Advance a workflow task ────────────────────────────────────────────────
  app.post('/admin/workflows/tasks/:taskId/advance', guard, async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const body = request.body as { action: 'APPROVE' | 'REJECT' | 'COMPLETE'; comment?: string };
    if (!['APPROVE', 'REJECT', 'COMPLETE'].includes(body.action)) {
      return reply.code(400).send({ error: 'action must be APPROVE, REJECT, or COMPLETE' });
    }
    try {
      const { WorkflowEngine } = await import('@eam/workflow-engine');
      const engine = new WorkflowEngine(db);
      await engine.advanceTask(taskId, request.user!.id, body.action, body.comment);
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : 'Advance failed' });
    }
  });

  // ── List all instances for a workflow ──────────────────────────────────────
  app.get('/admin/workflows/:id/instances', guard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tid = request.user!.tenantId;

    const [wf] = await db
      .select({ id: workflowDefinitions.id })
      .from(workflowDefinitions)
      .where(and(eq(workflowDefinitions.id, id), eq(workflowDefinitions.tenantId, tid)))
      .limit(1);

    if (!wf) return reply.code(404).send({ error: 'Workflow not found' });

    const rows = await db
      .select()
      .from(workflowInstances)
      .where(and(eq(workflowInstances.workflowDefId, id), eq(workflowInstances.tenantId, tid)))
      .orderBy(desc(workflowInstances.startedAt))
      .limit(100);

    return rows.map((r: typeof rows[0]) => ({
      id: r.id,
      workflowId: r.workflowDefId,
      entityType: r.entityType,
      entityId: r.entityId,
      status: r.status,
      currentNodeId: r.currentNodeId,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      error: r.error,
    }));
  });

  // ── Node-by-node trace for one instance ────────────────────────────────────
  app.get('/admin/workflows/:id/instances/:instanceId/nodes', guard, async (request, reply) => {
    const { id, instanceId } = request.params as { id: string; instanceId: string };
    const tid = request.user!.tenantId;

    const [inst] = await db
      .select({ id: workflowInstances.id })
      .from(workflowInstances)
      .where(
        and(
          eq(workflowInstances.id, instanceId),
          eq(workflowInstances.workflowDefId, id),
          eq(workflowInstances.tenantId, tid),
        ),
      )
      .limit(1);

    if (!inst) return reply.code(404).send({ error: 'Instance not found' });

    const rows = await db
      .select()
      .from(workflowHistory)
      .where(eq(workflowHistory.instanceId, instanceId))
      .orderBy(workflowHistory.createdAt);

    return rows.map((r: typeof rows[0]) => ({
      id: r.id,
      nodeId: r.nodeId,
      action: r.action,
      actorId: r.actorId,
      fromStatus: r.fromStatus,
      toStatus: r.toStatus,
      comment: r.comment,
      metadata: r.metadata,
      createdAt: r.createdAt,
    }));
  });

  // ── Pending tasks for one instance ─────────────────────────────────────────
  app.get('/admin/workflows/:id/instances/:instanceId/tasks', guard, async (request, reply) => {
    const { id, instanceId } = request.params as { id: string; instanceId: string };
    const tid = request.user!.tenantId;

    const [inst] = await db
      .select({ id: workflowInstances.id })
      .from(workflowInstances)
      .where(
        and(
          eq(workflowInstances.id, instanceId),
          eq(workflowInstances.workflowDefId, id),
          eq(workflowInstances.tenantId, tid),
        ),
      )
      .limit(1);

    if (!inst) return reply.code(404).send({ error: 'Instance not found' });

    const rows = await db
      .select()
      .from(workflowTasks)
      .where(
        and(
          eq(workflowTasks.instanceId, instanceId),
          eq(workflowTasks.status, 'PENDING'),
        ),
      )
      .orderBy(workflowTasks.createdAt);

    return rows.map((r: typeof rows[0]) => ({
      id: r.id,
      nodeId: r.nodeId,
      nodeType: r.nodeType,
      assignedToUserId: r.assignedToUserId,
      assignedToRole: r.assignedToRole,
      assignedToGroup: r.assignedToGroup,
      status: r.status,
      dueAt: r.dueAt,
      createdAt: r.createdAt,
    }));
  });
}
