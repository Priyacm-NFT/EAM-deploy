import type { FastifyInstance } from 'fastify';
import { ReportQueryBuilder } from '@eam/reporting-engine';
import { authenticate } from '../plugins/auth.js';

export async function reportRoutes(app: FastifyInstance) {
  app.get('/reports/subjects', { preHandler: authenticate }, async () => {
    const { reportSubjects } = await import('@eam/db');
    const { db } = await import('@eam/db');
    return db.select().from(reportSubjects);
  });

  app.get('/reports/definitions/:id/preview', { preHandler: authenticate }, async (request) => {
    const builder = new ReportQueryBuilder();
    const q = builder.buildQuery('service_requests', request.user!.tenantId);
    return { query: q, rows: [], preview: true, limit: 50 };
  });
}
