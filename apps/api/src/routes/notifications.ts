import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, inAppNotifications } from '@eam/db';
import { authenticate } from '../plugins/auth.js';

export async function notificationRoutes(app: FastifyInstance) {
  app.get('/notifications', { preHandler: authenticate }, async (request) => {
    return db
      .select()
      .from(inAppNotifications)
      .where(eq(inAppNotifications.userId, request.user!.id));
  });

  app.post('/notifications/:id/read', { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db
      .update(inAppNotifications)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(inAppNotifications.id, id));
    return reply.send({ ok: true });
  });
}
