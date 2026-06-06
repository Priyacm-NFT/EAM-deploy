import { and, eq } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import type { Database } from '@eam/db';
import {
  notificationTriggers,
  notificationTemplates,
  inAppNotifications,
  notificationDeliveryLog,
  userNotificationPrefs,
} from '@eam/db';
import type { EventBus } from '@eam/shared';
import { SYSTEM_EVENT_TYPES } from './events.js';
import { renderTemplate } from './template.js';
import { resolveDistributionRecipients } from './recipient-resolver.js';
import type { DistributionRule } from './recipients.js';
import { triggerApplies } from './trigger.js';
import {
  parseDigestConfig,
  queueDigestItem,
  digestFlushAfter,
} from './digest.js';
import {
  parseRateLimitConfig,
  checkInMemoryRateLimit,
  checkRedisRateLimit,
} from './rate-limit.js';
import { publishNotificationPush } from './event-bridge.js';

export type EmailEnqueueFn = (job: {
  to: string;
  subject: string;
  html: string;
}) => Promise<void>;

export type InAppPushFn = (userId: string, notification: {
  id: string;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
}) => void | Promise<void>;

function distributionRules(config: Record<string, unknown>): DistributionRule[] {
  // Format 1: explicit rules array [{type, value}]
  const rules = config.rules;
  if (Array.isArray(rules) && rules.length > 0) {
    return rules.filter(
      (r): r is DistributionRule =>
        typeof r === 'object' &&
        r !== null &&
        'type' in r &&
        'value' in r &&
        typeof (r as DistributionRule).type === 'string',
    );
  }

  // Format 2: frontend format {notifyAssignee, notifyRequester, roles, emails}
  const result: DistributionRule[] = [];
  if (config.notifyAssignee) {
    result.push({ type: 'FIELD', value: 'assignedToUserId' });
  }
  if (config.notifyRequester) {
    result.push({ type: 'FIELD', value: 'requestedByUserId' });
  }
  if (Array.isArray(config.roles)) {
    for (const role of config.roles as string[]) {
      if (role) result.push({ type: 'ROLE', value: role });
    }
  }
  if (Array.isArray(config.emails)) {
    for (const email of config.emails as string[]) {
      if (email) result.push({ type: 'STATIC_EMAIL', value: email });
    }
  }
  return result;
}

export class NotificationDispatcher {
  constructor(
    private db: Database,
    private enqueueEmail?: EmailEnqueueFn,
    private options?: {
      redis?: Redis;
      pushInApp?: InAppPushFn;
    },
  ) {}

  attach(bus: EventBus): void {
    for (const eventType of SYSTEM_EVENT_TYPES) {
      bus.on(eventType, (payload) => {
        void this.dispatch(eventType, payload as Record<string, unknown>);
      });
    }
  }

  async dispatch(eventType: string, payload: Record<string, unknown>): Promise<void> {
    const tenantId = payload.tenantId as string | undefined;
    if (!tenantId) return;

    const triggers = await this.db
      .select()
      .from(notificationTriggers)
      .where(
        and(
          eq(notificationTriggers.tenantId, tenantId),
          eq(notificationTriggers.eventType, eventType),
          eq(notificationTriggers.isActive, true),
        ),
      );

    for (const trigger of triggers) {
      if (!triggerApplies(trigger, payload)) continue;

      const rules = distributionRules(
        trigger.distributionConfig as Record<string, unknown>,
      );
      const nodeRules = payload.distributionRules as DistributionRule[] | undefined;
      const effectiveRules =
        Array.isArray(nodeRules) && nodeRules.length > 0 ? nodeRules : rules;
      if (effectiveRules.length === 0) continue;

      const recipients = await resolveDistributionRecipients(
        this.db,
        tenantId,
        effectiveRules,
        payload,
      );

      let subject = (payload.subject as string) ?? eventType;
      let html = (payload.body as string) ?? `<p>${eventType}</p>`;

      if (trigger.templateId) {
        const [template] = await this.db
          .select()
          .from(notificationTemplates)
          .where(eq(notificationTemplates.id, trigger.templateId))
          .limit(1);
        if (template) {
          const data = (payload.context as Record<string, unknown>) ?? payload;
          subject = renderTemplate(template.subjectTemplate, data);
          html = renderTemplate(template.htmlTemplate, data);
        }
      }

      const digestConfig = parseDigestConfig(
        trigger.digestConfig as Record<string, unknown> | null,
      );
      const rateLimitConfig = parseRateLimitConfig(
        trigger.rateLimitConfig as Record<string, unknown> | null,
      );

      const rateKey = `notify:rate:${tenantId}:${trigger.id}`;
      let rateCheck = { allowed: true, count: 0 };
      if (rateLimitConfig) {
        rateCheck = this.options?.redis
          ? await checkRedisRateLimit(
              this.options.redis,
              rateKey,
              rateLimitConfig.max,
              rateLimitConfig.windowSeconds,
            )
          : checkInMemoryRateLimit(
              rateKey,
              rateLimitConfig.max,
              rateLimitConfig.windowSeconds,
            );
      }
      const rateDigest =
        rateLimitConfig &&
        !rateCheck.allowed &&
        rateLimitConfig.overflowMode === 'digest';
      const rateDrop =
        rateLimitConfig &&
        !rateCheck.allowed &&
        rateLimitConfig.overflowMode === 'drop';

      for (const recipient of recipients) {
        const prefs = await this.loadUserPrefs(recipient.userId, trigger.id);
        const emailAllowed =
          trigger.isMandatory || prefs?.emailEnabled !== false;
        const inAppAllowed = prefs?.inAppEnabled !== false;

        if (inAppAllowed) {
          const [row] = await this.db
            .insert(inAppNotifications)
            .values({
              tenantId,
              userId: recipient.userId,
              title: subject,
              body: html.replace(/<[^>]+>/g, ' ').trim(),
              entityType: payload.entityType as string | undefined,
              entityId: payload.entityId as string | undefined,
            })
            .returning();

          if (row && this.options?.pushInApp) {
            await this.options.pushInApp(recipient.userId, {
              id: row.id,
              title: row.title,
              body: row.body,
              entityType: row.entityType ?? undefined,
              entityId: row.entityId ?? undefined,
            });
          } else if (row && this.options?.redis) {
            await publishNotificationPush(this.options.redis, {
              userId: recipient.userId,
              notification: {
                id: row.id,
                title: row.title,
                body: row.body,
                entityType: row.entityType ?? undefined,
                entityId: row.entityId ?? undefined,
              },
            });
          }

          // FIX 9: log in-app delivery — only EMAIL was logged before
          if (row) {
            await this.db.insert(notificationDeliveryLog).values({
              triggerId: trigger.id,
              entityId: payload.entityId as string | undefined,
              recipientUserId: recipient.userId,
              recipientEmail: recipient.email,
              channel: 'IN_APP',
              status: 'DELIVERED',
            });
          }
        }

        if (!this.enqueueEmail || !emailAllowed) continue;
        if (rateDrop) continue;

        const useDigest =
          Boolean(digestConfig?.enabled) ||
          rateDigest ||
          prefs?.digestEnabled === true;

        if (useDigest) {
          const windowMinutes = digestConfig?.windowMinutes ?? 5;
          await queueDigestItem(this.db, {
            tenantId,
            triggerId: trigger.id,
            recipientUserId: recipient.userId,
            recipientEmail: recipient.email,
            subject,
            html,
            entityType: payload.entityType as string | undefined,
            entityId: payload.entityId as string | undefined,
            flushAfter: digestFlushAfter(windowMinutes),
          });
          await this.logDelivery(trigger.id, recipient, payload, 'DIGEST_QUEUED');
          continue;
        }

        await this.enqueueEmail({
          to: recipient.email,
          subject,
          html,
        });
        await this.logDelivery(trigger.id, recipient, payload, 'QUEUED');
      }
    }
  }

  private async loadUserPrefs(userId: string, triggerId: string) {
    const [prefs] = await this.db
      .select()
      .from(userNotificationPrefs)
      .where(
        and(
          eq(userNotificationPrefs.userId, userId),
          eq(userNotificationPrefs.triggerId, triggerId),
        ),
      )
      .limit(1);
    return prefs;
  }

  private async logDelivery(
    triggerId: string,
    recipient: { userId: string; email: string },
    payload: Record<string, unknown>,
    status: string,
  ): Promise<void> {
    await this.db.insert(notificationDeliveryLog).values({
      triggerId,
      entityId: payload.entityId as string | undefined,
      recipientUserId: recipient.userId,
      recipientEmail: recipient.email,
      channel: 'EMAIL',
      status,
    });
  }
}
