import type { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import {
  db,
  reportSubjects,
  reportDefinitions,
  reportDefinitionVersions,
  reportFavourites,
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
// FIX: report subjects/definitions listing and every "run"/"preview"
// endpoint (the ones that actually return report data or execute a
// report) were only guarded by authGuard — "are you logged in", not "do
// you have reports:read". Any authenticated user could view and run
// every standard report regardless of what their Security Group's
// Permissions list actually granted them, which is exactly the gap that
// showed the full Reports list to a user whose reports:read box was
// left unchecked. Left authGuard on personal-only endpoints (a user's
// own favourites list) since those don't expose report data by
// themselves.
const reportsReadGuard = { preHandler: [authenticate, requirePermission('reports:read')] };

export async function reportRoutes(app: FastifyInstance) {
  app.get(
    '/reports/subjects',
    { ...reportsReadGuard, schema: { tags: ['Reports'], summary: 'List report subjects' } },
    async () => db.select().from(reportSubjects),
  );

  app.get(
    '/reports/definitions',
    { ...reportsReadGuard, schema: { tags: ['Reports'], summary: 'List report definitions' } },
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
        changeNote?: string;
      };

      // Fetch current row so we can snapshot it before overwriting
      const [current] = await db
        .select()
        .from(reportDefinitions)
        .where(and(eq(reportDefinitions.id, id), eq(reportDefinitions.tenantId, request.user!.tenantId)))
        .limit(1);
      if (!current) return reply.status(404).send({ error: 'Report not found' });

      // If definition is changing, snapshot the old one first
      if (body.definition) {
        await db.insert(reportDefinitionVersions).values({
          reportId: id,
          tenantId: current.tenantId,
          version: current.version,
          definition: current.definition,
          changedBy: request.user!.id,
          changeNote: body.changeNote ?? null,
        });
      }

      const [row] = await db
        .update(reportDefinitions)
        .set({
          ...(body.name ? { name: body.name } : {}),
          ...(body.definition ? {
            definition: body.definition as Record<string, unknown>,
            version: current.version + 1,
          } : {}),
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
    { ...reportsReadGuard, schema: { tags: ['Reports'], summary: 'Preview first 50 rows' } },
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
    { ...reportsReadGuard },
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
    { ...reportsReadGuard, schema: { tags: ['Reports'], summary: 'Run report and return download URL' } },
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
    { ...reportsReadGuard, schema: { tags: ['Reports'] } },
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

  // ─── Version History ────────────────────────────────────────────────────────

  app.get(
    '/reports/definitions/:id/versions',
    { ...authGuard, schema: { tags: ['Reports'], summary: 'List definition version history' } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const [report] = await db
        .select({ id: reportDefinitions.id })
        .from(reportDefinitions)
        .where(and(eq(reportDefinitions.id, id), eq(reportDefinitions.tenantId, request.user!.tenantId)))
        .limit(1);
      if (!report) return reply.status(404).send({ error: 'Report not found' });

      return db
        .select()
        .from(reportDefinitionVersions)
        .where(eq(reportDefinitionVersions.reportId, id))
        .orderBy(desc(reportDefinitionVersions.createdAt))
        .limit(50);
    },
  );

  app.post(
    '/reports/definitions/:id/restore/:version',
    { ...manageGuard, schema: { tags: ['Reports'], summary: 'Restore a definition version' } },
    async (request, reply) => {
      const { id, version } = request.params as { id: string; version: string };
      const vNum = parseInt(version, 10);

      const [snap] = await db
        .select()
        .from(reportDefinitionVersions)
        .where(
          and(
            eq(reportDefinitionVersions.reportId, id),
            eq(reportDefinitionVersions.version, vNum),
          ),
        )
        .limit(1);
      if (!snap) return reply.status(404).send({ error: 'Version not found' });

      // Snapshot current before restoring
      const [current] = await db
        .select()
        .from(reportDefinitions)
        .where(and(eq(reportDefinitions.id, id), eq(reportDefinitions.tenantId, request.user!.tenantId)))
        .limit(1);
      if (!current) return reply.status(404).send({ error: 'Report not found' });

      await db.insert(reportDefinitionVersions).values({
        reportId: id,
        tenantId: current.tenantId,
        version: current.version,
        definition: current.definition,
        changedBy: request.user!.id,
        changeNote: `Before restore to v${vNum}`,
      });

      const [row] = await db
        .update(reportDefinitions)
        .set({
          definition: snap.definition,
          version: current.version + 1,
          updatedAt: new Date(),
        })
        .where(and(eq(reportDefinitions.id, id), eq(reportDefinitions.tenantId, request.user!.tenantId)))
        .returning();
      return row;
    },
  );

  // ─── Favourites & Pins ──────────────────────────────────────────────────────

  app.get(
    '/reports/favourites',
    { ...authGuard, schema: { tags: ['Reports'], summary: 'List favourited reports for current user' } },
    async (request) => {
      const userId = request.user!.id;
      const favs = await db
        .select()
        .from(reportFavourites)
        .where(eq(reportFavourites.userId, userId));

      const ids = favs.map((f) => f.reportId);
      if (ids.length === 0) return [];

      const reports = await Promise.all(
        ids.map((rid) =>
          db.select().from(reportDefinitions)
            .where(and(eq(reportDefinitions.id, rid), eq(reportDefinitions.tenantId, request.user!.tenantId)))
            .limit(1)
            .then((r) => r[0] ?? null),
        ),
      );
      return reports.filter(Boolean).map((r) => ({
        ...r,
        pinned: favs.find((f) => f.reportId === r!.id)?.pinned ?? false,
      }));
    },
  );

  app.post(
    '/reports/definitions/:id/favourite',
    { ...authGuard, schema: { tags: ['Reports'], summary: 'Favourite a report' } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { pinned } = (request.body as { pinned?: boolean }) ?? {};
      const userId = request.user!.id;

      const [existing] = await db
        .select()
        .from(reportFavourites)
        .where(and(eq(reportFavourites.reportId, id), eq(reportFavourites.userId, userId)))
        .limit(1);

      if (existing) {
        const [row] = await db
          .update(reportFavourites)
          .set({ pinned: pinned ?? existing.pinned })
          .where(eq(reportFavourites.id, existing.id))
          .returning();
        return row;
      }

      const [row] = await db
        .insert(reportFavourites)
        .values({ reportId: id, userId, pinned: pinned ?? false })
        .returning();
      return reply.status(201).send(row);
    },
  );

  app.delete(
    '/reports/definitions/:id/favourite',
    { ...authGuard, schema: { tags: ['Reports'], summary: 'Remove favourite' } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await db
        .delete(reportFavourites)
        .where(
          and(
            eq(reportFavourites.reportId, id),
            eq(reportFavourites.userId, request.user!.id),
          ),
        );
      return reply.status(204).send();
    },
  );

  // ─── Run with parameter overrides ──────────────────────────────────────────
  // POST /reports/definitions/:id/run already exists above.
  // This PATCH-style route lets callers pass ad-hoc filter overrides without
  // saving them — useful for prompted-filter dialogs in the UI.

  app.post(
    '/reports/definitions/:id/run-with-params',
    { ...reportsReadGuard, schema: { tags: ['Reports'], summary: 'Run report with parameter overrides' } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as {
        format?: string;
        skipIfEmpty?: boolean;
        paramFilters?: Array<{ field: string; operator: string; value?: unknown }>;
      };

      const [report] = await db
        .select()
        .from(reportDefinitions)
        .where(and(eq(reportDefinitions.id, id), eq(reportDefinitions.tenantId, request.user!.tenantId)))
        .limit(1);
      if (!report) return reply.status(404).send({ error: 'Report not found' });

      // Merge paramFilters over the saved definition filters
      const savedDef = report.definition as ReportDefinitionBody;
      const mergedDef: ReportDefinitionBody = {
        ...savedDef,
        filters: [
          ...(savedDef.filters ?? []),
          ...(body.paramFilters ?? []),
        ],
      };

      // Temporarily write merged def to a throwaway run (no DB update)
      try {
        const { executeReportQuery, ReportQueryBuilder, outputFormatToExport, formatReportOutput, buildReportOutputKey, uploadReportOutput, presignReportDownload } = await import('@eam/reporting-engine');
        const [subject] = await db.select().from(reportSubjects).where(eq(reportSubjects.id, report.subjectId)).limit(1);
        if (!subject) return reply.status(400).send({ error: 'Report subject not found' });

        const builder = new ReportQueryBuilder();
        const safeQuery = builder.buildQuery(subject.name, request.user!.tenantId, {
          fields: mergedDef.fields,
          filters: mergedDef.filters as import('@eam/reporting-engine').ReportFilter[],
          groupBy: mergedDef.groupBy,
          orderBy: mergedDef.orderBy,
        });

        const rows = await executeReportQuery(safeQuery.sql, safeQuery.params, 5000);

        if ((body.skipIfEmpty ?? false) && rows.length === 0) {
          return reply.status(204).send();
        }

        const fmt = outputFormatToExport(body.format ?? 'PDF');
        const formatted = await formatReportOutput(rows, fmt, report.name);
        const runId = `param-${Date.now()}`;
        const key = buildReportOutputKey(request.user!.tenantId, id, runId, formatted.extension);
        await uploadReportOutput(key, formatted.body, formatted.contentType);
        const downloadUrl = await presignReportDownload(key);
        return { status: 'COMPLETED', rowCount: rows.length, downloadUrl };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({ error: msg });
      }
    },
  );
}
