import type { Redis } from 'ioredis';
import type { EventBus } from '@eam/shared';

export const SYSTEM_EVENT_CHANNEL = 'eam:system-events';
export const NOTIFICATION_PUSH_CHANNEL = 'eam:notification-push';

export interface SystemEventMessage {
  eventType: string;
  payload: Record<string, unknown>;
}

export interface NotificationPushMessage {
  userId: string;
  notification: {
    id: string;
    title: string;
    body: string;
    entityType?: string;
    entityId?: string;
  };
}

export async function publishSystemEvent(
  redis: Redis,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const message: SystemEventMessage = { eventType, payload };
  await redis.publish(SYSTEM_EVENT_CHANNEL, JSON.stringify(message));
}

export function wireEventBusPublisher(bus: EventBus, redis: Redis): void {
  bus.setPublishHook(async (eventType, payload) => {
    await publishSystemEvent(redis, eventType, (payload ?? {}) as Record<string, unknown>);
  });
}

export function subscribeSystemEvents(
  redis: Redis,
  handler: (eventType: string, payload: Record<string, unknown>) => void | Promise<void>,
): Redis {
  const sub = redis.duplicate();
  void sub.subscribe(SYSTEM_EVENT_CHANNEL);
  sub.on('message', (_channel, raw) => {
    try {
      const msg = JSON.parse(raw) as SystemEventMessage;
      void handler(msg.eventType, msg.payload);
    } catch {
      /* ignore malformed */
    }
  });
  return sub;
}

export async function publishNotificationPush(
  redis: Redis,
  message: NotificationPushMessage,
): Promise<void> {
  await redis.publish(NOTIFICATION_PUSH_CHANNEL, JSON.stringify(message));
}

export function subscribeNotificationPush(
  redis: Redis,
  handler: (message: NotificationPushMessage) => void | Promise<void>,
): Redis {
  const sub = redis.duplicate();
  void sub.subscribe(NOTIFICATION_PUSH_CHANNEL);
  sub.on('message', (_channel, raw) => {
    try {
      const msg = JSON.parse(raw) as NotificationPushMessage;
      void handler(msg);
    } catch {
      /* ignore malformed */
    }
  });
  return sub;
}
