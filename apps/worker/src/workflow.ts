import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Queue as BullQueue } from 'bullmq';
import { db } from '@eam/db';
import { processTaskEscalation } from '@eam/workflow-engine';
import { NotificationDispatcher } from '@eam/notification-service';
import { globalEventBus } from '@eam/shared';

export function registerWorkflowHandlers(
  connection: Redis,
  sendEmailQueue: BullQueue,
): void {
  const escalationQueue = new Queue('workflow-escalation', { connection });

  const dispatcher = new NotificationDispatcher(db, async (job) => {
    await sendEmailQueue.add('send-email', job);
  });
  dispatcher.attach(globalEventBus);

  globalEventBus.on('WF_TASK_ASSIGNED', async (raw) => {
    const payload = raw as {
      taskId?: string;
      dueAt?: string;
      escalationRole?: string;
    };
    if (!payload.taskId || !payload.dueAt) return;
    const dueMs = new Date(payload.dueAt).getTime() - Date.now();
    if (dueMs <= 0) {
      await processTaskEscalation(db, payload.taskId, payload.escalationRole);
      return;
    }
    await escalationQueue.add(
      'escalate',
      { taskId: payload.taskId, escalationRole: payload.escalationRole },
      { delay: dueMs, jobId: `wf-escalate-${payload.taskId}` },
    );
  });

  new Worker(
    'workflow-escalation',
    async (job) => {
      const { taskId, escalationRole } = job.data as {
        taskId: string;
        escalationRole?: string;
      };
      await processTaskEscalation(db, taskId, escalationRole);
    },
    { connection },
  );
}
