import type { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import {
  db,
  reportSubjects,
  reportDefinitions,
  reportSchedules,
  reportRunLog,
} from '@eam/db';
import {
  previewReport,
  runReport,
  type ReportDefinitionBody,
} from '@eam/reporting-engine';
import { authenticate, requirePermission } from '../plugins/auth.js';

const manageGuard = { preHandler: [authenticate, requirePermission('admin:reporting:manage')] };
const authGuard = { preHandler: authenticate };

export async function reportRoutes(app: FastifyInstance) {
  app.get(
    '/reports/subjects',
    { ...authGuard, schema: { tags: ['Reports'], summary: 'List report subjects' } },
    async () => db.select().from(reportSubjects),
  );

  app.get(
    '/reports/definitions',
    { ...authGuard, schema: { tags: ['Reports'], summary: 'List report definitions' } },
    async (request) =>
      db
        .select()
        .from(reportDefinitions)
        .where(eq(reportDefinitions.tenantId, request.user!.tenantId)),
  );

  app.post(
    '/reports/definitions',
    { ...manageGuard, schema: { tags: ['Reports'], summary: 'Create report definition' } },
    async (request) => {
      const body = request.body as {
        name: string;
        subjectId: string;
        definition: ReportDefinitionBody;
        isPublic?: boolean;
      };
      const [row] = await db
        .insert(reportDefinitions)
        .values({
          tenantId: request.user!.tenantId,
          name: body.name,
          subjectId: body.subjectId,
          definition: body.definition as Record<string, unknown>,
          isPublic: body.isPublic ?? false,
          createdBy: request.user!.id,
        })
        .returning();
      return row;
    },
  );

  app.get(
    '/reports/definitions/:id',
    { ...authGuard, schema: { tags: ['Reports'], params: { type: 'object', properties: { id: { type: 'string' } } } } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const [row] = await db
        .select()
        .from(reportDefinitions)
        .where(
          and(
            eq(reportDefinitions.id, id),
            eq(reportDefinitions.tenantId, request.user!.tenantId),
          ),
        )
        .limit(1);
      if (!row) return reply.status(404).send({ error: 'Report not found' });
      return row;
    },
  );

  app.put(
    '/reports/definitions/:id',
    { ...manageGuard, schema: { tags: ['Reports'] } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        definition?: ReportDefinitionBody;
        isPublic?: boolean;
      };
      const [row] = await db
        .update(reportDefinitions)
        .set({
          ...(body.name ? { name: body.name } : {}),
          ...(body.definition ? { definition: body.definition as Record<string, unknown> } : {}),
          ...(body.isPublic !== undefined ? { isPublic: body.isPublic } : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(reportDefinitions.id, id),
            eq(reportDefinitions.tenantId, request.user!.tenantId),
          ),
        )
        .returning();
      if (!row) return reply.status(404).send({ error: 'Report not found' });
      return row;
    },
  );

  app.delete(
    '/reports/definitions/:id',
    { ...manageGuard, schema: { tags: ['Reports'] } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await db
        .delete(reportDefinitions)
        .where(
          and(
            eq(reportDefinitions.id, id),
            eq(reportDefinitions.tenantId, request.user!.tenantId),
          ),
        );
      return reply.status(204).send();
    },
  );

  app.get(
    '/reports/definitions/:id/preview',
    { ...authGuard, schema: { tags: ['Reports'], summary: 'Preview first 50 rows' } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const result = await previewReport(db, id, request.user!.tenantId);
        return { ...result, preview: true, limit: 50 };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('Invalid') || msg.includes('not found')) {
          return reply.status(400).send({ error: msg });
        }
        throw err;
      }
    },
  );

  // Run a built-in report subject directly (returns rows for the standard reports page)
  app.get(
    '/reports/run/:subjectId',
    { ...authGuard },
    async (request, reply) => {
      const { subjectId } = request.params as { subjectId: string };
      const tid = request.user!.tenantId;

      const [subject] = await db.select().from(reportSubjects).where(eq(reportSubjects.id, subjectId)).limit(1);
      if (!subject) return reply.code(404).send({ error: 'Report subject not found' });

      try {
        // Execute the base query with the tenant context
        const { sql: drizzleSql } = await import('drizzle-orm');
        const rows = await db.execute(drizzleSql.raw(
          subject.baseQuery.replace(/:tenantId/g, `'${tid}'`).replace(/\$tenantId/g, `'${tid}'`) + ' LIMIT 200',
        ));
        return Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows;
      } catch (err) {
        return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  );

  app.post(
    '/reports/definitions/:id/run',
    { ...authGuard, schema: { tags: ['Reports'], summary: 'Run report and return download URL' } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { format?: string };
      const format = body.format ?? 'PDF';
      try {
        const result = await runReport(db, {
          reportId: id,
          tenantId: request.user!.tenantId,
          userId: request.user!.id,
          format,
        });
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: msg });
      }
    },
  );

  app.get(
    '/reports/schedules',
    { ...authGuard, schema: { tags: ['Reports'] } },
    async (request) =>
      db
        .select()
        .from(reportSchedules)
        .where(eq(reportSchedules.tenantId, request.user!.tenantId)),
  );

  app.post(
    '/reports/schedules',
    { ...manageGuard, schema: { tags: ['Reports'] } },
    async (request) => {
      const body = request.body as {
        reportId: string;
        cronExpr: string;
        outputFormat: string;
        distribution: Record<string, unknown>;
        skipIfEmpty?: boolean;
      };
      const [row] = await db
        .insert(reportSchedules)
        .values({
          tenantId: request.user!.tenantId,
          reportId: body.reportId,
          cronExpr: body.cronExpr,
          outputFormat: body.outputFormat,
          distribution: body.distribution,
          skipIfEmpty: body.skipIfEmpty ?? false,
        })
        .returning();
      const { reportScheduleQueue } = await import('../queues.js');
      await reportScheduleQueue.add(
        'sync-schedule',
        { scheduleId: row!.id },
        { jobId: `schedule-${row!.id}` },
      );
      return row;
    },
  );

  app.get(
    '/reports/runs',
    { ...authGuard, schema: { tags: ['Reports'] } },
    async (request) => {
      const reportId = (request.query as { reportId?: string }).reportId;
      const logs = await db
        .select()
        .from(reportRunLog)
        .orderBy(desc(reportRunLog.startedAt))
        .limit(100);
      if (!reportId) return logs;
      return logs.filter((l) => l.reportId === reportId);
    },
  );
}
