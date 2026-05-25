import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db, reportBiConnections, reportSubjects } from '@eam/db';
import {
  getBiConnectionInfo,
  getBiAdapter,
  supportedBiAdapterTypes,
  pushPowerBiRows,
  exportQlikQvdCsv,
  cognosFrameworkManagerConfig,
  storeBirtDesign,
  runBirtReport,
  previewReport,
  buildTableauSchema,
  paginateTableauData,
  tableauWdcHtml,
  executeReportQuery,
  ReportQueryBuilder,
} from '@eam/reporting-engine';
import { requirePermission } from '../plugins/auth.js';

const guard = { preHandler: requirePermission('admin:reporting:manage') };

export async function adminReportingRoutes(app: FastifyInstance) {
  app.get(
    '/admin/reporting/bi-connection-info',
    { ...guard, schema: { tags: ['Reports'], summary: 'Read-replica BI connection info' } },
    async (request) => getBiConnectionInfo(request.user!.tenantId),
  );

  app.get(
    '/admin/reporting/bi-adapters',
    { ...guard, schema: { tags: ['Reports'] } },
    async () => supportedBiAdapterTypes(),
  );

  app.get(
    '/admin/reporting/bi-connections',
    { ...guard, schema: { tags: ['Reports'] } },
    async (request) =>
      db
        .select()
        .from(reportBiConnections)
        .where(eq(reportBiConnections.tenantId, request.user!.tenantId)),
  );

  app.post(
    '/admin/reporting/bi-connections',
    { ...guard, schema: { tags: ['Reports'] } },
    async (request) => {
      const body = request.body as {
        adapterType: string;
        name: string;
        config?: Record<string, unknown>;
        isActive?: boolean;
      };
      const [row] = await db
        .insert(reportBiConnections)
        .values({
          tenantId: request.user!.tenantId,
          adapterType: body.adapterType,
          name: body.name,
          config: body.config ?? {},
          isActive: body.isActive ?? true,
        })
        .returning();
      return row;
    },
  );

  app.post(
    '/admin/reporting/bi-connections/:id/test',
    { ...guard, schema: { tags: ['Reports'] } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const [conn] = await db
        .select()
        .from(reportBiConnections)
        .where(
          and(
            eq(reportBiConnections.id, id),
            eq(reportBiConnections.tenantId, request.user!.tenantId),
          ),
        )
        .limit(1);
      if (!conn) return reply.status(404).send({ error: 'Connection not found' });

      const adapter = getBiAdapter(conn.adapterType);
      if (!adapter) return reply.status(400).send({ error: 'Unknown adapter type' });

      const result = await adapter.testConnection({
        tenantId: request.user!.tenantId,
        config: conn.config,
      });

      await db
        .update(reportBiConnections)
        .set({
          lastTestedAt: new Date(),
          lastTestStatus: result.success ? 'OK' : 'FAILED',
          updatedAt: new Date(),
        })
        .where(eq(reportBiConnections.id, id));

      return result;
    },
  );

  app.post(
    '/admin/reporting/bi/powerbi/push/:reportId',
    { ...guard, schema: { tags: ['Reports'] } },
    async (request) => {
      const { reportId } = request.params as { reportId: string };
      const preview = await previewReport(db, reportId, request.user!.tenantId, 10_000);
      const [conn] = await db
        .select()
        .from(reportBiConnections)
        .where(
          and(
            eq(reportBiConnections.tenantId, request.user!.tenantId),
            eq(reportBiConnections.adapterType, 'POWERBI'),
            eq(reportBiConnections.isActive, true),
          ),
        )
        .limit(1);
      return pushPowerBiRows(
        (conn?.config ?? {}) as { pushUrl?: string; accessToken?: string },
        preview.rows,
      );
    },
  );

  app.post(
    '/admin/reporting/bi/qlik/export/:subjectId',
    { ...guard, schema: { tags: ['Reports'] } },
    async (request, reply) => {
      const { subjectId } = request.params as { subjectId: string };
      const [subject] = await db
        .select()
        .from(reportSubjects)
        .where(eq(reportSubjects.id, subjectId))
        .limit(1);
      if (!subject) return reply.status(404).send({ error: 'Subject not found' });

      const builder = new ReportQueryBuilder();
      const q = builder.buildQuery(subject.name, request.user!.tenantId);
      const rows = await executeReportQuery(q.sql, q.params, 10_000);
      return exportQlikQvdCsv(request.user!.tenantId, subjectId, rows);
    },
  );

  app.get(
    '/admin/reporting/bi/cognos/connection-info',
    { ...guard, schema: { tags: ['Reports'] } },
    async (request) => cognosFrameworkManagerConfig(request.user!.tenantId),
  );

  app.post(
    '/admin/reporting/birt/upload',
    { ...guard, schema: { tags: ['Reports'] } },
    async (request) => {
      const body = request.body as { designId: string; xml: string };
      const key = await storeBirtDesign(request.user!.tenantId, body.designId, body.xml);
      return { storageKey: key };
    },
  );

  app.get(
    '/admin/reporting/birt/:designId/run',
    { ...guard, schema: { tags: ['Reports'] } },
    async (request) => {
      const { designId } = request.params as { designId: string };
      const format = ((request.query as { format?: string }).format ?? 'PDF').toUpperCase() as 'PDF' | 'HTML';
      const key = `bi/birt/${request.user!.tenantId}/${designId}.rptdesign`;
      return runBirtReport(key, format);
    },
  );

  app.get(
    '/reporting/tableau-wdc/:subjectId',
    { schema: { tags: ['Reports'] } },
    async (request, reply) => {
      const { subjectId } = request.params as { subjectId: string };
      const apiBase = process.env.API_URL ?? 'http://localhost:3000';
      reply.type('text/html').send(tableauWdcHtml(apiBase, subjectId));
    },
  );

  app.get(
    '/reporting/tableau-wdc/:subjectId/schema',
    { schema: { tags: ['Reports'] } },
    async (request, reply) => {
      const { subjectId } = request.params as { subjectId: string };
      const [subject] = await db
        .select()
        .from(reportSubjects)
        .where(eq(reportSubjects.id, subjectId))
        .limit(1);
      if (!subject) return reply.status(404).send({ error: 'Subject not found' });
      const fields = (subject.availableFields ?? []) as {
        key: string;
        label: string;
        type: string;
      }[];
      return buildTableauSchema(fields);
    },
  );

  app.get(
    '/reporting/tableau-wdc/:subjectId/data',
    { schema: { tags: ['Reports'] } },
    async (request, reply) => {
      const { subjectId } = request.params as { subjectId: string };
      const q = request.query as { tenantId?: string; page?: string; pageSize?: string };
      const tenantId = q.tenantId;
      if (!tenantId) return reply.status(400).send({ error: 'tenantId query required' });

      const [subject] = await db
        .select()
        .from(reportSubjects)
        .where(eq(reportSubjects.id, subjectId))
        .limit(1);
      if (!subject) return reply.status(404).send({ error: 'Subject not found' });

      const builder = new ReportQueryBuilder();
      const safe = builder.buildQuery(subject.name, tenantId);
      const rows = await executeReportQuery(safe.sql, safe.params, 5000);
      return paginateTableauData(
        rows,
        Number(q.page ?? 1),
        Number(q.pageSize ?? 100),
      );
    },
  );
}
