import { Redis } from 'ioredis';
import type { Namespace } from 'socket.io';
import {
  wireEventBusPublisher,
  subscribeNotificationPush,
} from '@eam/notification-service';
import { globalEventBus } from '@eam/shared';

let redis: Redis | null = null;

export function getNotificationRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
  }
  return redis;
}

export function wireApiNotificationBridge(): void {
  wireEventBusPublisher(globalEventBus, getNotificationRedis());
}

export function wireNotificationSocketPush(nsp: Namespace): void {
  subscribeNotificationPush(getNotificationRedis(), (msg) => {
    nsp.to(`user:${msg.userId}`).emit('notification:new', msg.notification);
  });
}
