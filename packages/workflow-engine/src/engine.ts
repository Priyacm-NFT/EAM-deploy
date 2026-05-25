import { and, eq } from 'drizzle-orm';
import { Parser } from 'expr-eval';
import type { Database } from '@eam/db';
import {
  workflowDefinitions,
  workflowInstances,
  workflowTasks,
  workflowHistory,
  users,
  groups,
} from '@eam/db';
import { globalEventBus } from '@eam/shared';
import { executeWorkflowIntegration } from './integration-node.js';
import { pickWorkflowDefinition } from './version.js';
import type {
  AssigneeResult,
  StartWorkflowOptions,
  WorkflowDefinitionJson,
  WorkflowNode,
} from './types.js';

export type { WorkflowNode, WorkflowEdge, WorkflowDefinitionJson } from './types.js';

const parser = new Parser();

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
    options?: StartWorkflowOptions,
  ) {
    const defs = await this.db
      .select()
      .from(workflowDefinitions)
      .where(
        and(
          eq(workflowDefinitions.entityType, entityType),
          eq(workflowDefinitions.tenantId, tenantId),
        ),
      );

    const def = pickWorkflowDefinition(defs, triggerEvent, options);
    if (!def) return null;

    const fullDef = defs.find((d) => d.id === def.id)!;
    const definition = fullDef.definition as unknown as WorkflowDefinitionJson;
    const startNode = definition.nodes.find((n) => n.type === 'START');
    if (!startNode) return null;

    const [instance] = await this.db
      .insert(workflowInstances)
      .values({
        workflowDefId: fullDef.id,
        entityType,
        entityId,
        tenantId,
        status: 'RUNNING',
        currentNodeId: startNode.id,
        context,
      })
      .returning();

    await this.advanceFromNode(instance!, fullDef, definition, startNode.id, context);
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
        : (edges.find((e) => e.label !== 'reject') ?? edges[0]);
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
      const edge =
        definition.edges.find(
          (e) => e.source === nodeId && (result ? e.label !== 'false' : e.label === 'false'),
        ) ?? definition.edges.find((e) => e.source === nodeId);
      if (edge) {
        await this.advanceFromNode(instance, def, definition, edge.target, context);
      }
      return;
    }

    if (node.type === 'NOTIFICATION') {
      const eventType = (node.config?.eventType as string) ?? 'WF_NOTIFICATION';
      await this.db.insert(workflowHistory).values({
        instanceId: instance.id,
        nodeId: node.id,
        action: 'NOTIFICATION_SENT',
        metadata: { eventType, config: node.config ?? {} },
      });
      await globalEventBus.emit(eventType, {
        tenantId: instance.tenantId,
        entityType: instance.entityType,
        entityId: instance.entityId,
        instanceId: instance.id,
        nodeId: node.id,
        context: { ...(instance.context as Record<string, unknown>), ...context },
        distributionRules: node.config?.distributionRules,
        subject: node.config?.subject,
        body: node.config?.body,
        ...(node.config ?? {}),
      });
      await this.continueToNext(instance, def, definition, nodeId, context);
      return;
    }

    if (node.type === 'INTEGRATION') {
      const result = await executeWorkflowIntegration(this.db, node, instance, context);
      await this.db.insert(workflowHistory).values({
        instanceId: instance.id,
        nodeId: node.id,
        action: 'INTEGRATION_EXECUTED',
        metadata: {
          success: result.success,
          error: result.error,
          data: result.data,
        },
      });
      if (!result.success && node.config?.stopOnError === true) {
        await this.db
          .update(workflowInstances)
          .set({
            status: 'ERROR',
            error: result.error ?? 'Integration failed',
            currentNodeId: node.id,
          })
          .where(eq(workflowInstances.id, instance.id));
        return;
      }
      await this.continueToNext(instance, def, definition, nodeId, context);
      return;
    }

    if (node.type === 'TASK' || node.type === 'APPROVAL') {
      const assignee = await this.resolveAssignee(node, context, instance.tenantId);
      const dueAt = node.config?.dueMinutes
        ? new Date(Date.now() + Number(node.config.dueMinutes) * 60000)
        : undefined;
      const [task] = await this.db
        .insert(workflowTasks)
        .values({
          instanceId: instance.id,
          nodeId: node.id,
          nodeType: node.type,
          assignedToUserId: assignee.userId,
          assignedToRole: assignee.role,
          assignedToGroup: assignee.group,
          status: 'PENDING',
          dueAt,
        })
        .returning();
      await this.db
        .update(workflowInstances)
        .set({ currentNodeId: node.id })
        .where(eq(workflowInstances.id, instance.id));
      await globalEventBus.emit('WF_TASK_ASSIGNED', {
        instanceId: instance.id,
        nodeId: node.id,
        taskId: task!.id,
        assignee,
        dueAt: dueAt?.toISOString(),
        escalationRole: node.config?.escalationRole as string | undefined,
        tenantId: instance.tenantId,
        entityType: instance.entityType,
        entityId: instance.entityId,
      });
      return;
    }

    await this.continueToNext(instance, def, definition, nodeId, context);
  }

  private async continueToNext(
    instance: typeof workflowInstances.$inferSelect,
    def: typeof workflowDefinitions.$inferSelect,
    definition: WorkflowDefinitionJson,
    nodeId: string,
    context: Record<string, unknown>,
  ) {
    const nextEdge = definition.edges.find((e) => e.source === nodeId);
    if (nextEdge) {
      await this.advanceFromNode(instance, def, definition, nextEdge.target, context);
    }
  }

  private async resolveAssignee(
    node: WorkflowNode,
    context: Record<string, unknown>,
    tenantId: string,
  ): Promise<AssigneeResult> {
    const assignmentType = node.config?.assignmentType as string;
    if (assignmentType === 'ROLE') {
      return { role: node.config?.role as string };
    }
    if (assignmentType === 'STATIC_USER') {
      return { userId: node.config?.userId as string };
    }
    if (assignmentType === 'GROUP') {
      const groupId = node.config?.groupId as string | undefined;
      const groupName = node.config?.groupName as string | undefined;
      if (groupId) {
        const [g] = await this.db
          .select()
          .from(groups)
          .where(and(eq(groups.id, groupId), eq(groups.tenantId, tenantId)))
          .limit(1);
        if (g) return { group: g.name };
      }
      if (groupName) {
        const [g] = await this.db
          .select()
          .from(groups)
          .where(and(eq(groups.name, groupName), eq(groups.tenantId, tenantId)))
          .limit(1);
        if (g) return { group: g.name };
      }
      return { group: groupName ?? groupId };
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
