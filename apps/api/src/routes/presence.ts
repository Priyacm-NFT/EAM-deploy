import type { FastifyInstance } from 'fastify';
import { db } from '@eam/db';
import { authenticate } from '../plugins/auth.js';
import { listOnlineUsers } from '../lib/presence.js';

export async function presenceRoutes(app: FastifyInstance) {
  app.get('/presence/online', { preHandler: authenticate }, async (request) => {
    const users = await listOnlineUsers(db, request.user!.tenantId);
    return { users };
  });
}
