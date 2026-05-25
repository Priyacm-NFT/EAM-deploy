import { eq } from 'drizzle-orm';
import { Parser } from 'expr-eval';
import type { Database } from '@eam/db';
import {
  workflowDefinitions,
  workflowInstances,
  workflowTasks,
  workflowHistory,
  users,
} from '@eam/db';
import { globalEventBus } from '@eam/shared';

const parser = new Parser();

export interface WorkflowNode {
  id: string;
  type: string;
  config?: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface WorkflowDefinitionJson {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  metadata?: Record<string, unknown>;
}

export class WorkflowEngine {
  constructor(private db: Database) {}

  evaluateCondition(expression: string, context: Record<string, unknown>): boolean {
    try {
      const expr = parser.parse(expression);
      return Boolean(expr.evaluate({ ...context } as Record<string, number | string>));
    } catch {
      return false;
    }
  }

  async startWorkflow(
    entityType: string,
    entityId: string,
    triggerEvent: string,
    tenantId: string,
    context: Record<string, unknown>,
  ) {
    const defs = await this.db
      .select()
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.entityType, entityType));

    const def = defs.find(
      (d) => d.triggerEvent === triggerEvent && d.isActive === 'true',
    );
    if (!def) return null;

    const definition = def.definition as unknown as WorkflowDefinitionJson;
    const startNode = definition.nodes.find((n) => n.type === 'START');
    if (!startNode) return null;

    const [instance] = await this.db
      .insert(workflowInstances)
      .values({
        workflowDefId: def.id,
        entityType,
        entityId,
        tenantId,
        status: 'RUNNING',
        currentNodeId: startNode.id,
        context,
      })
      .returning();

    await this.advanceFromNode(instance!, def, definition, startNode.id, context);
    return instance;
  }

  async advanceTask(
    taskId: string,
    userId: string,
    action: 'APPROVE' | 'REJECT' | 'COMPLETE',
    comment?: string,
  ) {
    const [task] = await this.db
      .select()
      .from(workflowTasks)
      .where(eq(workflowTasks.id, taskId))
      .limit(1);
    if (!task) throw new Error('Task not found');

    await this.db
      .update(workflowTasks)
      .set({
        status: action === 'REJECT' ? 'REJECTED' : 'COMPLETED',
        completedAt: new Date(),
        completedBy: userId,
        comment,
      })
      .where(eq(workflowTasks.id, taskId));

    const [instance] = await this.db
      .select()
      .from(workflowInstances)
      .where(eq(workflowInstances.id, task.instanceId))
      .limit(1);

    await this.db.insert(workflowHistory).values({
      instanceId: task.instanceId,
      nodeId: task.nodeId,
      action,
      actorId: userId,
      comment,
    });

    const [def] = await this.db
      .select()
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.id, instance!.workflowDefId))
      .limit(1);

    const definition = def!.definition as unknown as WorkflowDefinitionJson;
    const edges = definition.edges.filter((e) => e.source === task.nodeId);
    const edge =
      action === 'REJECT'
        ? edges.find((e) => e.label === 'reject')
        : edges.find((e) => e.label !== 'reject') ?? edges[0];
    if (edge) {
      await this.advanceFromNode(
        instance!,
        def!,
        definition,
        edge.target,
        (instance!.context ?? {}) as Record<string, unknown>,
      );
    }

    await globalEventBus.emit('WF_TASK_APPROVED', { taskId, userId, action });
  }

  private async advanceFromNode(
    instance: typeof workflowInstances.$inferSelect,
    def: typeof workflowDefinitions.$inferSelect,
    definition: WorkflowDefinitionJson,
    nodeId: string,
    context: Record<string, unknown>,
  ) {
    const node = definition.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    if (node.type === 'END') {
      await this.db
        .update(workflowInstances)
        .set({ status: 'COMPLETED', completedAt: new Date(), currentNodeId: nodeId })
        .where(eq(workflowInstances.id, instance.id));
      return;
    }

    if (node.type === 'DECISION') {
      const condition = (node.config?.condition as string) ?? 'true';
      const result = this.evaluateCondition(condition, context);
      const edge = definition.edges.find(
        (e) => e.source === nodeId && (result ? e.label !== 'false' : e.label === 'false'),
      ) ?? definition.edges.find((e) => e.source === nodeId);
      if (edge) {
        await this.advanceFromNode(instance, def, definition, edge.target, context);
      }
      return;
    }

    if (node.type === 'TASK' || node.type === 'APPROVAL') {
      const assignee = await this.resolveAssignee(node, context, instance.tenantId);
      await this.db.insert(workflowTasks).values({
        instanceId: instance.id,
        nodeId: node.id,
        nodeType: node.type,
        assignedToUserId: assignee.userId,
        assignedToRole: assignee.role,
        status: 'PENDING',
        dueAt: node.config?.dueMinutes
          ? new Date(Date.now() + Number(node.config.dueMinutes) * 60000)
          : undefined,
      });
      await this.db
        .update(workflowInstances)
        .set({ currentNodeId: node.id })
        .where(eq(workflowInstances.id, instance.id));
      await globalEventBus.emit('WF_TASK_ASSIGNED', {
        instanceId: instance.id,
        nodeId: node.id,
        assignee,
      });
      return;
    }

    const nextEdge = definition.edges.find((e) => e.source === nodeId);
    if (nextEdge) {
      await this.advanceFromNode(instance, def, definition, nextEdge.target, context);
    }
  }

  private async resolveAssignee(
    node: WorkflowNode,
    context: Record<string, unknown>,
    _tenantId: string,
  ): Promise<{ userId?: string; role?: string }> {
    void _tenantId;
    const assignmentType = node.config?.assignmentType as string;
    if (assignmentType === 'ROLE') {
      return { role: node.config?.role as string };
    }
    if (assignmentType === 'STATIC_USER') {
      return { userId: node.config?.userId as string };
    }
    if (assignmentType === 'SUPERVISOR' && context.requesterId) {
      const [user] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, context.requesterId as string))
        .limit(1);
      if (user?.managerId) return { userId: user.managerId };
    }
    return { role: 'Supervisor' };
  }
}
