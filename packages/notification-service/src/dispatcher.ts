import { and, eq } from 'drizzle-orm';
import { Parser } from 'expr-eval';
import type { Database } from '@eam/db';
import {
  notificationTriggers,
  notificationTemplates,
  inAppNotifications,
  notificationDeliveryLog,
} from '@eam/db';
import type { EventBus } from '@eam/shared';
import { SYSTEM_EVENT_TYPES } from './events.js';
import { renderTemplate } from './template.js';
import { resolveDistributionRecipients } from './recipient-resolver.js';
import type { DistributionRule } from './recipients.js';

const parser = new Parser();

export type EmailEnqueueFn = (job: {
  to: string;
  subject: string;
  html: string;
}) => Promise<void>;

function distributionRules(config: Record<string, unknown>): DistributionRule[] {
  const rules = config.rules;
  if (!Array.isArray(rules)) return [];
  return rules.filter(
    (r): r is DistributionRule =>
      typeof r === 'object' &&
      r !== null &&
      'type' in r &&
      'value' in r &&
      typeof (r as DistributionRule).type === 'string',
  );
}

function triggerApplies(
  trigger: { conditionExpression: string | null; entityType: string | null },
  payload: Record<string, unknown>,
): boolean {
  if (trigger.entityType && trigger.entityType !== payload.entityType) return false;
  if (!trigger.conditionExpression) return true;
  try {
    const ctx = (payload.context as Record<string, unknown>) ?? payload;
    const expr = parser.parse(trigger.conditionExpression);
    return Boolean(expr.evaluate({ ...ctx } as Record<string, number | string>));
  } catch {
    return false;
  }
}

export class NotificationDispatcher {
  constructor(
    private db: Database,
    private enqueueEmail?: EmailEnqueueFn,
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

      for (const recipient of recipients) {
        await this.db.insert(inAppNotifications).values({
          tenantId,
          userId: recipient.userId,
          title: subject,
          body: html.replace(/<[^>]+>/g, ' ').trim(),
          entityType: payload.entityType as string | undefined,
          entityId: payload.entityId as string | undefined,
        });

        if (this.enqueueEmail) {
          await this.enqueueEmail({
            to: recipient.email,
            subject,
            html,
          });
          await this.db.insert(notificationDeliveryLog).values({
            triggerId: trigger.id,
            entityId: payload.entityId as string | undefined,
            recipientUserId: recipient.userId,
            recipientEmail: recipient.email,
            channel: 'EMAIL',
            status: 'QUEUED',
          });
        }
      }
    }
  }
}
