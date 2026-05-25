import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Queue as BullQueue } from 'bullmq';
import { db } from '@eam/db';
import {
  NotificationDispatcher,
  subscribeSystemEvents,
  flushReadyDigests,
} from '@eam/notification-service';

export const digestFlushQueueName = 'notification-digest-flush';

export function registerNotificationHandlers(
  connection: Redis,
  sendEmailQueue: BullQueue,
): { dispatcher: NotificationDispatcher; digestWorker: Worker } {
  const dispatcher = new NotificationDispatcher(
    db,
    async (job) => {
      await sendEmailQueue.add('send-email', job);
    },
    { redis: connection },
  );

  subscribeSystemEvents(connection, (eventType, payload) => {
    void dispatcher.dispatch(eventType, payload);
  });

  const digestQueue = new Queue(digestFlushQueueName, { connection });

  const digestWorker = new Worker(
    digestFlushQueueName,
    async () => {
      await flushReadyDigests(db, async (job) => {
        await sendEmailQueue.add('send-email', job);
      });
    },
    { connection },
  );

  void digestQueue.add(
    'tick',
    {},
    { repeat: { pattern: '* * * * *' }, jobId: 'notification-digest-tick' },
  );

  return { dispatcher, digestWorker };
}
