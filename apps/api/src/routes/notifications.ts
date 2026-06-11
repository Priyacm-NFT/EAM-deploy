import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db, inAppNotifications } from '@eam/db';
import { authenticate } from '../plugins/auth.js';

export async function notificationRoutes(app: FastifyInstance) {
  // List all notifications for current user (most recent first, last 50)
  app.get('/notifications', { preHandler: authenticate }, async (request) => {
    return db
      .select()
      .from(inAppNotifications)
      .where(eq(inAppNotifications.userId, request.user!.id))
      .orderBy(inAppNotifications.createdAt)
      .limit(50);
  });

  // Mark a single notification as read
  app.post('/notifications/:id/read', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db
      .update(inAppNotifications)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(inAppNotifications.id, id),
          eq(inAppNotifications.userId, request.user!.id),
        ),
      );
    return reply.send({ ok: true });
  });

  // Mark ALL unread notifications as read (P0-8 missing)
  app.post('/notifications/read-all', { preHandler: authenticate }, async (request, reply) => {
    await db
      .update(inAppNotifications)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(inAppNotifications.userId, request.user!.id),
          eq(inAppNotifications.isRead, false),
        ),
      );
    return reply.send({ ok: true });
  });

  // Delete a single notification (P0-8 missing)
  app.delete('/notifications/:id', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db
      .delete(inAppNotifications)
      .where(
        and(
          eq(inAppNotifications.id, id),
          eq(inAppNotifications.userId, request.user!.id),
        ),
      );
    return reply.status(204).send();
  });

  // SSE polling fallback — streams new unread notifications to tab (P0-8 missing)
  // Used when WebSocket is unavailable. Client reconnects every 30s automatically.
  app.get('/notifications/stream', { preHandler: authenticate }, async (request, reply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders?.();

    const userId = request.user!.id;

    // Send current unread count immediately on connect
    const unread = await db
      .select()
      .from(inAppNotifications)
      .where(
        and(
          eq(inAppNotifications.userId, userId),
          eq(inAppNotifications.isRead, false),
        ),
      );

    const sendEvent = (data: unknown) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent({ type: 'unread_count', count: unread.length, notifications: unread });

    // Poll DB every 15s and push new notifications
    const interval = setInterval(async () => {
      try {
        const fresh = await db
          .select()
          .from(inAppNotifications)
          .where(
            and(
              eq(inAppNotifications.userId, userId),
              eq(inAppNotifications.isRead, false),
            ),
          );
        sendEvent({ type: 'unread_count', count: fresh.length });
      } catch {
        // Client disconnected — clean up below
      }
    }, 15000);

    // Clean up when client closes connection
    request.raw.on('close', () => clearInterval(interval));
    request.raw.on('end', () => clearInterval(interval));

    // Keep connection alive with a heartbeat comment every 25s
    const heartbeat = setInterval(() => {
      reply.raw.write(': heartbeat\n\n');
    }, 25000);
    request.raw.on('close', () => clearInterval(heartbeat));

    // Don't call reply.send() — SSE keeps the response open
    await new Promise<void>((resolve) => {
      request.raw.on('close', resolve);
    });
  });
}

