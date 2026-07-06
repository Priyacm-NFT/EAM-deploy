import type { FastifyInstance } from 'fastify';
import { eq, or, and, desc, like, sql } from 'drizzle-orm';
import { db, chatMessages, users, tenants } from '@eam/db';
import { authenticate, requirePermission } from '../plugins/auth.js';

const DEFAULT_RETENTION_DAYS = 90;

export async function chatRoutes(app: FastifyInstance) {

  // ── Get conversation history ────────────────────────────────────────────────
  app.get('/chat/messages', { preHandler: authenticate }, async (request) => {
    const q = request.query as { with: string };
    return db
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.tenantId, request.user!.tenantId),
          or(
            and(eq(chatMessages.fromUserId, request.user!.id), eq(chatMessages.toUserId, q.with)),
            and(eq(chatMessages.fromUserId, q.with), eq(chatMessages.toUserId, request.user!.id)),
          ),
        ),
      )
      .orderBy(desc(chatMessages.createdAt))
      .limit(90);
  });

  // ── Send a message (REST fallback — socket is primary) ─────────────────────
  app.post('/chat/messages', { preHandler: authenticate }, async (request, reply) => {
    const body = request.body as {
      toUserId: string;
      content: string;
      contextEntityType?: string;
      contextEntityId?: string;
      contextLabel?: string;
    };

    // Enforce 2000-char limit (P0-7 AC)
    if (body.content.length > 2000) {
      return reply.status(400).send({ error: 'Message exceeds 2000 character limit' });
    }

    const [msg] = await db
      .insert(chatMessages)
      .values({
        tenantId: request.user!.tenantId,
        fromUserId: request.user!.id,
        toUserId: body.toUserId,
        content: body.content,
        contextEntityType: body.contextEntityType,
        contextEntityId: body.contextEntityId,
      })
      .returning();
    return reply.status(201).send(msg);
  });

  // ── Search message history (P0-7 missing) ──────────────────────────────────
  app.get('/chat/messages/search', { preHandler: authenticate }, async (request) => {
    const q = request.query as { q: string; with?: string };
    const searchTerm = (q.q ?? '').trim();
    if (!searchTerm) return [];

    const tenantId = request.user!.tenantId;
    const userId = request.user!.id;
    const contentMatch = like(chatMessages.content, `%${searchTerm}%`);

    const whereClause = q.with
      ? and(
          eq(chatMessages.tenantId, tenantId),
          contentMatch,
          or(
            and(eq(chatMessages.fromUserId, userId), eq(chatMessages.toUserId, q.with)),
            and(eq(chatMessages.fromUserId, q.with), eq(chatMessages.toUserId, userId)),
          ),
        )
      : and(
          eq(chatMessages.tenantId, tenantId),
          contentMatch,
          or(
            eq(chatMessages.fromUserId, userId),
            eq(chatMessages.toUserId, userId),
          ),
        );

    if (!whereClause) return [];

    return db
      .select()
      .from(chatMessages)
      .where(whereClause)
      .orderBy(desc(chatMessages.createdAt))
      .limit(50);
  });

  // ── Unread message count (P0-7 missing) ────────────────────────────────────
  app.get('/chat/messages/unread-count', { preHandler: authenticate }, async (request) => {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.tenantId, request.user!.tenantId),
          eq(chatMessages.toUserId, request.user!.id),
          sql`${chatMessages.readAt} IS NULL`,
        ),
      );
    return { count: result[0]?.count ?? 0 };
  });

  // ── Mark messages as read from a specific user ──────────────────────────────
  app.post('/chat/messages/mark-read', { preHandler: authenticate }, async (request, reply) => {
    const { fromUserId } = request.body as { fromUserId: string };
    await db
      .update(chatMessages)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(chatMessages.tenantId, request.user!.tenantId),
          eq(chatMessages.toUserId, request.user!.id),
          eq(chatMessages.fromUserId, fromUserId),
          sql`${chatMessages.readAt} IS NULL`,
        ),
      );
    return reply.send({ ok: true });
  });

  // ── Admin: chat retention policy (P0-7 missing) ────────────────────────────
  // Stored in tenant.settings.chatRetentionDays. Default 90 days per PRD.

  app.get(
    '/admin/chat/retention',
    { preHandler: requirePermission('admin:config:manage') },
    async (request) => {
      const [tenant] = await db
        .select({ settings: tenants.settings })
        .from(tenants)
        .where(eq(tenants.id, request.user!.tenantId))
        .limit(1);
      const retentionDays =
        (tenant?.settings as Record<string, unknown>)?.chatRetentionDays ?? DEFAULT_RETENTION_DAYS;
      return { retentionDays };
    },
  );

  app.put(
    '/admin/chat/retention',
    { preHandler: requirePermission('admin:config:manage') },
    async (request, reply) => {
      const { retentionDays } = request.body as { retentionDays: number };
      if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
        return reply.status(400).send({ error: 'retentionDays must be 1–3650' });
      }

      const [tenant] = await db
        .select({ settings: tenants.settings })
        .from(tenants)
        .where(eq(tenants.id, request.user!.tenantId))
        .limit(1);

      const currentSettings = (tenant?.settings as Record<string, unknown>) ?? {};
      await db
        .update(tenants)
        .set({ settings: { ...currentSettings, chatRetentionDays: retentionDays } })
        .where(eq(tenants.id, request.user!.tenantId));

      return reply.status(204).send();
    },
  );

  // ── Online users list with display names ───────────────────────────────────
  // Returns names for the chat partner picker
  app.get('/chat/users/online', { preHandler: authenticate }, async (request) => {
    const online = await db
      .select({
        userId: users.id,
        displayName: users.displayName,
        email: users.email,
      })
      .from(users)
      .where(
        and(
          eq(users.tenantId, request.user!.tenantId),
          eq(users.isActive, true),
        ),
      )
      .limit(100);
    return online.filter((u) => u.userId !== request.user!.id);
  });
}
