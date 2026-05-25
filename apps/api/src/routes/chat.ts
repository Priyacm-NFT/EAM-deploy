import type { FastifyInstance } from 'fastify';
import { eq, or, and, desc } from 'drizzle-orm';
import { db, chatMessages } from '@eam/db';
import { authenticate } from '../plugins/auth.js';

export async function chatRoutes(app: FastifyInstance) {
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
      .limit(50);
  });

  app.post('/chat/messages', { preHandler: authenticate }, async (request, reply) => {
    const body = request.body as {
      toUserId: string;
      content: string;
      contextEntityType?: string;
      contextEntityId?: string;
    };
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
}
