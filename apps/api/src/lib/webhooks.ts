import { eq, and } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import { db, webhookSubscriptions } from '@eam/db';

export async function dispatchWebhookEvent(
  tenantId: string,
  eventType: string,
  payload: unknown,
): Promise<void> {
  const subs = await db.select().from(webhookSubscriptions).where(
    and(
      eq(webhookSubscriptions.tenantId, tenantId),
      eq(webhookSubscriptions.isActive, true),
    ),
  );

  const matching = subs.filter((s) => {
    return !s.events || s.events.length === 0 || s.events.includes(eventType);
  });

  const body = JSON.stringify({ event: eventType, tenantId, data: payload, timestamp: new Date().toISOString() });

  await Promise.allSettled(
    matching.map(async (sub) => {
      const signature = createHmac('sha256', sub.secret).update(body).digest('hex');
      if (!sub.url) return;

      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 10000);
      try {
        await fetch(sub.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-EAM-Signature': signature, 'X-EAM-Event': eventType },
          body,
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    }),
  );
}
