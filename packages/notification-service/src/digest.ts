import { inArray, lte } from 'drizzle-orm';
import type { Database } from '@eam/db';
import { notificationDigestQueue } from '@eam/db';

export interface DigestConfig {
  enabled: boolean;
  windowMinutes: number;
}

export function parseDigestConfig(
  raw: Record<string, unknown> | null | undefined,
): DigestConfig | null {
  if (!raw || raw.enabled !== true) return null;
  const windowMinutes = Number(raw.windowMinutes ?? 5);
  return {
    enabled: true,
    windowMinutes: Number.isFinite(windowMinutes) && windowMinutes > 0 ? windowMinutes : 5,
  };
}

export function digestFlushAfter(windowMinutes: number): Date {
  return new Date(Date.now() + windowMinutes * 60_000);
}

export function buildDigestEmail(
  items: Array<{ subject: string; html: string }>,
  triggerName?: string,
): { subject: string; html: string } {
  const title = triggerName ?? 'Notification digest';
  const rows = items
    .map(
      (item) =>
        `<li><strong>${item.subject}</strong><div>${item.html}</div></li>`,
    )
    .join('');
  return {
    subject: `${title} (${items.length} notification${items.length === 1 ? '' : 's'})`,
    html: `<p>You have ${items.length} notification(s):</p><ul>${rows}</ul>`,
  };
}

export async function queueDigestItem(
  db: Database,
  item: {
    tenantId: string;
    triggerId: string;
    recipientUserId?: string | null;
    recipientEmail: string;
    subject: string;
    html: string;
    entityType?: string | null;
    entityId?: string | null;
    flushAfter: Date;
  },
): Promise<void> {
  await db.insert(notificationDigestQueue).values({
    tenantId: item.tenantId,
    triggerId: item.triggerId,
    recipientUserId: item.recipientUserId ?? null,
    recipientEmail: item.recipientEmail,
    subject: item.subject,
    html: item.html,
    entityType: item.entityType ?? null,
    entityId: item.entityId ?? null,
    flushAfter: item.flushAfter,
  });
}

export async function flushReadyDigests(
  db: Database,
  send: (job: { to: string; subject: string; html: string }) => Promise<void>,
): Promise<number> {
  const now = new Date();
  const pending = await db
    .select()
    .from(notificationDigestQueue)
    .where(lte(notificationDigestQueue.flushAfter, now));

  if (pending.length === 0) return 0;

  const groups = new Map<string, typeof pending>();
  for (const row of pending) {
    const key = `${row.triggerId}:${row.recipientEmail}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  const idsToDelete: string[] = [];

  for (const rows of groups.values()) {
    const digest = buildDigestEmail(
      rows.map((r) => ({ subject: r.subject, html: r.html })),
    );
    await send({
      to: rows[0]!.recipientEmail,
      subject: digest.subject,
      html: digest.html,
    });
    idsToDelete.push(...rows.map((r) => r.id));
  }

  await db
    .delete(notificationDigestQueue)
    .where(inArray(notificationDigestQueue.id, idsToDelete));

  return groups.size;
}
