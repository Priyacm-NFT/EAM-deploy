import type { FastifyInstance } from 'fastify';
import { db } from '@eam/db';
import { authenticate } from '../plugins/auth.js';
import { getDashboardWidgets } from '../lib/dashboard-data.js';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/dashboard', { preHandler: authenticate }, async (request) => {
    const widgets = await getDashboardWidgets(db, request.user!.tenantId, request.user!.id);
    return {
      widgets,
      tenantId: request.user!.tenantId,
    };
  });
}
