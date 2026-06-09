import { eq, and } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import { db, webhookSubscriptions, webhookDeliveryLog } from '@eam/db';

const MAX_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 1000; // 1s, 2s, 4s, 8s, 16s

async function attemptDelivery(
  url: string,
  body: string,
  signature: string,
  eventType: string,
): Promise<{ ok: boolean; httpStatus?: number; error?: string }> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-EAM-Signature': signature,
        'X-EAM-Event': eventType,
      },
      body,
      signal: ctrl.signal,
    });
    return { ok: res.ok, httpStatus: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timeout);
  }
}

async function deliverWithRetry(
  sub: { id: string; url: string; secret: string },
  body: string,
  eventType: string,
  payload: Record<string, unknown>,
) {
  const signature = createHmac('sha256', sub.secret).update(body).digest('hex');

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await attemptDelivery(sub.url, body, signature, eventType);

    await db.insert(webhookDeliveryLog).values({
      subscriptionId: sub.id,
      eventType,
      payload,
      attempt,
      status: result.ok ? 'DELIVERED' : attempt < MAX_ATTEMPTS ? 'RETRYING' : 'FAILED',
      httpStatus: result.httpStatus,
      error: result.error,
    });

    if (result.ok) return;

    if (attempt < MAX_ATTEMPTS) {
      // Exponential backoff: 1s, 2s, 4s, 8s
      const delay = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

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

  if (matching.length === 0) return;

  const body = JSON.stringify({
    event: eventType,
    tenantId,
    data: payload,
    timestamp: new Date().toISOString(),
  });

  await Promise.allSettled(
    matching.map((sub) =>
      deliverWithRetry(sub, body, eventType, payload as Record<string, unknown>),
    ),
  );
}

