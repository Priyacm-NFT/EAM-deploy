import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { verifyToken } from '@eam/auth';

export function setupSocketIO(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    path: '/eam/socket.io',
    cors: {
      origin: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(','),
    },
  });

  const nsp = io.of('/eam');

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
    nsp.to(`tenant:${tenantId}`).emit('user:online', { userId });

    socket.on('chat:send', (data: { toUserId: string; content: string }) => {
      nsp.to(`user:${data.toUserId}`).emit('chat:message', {
        fromUserId: userId,
        content: data.content,
      });
    });

    socket.on('notification:new', (payload: unknown) => {
      socket.emit('notification:new', payload);
    });
  });

  return io;
}
