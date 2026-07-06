import { Server, type Namespace } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { verifyToken } from '@eam/auth';
import { db, chatMessages } from '@eam/db';
import { persistChatMessage } from './lib/chat-persist.js';
import { setUserPresence, type PresenceStatus } from './lib/presence.js';
import { wireNotificationSocketPush } from './lib/notification-bridge.js';

export function setupSocketIO(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    path: '/eam/socket.io',
    cors: {
      origin: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(','),
    },
  });

  const nsp = io.of('/eam');
  registerCollaborationHandlers(nsp);
  wireNotificationSocketPush(nsp);
  return io;
}

export function registerCollaborationHandlers(nsp: Namespace) {
  nsp.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string;
      if (!token) return next(new Error('Unauthorized'));
      const payload = await verifyToken(token);
      socket.data.userId = payload.sub;
      socket.data.tenantId = payload.tenantId;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  nsp.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    const tenantId = socket.data.tenantId as string;
    socket.join(`user:${userId}`);
    socket.join(`tenant:${tenantId}`);

    void setUserPresence(db, {
      userId,
      tenantId,
      status: 'ONLINE',
      socketId: socket.id,
    }).then(() => {
      nsp.to(`tenant:${tenantId}`).emit('user:online', { userId, status: 'ONLINE' });
    });

    socket.on('presence:status', (data: { status: PresenceStatus }) => {
      const status = data?.status ?? 'ONLINE';
      void setUserPresence(db, {
        userId,
        tenantId,
        status,
        socketId: socket.id,
      }).then(() => {
        nsp.to(`tenant:${tenantId}`).emit('user:presence', { userId, status });
      });
    });

    socket.on(
      'chat:send',
      async (data: {
        toUserId: string;
        content: string;
        contextEntityType?: string;
        contextEntityId?: string;
      }) => {
        const msg = await persistChatMessage(db, {
          tenantId,
          fromUserId: userId,
          toUserId: data.toUserId,
          content: data.content,
          contextEntityType: data.contextEntityType,
          contextEntityId: data.contextEntityId,
        });
        nsp.to(`user:${data.toUserId}`).emit('chat:message', msg);
        socket.emit('chat:message', msg);

        // Create an in-app notification for the recipient so the bell shows it
        try {
          const { inAppNotifications } = await import('@eam/db');
          const senderName = socket.data?.displayName ?? userId.slice(0, 8);
          const preview = data.content.length > 60 ? data.content.slice(0, 57) + '…' : data.content;
          await db.insert(inAppNotifications).values({
            userId: data.toUserId,
            tenantId,
            title: `New message from ${senderName}`,
            body: preview,
            entityType: 'ChatMessage',
            entityId: msg.id,
          });
        } catch { /* non-critical — don't break the chat send */ }
      },
    );

    socket.on(
      'chat:history',
      async (data: { withUserId: string; limit?: number }, ack?: (messages: unknown[]) => void) => {
        const limit = Math.min(data?.limit ?? 50, 100);
        const messages = await db
          .select()
          .from(chatMessages)
          .where(
            or(
              and(eq(chatMessages.fromUserId, userId), eq(chatMessages.toUserId, data.withUserId)),
              and(eq(chatMessages.fromUserId, data.withUserId), eq(chatMessages.toUserId, userId)),
            ),
          )
          .orderBy(desc(chatMessages.createdAt))
          .limit(limit);
        if (typeof ack === 'function') ack(messages.reverse());
      },
    );

    socket.on('chat:read', async (data: { messageId: string }) => {
      await db.execute(sql`
        UPDATE chat_messages
        SET read_at = NOW()
        WHERE id = ${data.messageId}
          AND to_user_id = ${userId}
      `);
    });

    socket.on('notification:new', (payload: unknown) => {
      socket.emit('notification:new', payload);
    });

    socket.on('disconnect', () => {
      void setUserPresence(db, {
        userId,
        tenantId,
        status: 'OFFLINE',
        socketId: null,
      }).then(() => {
        nsp.to(`tenant:${tenantId}`).emit('user:offline', { userId, status: 'OFFLINE' });
      });
    });
  });
}
