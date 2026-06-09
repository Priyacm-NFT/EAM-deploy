import type { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import {
  db,
  reportSubjects,
  reportDefinitions,
  reportSchedules,
  reportRunLog,
  reportPermissions,
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
        // Execute the base query — replace all $1 / :tenantId / $tenantId with tenant id
        const { sql: drizzleSql } = await import('drizzle-orm');
        // Replace parameterised $1 with literal tenant UUID (safe — UUID contains only hex+dashes)
        const safeQuery = subject.baseQuery
          .replace(/\$1/g, `'${tid}'`)
          .replace(/:tenantId/g, `'${tid}'`)
          .replace(/\$tenantId/g, `'${tid}'`);
        const limitedQuery = safeQuery.includes('LIMIT') ? safeQuery : safeQuery + ' LIMIT 200';
        const rows = await db.execute(drizzleSql.raw(limitedQuery));
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
      const body = (request.body ?? {}) as { format?: string; skipIfEmpty?: boolean };
      const format = body.format ?? 'PDF';
      const skipIfEmpty = body.skipIfEmpty ?? false;
      try {
        // Zero-row skip: preview first, return 204 if empty and skipIfEmpty=true
        if (skipIfEmpty) {
          const preview = await previewReport(db, id, request.user!.tenantId);
          const { shouldSkipEmpty } = await import('@eam/reporting-engine');
          if (shouldSkipEmpty(true, preview.rows?.length ?? 0)) {
            return reply.status(204).send();
          }
        }
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

  // ─── Report Permissions ────────────────────────────────────────────────────

  app.get(
    '/reports/definitions/:id/permissions',
    { ...manageGuard },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const [report] = await db.select().from(reportDefinitions)
        .where(and(eq(reportDefinitions.id, id), eq(reportDefinitions.tenantId, request.user!.tenantId)))
        .limit(1);
      if (!report) return reply.code(404).send({ error: 'Not found' });
      return db.select().from(reportPermissions)
        .where(and(eq(reportPermissions.reportId, id), eq(reportPermissions.tenantId, request.user!.tenantId)));
    },
  );

  app.post(
    '/reports/definitions/:id/permissions',
    { ...manageGuard },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        userId?: string;
        roleId?: string;
        canView?: boolean;
        canRun?: boolean;
        canEdit?: boolean;
        canSchedule?: boolean;
        canShare?: boolean;
      };
      if (!body.userId && !body.roleId) {
        return reply.code(400).send({ error: 'userId or roleId is required' });
      }
      const [row] = await db.insert(reportPermissions).values({
        reportId: id,
        tenantId: request.user!.tenantId,
        userId: body.userId,
        roleId: body.roleId,
        canView: body.canView ?? true,
        canRun: body.canRun ?? true,
        canEdit: body.canEdit ?? false,
        canSchedule: body.canSchedule ?? false,
        canShare: body.canShare ?? false,
        grantedBy: request.user!.id,
      }).returning();
      return reply.code(201).send(row);
    },
  );

  app.delete(
    '/reports/definitions/:id/permissions/:permId',
    { ...manageGuard },
    async (request, reply) => {
      const { permId } = request.params as { id: string; permId: string };
      await db.delete(reportPermissions)
        .where(and(
          eq(reportPermissions.id, permId),
          eq(reportPermissions.tenantId, request.user!.tenantId),
        ));
      return reply.code(204).send();
    },
  );

  // ─── BI Row-Level Security Views ───────────────────────────────────────────
  // Provisions tenant-scoped views on the reporting DB schema for BI tools

  app.post(
    '/admin/reporting/bi-rls-views/provision',
    { preHandler: [authenticate, requirePermission('admin:reporting:manage')] },
    async (request) => {
      const { provisionBiRlsViews } = await import('@eam/reporting-engine');
      return provisionBiRlsViews(request.user!.tenantId);
    },
  );

  app.get(
    '/admin/reporting/bi-rls-views/info',
    { preHandler: [authenticate, requirePermission('admin:reporting:manage')] },
    async (request) => {
      const { getBiConnectionInfo } = await import('@eam/reporting-engine');
      return getBiConnectionInfo(request.user!.tenantId);
    },
  );
}
