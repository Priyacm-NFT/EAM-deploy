import type { FastifyInstance } from 'fastify';
import { authenticate } from '../plugins/auth.js';

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/dashboard', { preHandler: authenticate }, async (request) => {
    return {
      widgets: [
        { id: 'kpi-open-sr', type: 'kpi', title: 'My Open SRs', value: 0 },
        { id: 'list-recent-wo', type: 'list', title: 'Recent Work Orders', rows: [] },
      ],
      tenantId: request.user!.tenantId,
    };
  });
}
