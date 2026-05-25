import { eq } from 'drizzle-orm';
import type { Database } from '@eam/db';
import { workflowTasks, workflowHistory } from '@eam/db';
import { globalEventBus } from '@eam/shared';

export async function processTaskEscalation(
  db: Database,
  taskId: string,
  escalationRole?: string,
): Promise<boolean> {
  const [task] = await db
    .select()
    .from(workflowTasks)
    .where(eq(workflowTasks.id, taskId))
    .limit(1);
  if (!task || task.status !== 'PENDING') return false;

  const role = escalationRole ?? 'Supervisor';
  await db
    .update(workflowTasks)
    .set({
      status: 'ESCALATED',
      assignedToRole: role,
      assignedToUserId: null,
      assignedToGroup: null,
    })
    .where(eq(workflowTasks.id, taskId));

  await db.insert(workflowHistory).values({
    instanceId: task.instanceId,
    nodeId: task.nodeId,
    action: 'ESCALATED',
    fromStatus: 'PENDING',
    toStatus: 'ESCALATED',
    metadata: { escalationRole: role },
  });

  await globalEventBus.emit('WF_TASK_ESCALATED', {
    taskId,
    instanceId: task.instanceId,
    nodeId: task.nodeId,
    escalationRole: role,
  });

  return true;
}
