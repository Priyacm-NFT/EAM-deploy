
import type { FastifyInstance } from 'fastify';
import { eq, desc, and } from 'drizzle-orm';
import { z } from 'zod';
import {
  db,
  integrationConnections,
  integrationJobs,
  integrationRunLog,
  webhookSubscriptions,
  webhookDeliveryLog,
  apiKeys,
} from '@eam/db';
import {
  getAdapter,
  supportedAdapterTypes,
  listErpConnectors,
  buildErpConnection,
  computeNextRun,
  runIntegrationJob,
  scheduleIntegrationJob,
  fetchExportRows,
  formatBulkExport,
  type ErpVendor,
  type ExportEntityType,
  type ExportFormat,
} from '@eam/integration-framework';
import { requirePermission } from '../plugins/auth.js';

const guard = { preHandler: requirePermission('admin:integrations:manage') };

const connectionBodySchema = {
  type: 'object',
  required: ['name', 'adapterType', 'config'],
  properties: {
    name: { type: 'string' },
    adapterType: { type: 'string' },
    config: { type: 'object', additionalProperties: true },
    isActive: { type: 'boolean' },
  },
} as const;

const jobBodySchema = {
  type: 'object',
  required: ['connectionId', 'jobType'],
  properties: {
    connectionId: { type: 'string', format: 'uuid' },
    jobType: { type: 'string' },
    scheduleCron: { type: 'string' },
    triggerEvent: { type: 'string' },
    mappingConfig: { type: 'object', additionalProperties: true },
    isActive: { type: 'boolean' },
  },
} as const;

export async function adminIntegrationRoutes(app: FastifyInstance) {
  app.get(
    '/admin/integrations/adapters',
    {
      ...guard,
      schema: {
        tags: ['Integrations'],
        summary: 'List supported integration adapter types',
        response: { 200: { type: 'array', items: { type: 'string' } } },
      },
    },
    async () => supportedAdapterTypes(),
  );

  app.get(
    '/admin/integrations/erp-connectors',
    {
      ...guard,
      schema: {
        tags: ['Integrations'],
        summary: 'List ERP connector presets',
      },
    },
    async () => listErpConnectors(),
  );

  app.post(
    '/admin/integrations/erp-connectors/:vendor/config',
    {
      ...guard,
      schema: {
        tags: ['Integrations'],
        summary: 'Build adapter config from ERP preset inputs',
        params: {
          type: 'object',
          properties: { vendor: { type: 'string', enum: ['SAP', 'ORACLE_EBS', 'MS_DYNAMICS', 'WORKDAY'] } },
        },
      },
    },
    async (request) => {
      const vendor = (request.params as { vendor: ErpVendor }).vendor;
      const input = (request.body ?? {}) as Record<string, unknown>;
      return buildErpConnection(vendor, input);
    },
  );

  app.get(
    '/admin/integrations/connections',
    {
      ...guard,
      schema: {
        tags: ['Integrations'],
        summary: 'List integration connections',
      },
    },
    async (request) => {
      return db
        .select()
        .from(integrationConnections)
        .where(eq(integrationConnections.tenantId, request.user!.tenantId));
    },
  );

  app.post(
    '/admin/integrations/connections',
    {
      ...guard,
      schema: {
        tags: ['Integrations'],
        summary: 'Create integration connection',
        body: connectionBodySchema,
      },
    },
    async (request, reply) => {
      const body = request.body as {
        name: string;
        adapterType: (typeof integrationConnections.$inferInsert)['adapterType'];
        config: Record<string, unknown>;
        isActive?: boolean;
      };
      const [row] = await db
        .insert(integrationConnections)
        .values({
          tenantId: request.user!.tenantId,
          name: body.name,
          adapterType: body.adapterType,
          config: body.config,
          isActive: body.isActive ?? true,
        })
        .returning();
      return reply.code(201).send(row);
    },
  );

  app.post(
    '/admin/integrations/connections/:id/test',
    {
      ...guard,
      schema: {
        tags: ['Integrations'],
        summary: 'Test integration connection',
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const [conn] = await db
        .select()
        .from(integrationConnections)
        .where(eq(integrationConnections.id, id))
        .limit(1);
      if (!conn || conn.tenantId !== request.user!.tenantId) {
        return reply.code(404).send({ error: 'Not found' });
      }
      const adapter = getAdapter(conn.adapterType);
      if (!adapter) return reply.code(400).send({ error: 'Unsupported adapter' });
      return adapter.test(conn.config);
    },
  );

  app.get(
    '/admin/integrations/jobs',
    {
      ...guard,
      schema: { tags: ['Integrations'], summary: 'List integration jobs' },
    },
    async (request) => {
      return db
        .select()
        .from(integrationJobs)
        .where(eq(integrationJobs.tenantId, request.user!.tenantId));
    },
  );

  app.post(
    '/admin/integrations/jobs',
    {
      ...guard,
      schema: {
        tags: ['Integrations'],
        summary: 'Create integration job',
        body: jobBodySchema,
      },
    },
    async (request, reply) => {
      const body = request.body as {
        connectionId: string;
        jobType: string;
        scheduleCron?: string;
        triggerEvent?: string;
        mappingConfig?: Record<string, unknown>;
        isActive?: boolean;
      };
      const nextRunAt = body.scheduleCron ? computeNextRun(body.scheduleCron) : undefined;
      const [row] = await db
        .insert(integrationJobs)
        .values({
          tenantId: request.user!.tenantId,
          connectionId: body.connectionId,
          jobType: body.jobType,
          scheduleCron: body.scheduleCron,
          triggerEvent: body.triggerEvent,
          mappingConfig: body.mappingConfig ?? {},
          isActive: body.isActive ?? true,
          nextRunAt,
        })
        .returning();
      return reply.code(201).send(row);
    },
  );

  app.post(
    '/admin/integrations/jobs/:id/schedule',
    {
      ...guard,
      schema: {
        tags: ['Integrations'],
        summary: 'Set or update cron schedule for a job',
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          required: ['scheduleCron'],
          properties: { scheduleCron: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { scheduleCron } = request.body as { scheduleCron: string };
      const [job] = await db
        .select()
        .from(integrationJobs)
        .where(eq(integrationJobs.id, id))
        .limit(1);
      if (!job || job.tenantId !== request.user!.tenantId) {
        return reply.code(404).send({ error: 'Not found' });
      }
      await scheduleIntegrationJob(db, id, scheduleCron);
      const [updated] = await db.select().from(integrationJobs).where(eq(integrationJobs.id, id)).limit(1);
      return updated;
    },
  );

  app.post(
    '/admin/integrations/jobs/:id/run',
    {
      ...guard,
      schema: {
        tags: ['Integrations'],
        summary: 'Run integration job immediately',
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const [job] = await db
        .select()
        .from(integrationJobs)
        .where(eq(integrationJobs.id, id))
        .limit(1);
      if (!job || job.tenantId !== request.user!.tenantId) {
        return reply.code(404).send({ error: 'Not found' });
      }
      const payload = (request.body ?? {}) as Record<string, unknown>;
      return runIntegrationJob(db, id, payload);
    },
  );

  app.get(
    '/admin/integrations/jobs/:id/runs',
    {
      ...guard,
      schema: {
        tags: ['Integrations'],
        summary: 'Integration job run history',
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const [job] = await db
        .select()
        .from(integrationJobs)
        .where(eq(integrationJobs.id, id))
        .limit(1);
      if (!job || job.tenantId !== request.user!.tenantId) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return db
        .select()
        .from(integrationRunLog)
        .where(eq(integrationRunLog.jobId, id))
        .orderBy(desc(integrationRunLog.startedAt))
        .limit(100);
    },
  );

  app.post(
    '/admin/integrations/export',
    {
      ...guard,
      schema: {
        tags: ['Integrations'],
        summary: 'Bulk export tenant entity data (CSV, JSON, or Excel)',
        body: {
          type: 'object',
          required: ['entityType', 'format'],
          properties: {
            entityType: {
              type: 'string',
              enum: ['assets', 'service_requests', 'work_orders'],
            },
            format: { type: 'string', enum: ['csv', 'json', 'xlsx'] },
            limit: { type: 'integer', minimum: 1, maximum: 10000 },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = z
        .object({
          entityType: z.enum(['assets', 'service_requests', 'work_orders']),
          format: z.enum(['csv', 'json', 'xlsx']),
          limit: z.number().int().min(1).max(10_000).optional(),
        })
        .parse(request.body);

      const rows = await fetchExportRows(
        db,
        request.user!.tenantId,
        parsed.entityType as ExportEntityType,
        parsed.limit,
      );
      const out = await formatBulkExport(rows, parsed.format as ExportFormat);
      reply.header('Content-Type', out.contentType);
      reply.header('Content-Disposition', `attachment; filename="${out.filename}"`);
      return out.body;
    },
  );

  // ─── Connection PUT / DELETE ──────────────────────────────────────────────────

  app.put(
    '/admin/integrations/connections/:id',
    {
      ...guard,
      schema: { tags: ['Integrations'], summary: 'Update integration connection' },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        config?: Record<string, unknown>;
        isActive?: boolean;
      };

      const updates: Partial<typeof integrationConnections.$inferInsert> = {};
      if (body.name != null) updates.name = body.name;
      if (body.config != null) updates.config = body.config;
      if (body.isActive != null) updates.isActive = body.isActive;

      const [row] = await db
        .update(integrationConnections)
        .set(updates)
        .where(eq(integrationConnections.id, id))
        .returning();

      if (!row || row.tenantId !== request.user!.tenantId) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return row;
    },
  );

  // ── Enable / disable connection toggle ────────────────────────────────────
  app.post(
    '/admin/integrations/connections/:id/toggle',
    {
      ...guard,
      schema: { tags: ['Integrations'], summary: 'Enable or disable a connection without code changes' },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const tid = request.user!.tenantId;
      const [current] = await db.select({ isActive: integrationConnections.isActive })
        .from(integrationConnections)
        .where(and(eq(integrationConnections.id, id), eq(integrationConnections.tenantId, tid)))
        .limit(1);
      if (!current) return reply.code(404).send({ error: 'Not found' });
      const [row] = await db.update(integrationConnections)
        .set({ isActive: !current.isActive })
        .where(eq(integrationConnections.id, id))
        .returning();
      return { id, isEnabled: row!.isActive };
    },
  );

  app.delete(
    '/admin/integrations/connections/:id',
    {
      ...guard,
      schema: { tags: ['Integrations'], summary: 'Delete integration connection' },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const [conn] = await db
        .select()
        .from(integrationConnections)
        .where(eq(integrationConnections.id, id))
        .limit(1);
      if (!conn || conn.tenantId !== request.user!.tenantId) {
        return reply.code(404).send({ error: 'Not found' });
      }
      await db.delete(integrationConnections).where(eq(integrationConnections.id, id));
      return reply.code(204).send();
    },
  );

  // ─── Job PUT / PATCH / DELETE ─────────────────────────────────────────────────

  app.put(
    '/admin/integrations/jobs/:id',
    {
      ...guard,
      schema: { tags: ['Integrations'], summary: 'Update integration job' },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        jobType?: string;
        scheduleCron?: string;
        triggerEvent?: string;
        mappingConfig?: Record<string, unknown>;
        isActive?: boolean;
      };

      const updates: Partial<typeof integrationJobs.$inferInsert> = {};
      if (body.jobType != null) updates.jobType = body.jobType;
      if (body.scheduleCron != null) updates.scheduleCron = body.scheduleCron;
      if (body.triggerEvent != null) updates.triggerEvent = body.triggerEvent;
      if (body.mappingConfig != null) updates.mappingConfig = body.mappingConfig;
      if (body.isActive != null) updates.isActive = body.isActive;

      const [row] = await db
        .update(integrationJobs)
        .set(updates)
        .where(eq(integrationJobs.id, id))
        .returning();

      if (!row || row.tenantId !== request.user!.tenantId) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return row;
    },
  );

  app.patch(
    '/admin/integrations/jobs/:id',
    {
      ...guard,
      schema: { tags: ['Integrations'], summary: 'Partial update integration job' },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        isActive?: boolean;
        scheduleCron?: string;
      };

      const updates: Partial<typeof integrationJobs.$inferInsert> = {};
      if (body.isActive != null) updates.isActive = body.isActive;
      if (body.scheduleCron != null) updates.scheduleCron = body.scheduleCron;

      const [row] = await db
        .update(integrationJobs)
        .set(updates)
        .where(eq(integrationJobs.id, id))
        .returning();

      if (!row || row.tenantId !== request.user!.tenantId) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return row;
    },
  );

  app.delete(
    '/admin/integrations/jobs/:id',
    {
      ...guard,
      schema: { tags: ['Integrations'], summary: 'Delete integration job' },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const [job] = await db
        .select()
        .from(integrationJobs)
        .where(eq(integrationJobs.id, id))
        .limit(1);
      if (!job || job.tenantId !== request.user!.tenantId) {
        return reply.code(404).send({ error: 'Not found' });
      }
      await db.delete(integrationJobs).where(eq(integrationJobs.id, id));
      return reply.code(204).send();
    },
  );

  // ─── Global Run Log ───────────────────────────────────────────────────────────

  app.get(
    '/admin/integrations/run-log',
    {
      ...guard,
      schema: { tags: ['Integrations'], summary: 'Global integration run log' },
    },
    async (request) => {
      const query = request.query as { limit?: string; page?: string };
      const limit = Math.min(200, Math.max(1, Number(query.limit ?? 100)));
      const page = Math.max(1, Number(query.page ?? 1));
      const offset = (page - 1) * limit;

      const tid = request.user!.tenantId;

      const rows = await db
        .select({
          id: integrationRunLog.id,
          jobId: integrationRunLog.jobId,
          jobType: integrationJobs.jobType,
          connectionName: integrationConnections.name,
          status: integrationRunLog.status,
          recordsProcessed: integrationRunLog.recordsProcessed,
          recordsFailed: integrationRunLog.recordsFailed,
          errorDetails: integrationRunLog.errorDetails,
          startedAt: integrationRunLog.startedAt,
          finishedAt: integrationRunLog.finishedAt,
        })
        .from(integrationRunLog)
        .innerJoin(integrationJobs, eq(integrationRunLog.jobId, integrationJobs.id))
        .innerJoin(integrationConnections, eq(integrationJobs.connectionId, integrationConnections.id))
        .where(eq(integrationJobs.tenantId, tid))
        .orderBy(desc(integrationRunLog.startedAt))
        .limit(limit)
        .offset(offset);

      // Compute duration in ms and map to frontend-expected shape
      const data = rows.map((r) => ({
        id: r.id,
        jobId: r.jobId,
        jobType: r.jobType,
        connectionName: r.connectionName,
        status: r.status,
        rowsProcessed: r.recordsProcessed,
        errorMessage: r.errorDetails && (r.errorDetails as unknown[]).length > 0
          ? JSON.stringify(r.errorDetails)
          : null,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        durationMs: r.finishedAt
          ? new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()
          : null,
      }));

      return { data, total: data.length, page, limit };
    },
  );

  // ─── Webhook Subscriptions CRUD ───────────────────────────────────────────────

  app.get(
    '/admin/integrations/webhooks',
    {
      ...guard,
      schema: { tags: ['Integrations'], summary: 'List webhook subscriptions' },
    },
    async (request) => {
      return db
        .select()
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.tenantId, request.user!.tenantId))
        .orderBy(desc(webhookSubscriptions.createdAt));
    },
  );

  app.post(
    '/admin/integrations/webhooks',
    {
      ...guard,
      schema: { tags: ['Integrations'], summary: 'Create webhook subscription' },
    },
    async (request, reply) => {
      const body = request.body as {
        url: string;
        secret: string;
        events: string[];
        isActive?: boolean;
      };

      const [row] = await db
        .insert(webhookSubscriptions)
        .values({
          tenantId: request.user!.tenantId,
          url: body.url,
          secret: body.secret,
          events: body.events,
          isActive: body.isActive ?? true,
        })
        .returning();

      return reply.code(201).send(row);
    },
  );

  app.put(
    '/admin/integrations/webhooks/:id',
    {
      ...guard,
      schema: { tags: ['Integrations'], summary: 'Update webhook subscription' },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        url?: string;
        secret?: string;
        events?: string[];
        isActive?: boolean;
      };

      const updates: Partial<typeof webhookSubscriptions.$inferInsert> = {};
      if (body.url != null) updates.url = body.url;
      if (body.secret != null) updates.secret = body.secret;
      if (body.events != null) updates.events = body.events;
      if (body.isActive != null) updates.isActive = body.isActive;

      const [row] = await db
        .update(webhookSubscriptions)
        .set(updates)
        .where(eq(webhookSubscriptions.id, id))
        .returning();

      if (!row || row.tenantId !== request.user!.tenantId) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return row;
    },
  );

  app.delete(
    '/admin/integrations/webhooks/:id',
    {
      ...guard,
      schema: { tags: ['Integrations'], summary: 'Delete webhook subscription' },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const [wh] = await db
        .select()
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.id, id))
        .limit(1);
      if (!wh || wh.tenantId !== request.user!.tenantId) {
        return reply.code(404).send({ error: 'Not found' });
      }
      await db.delete(webhookSubscriptions).where(eq(webhookSubscriptions.id, id));
      return reply.code(204).send();
    },
  );

  app.post(
    '/admin/integrations/webhooks/:id/test',
    {
      ...guard,
      schema: { tags: ['Integrations'], summary: 'Test webhook delivery' },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const [wh] = await db
        .select()
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.id, id))
        .limit(1);
      if (!wh || wh.tenantId !== request.user!.tenantId) {
        return reply.code(404).send({ error: 'Not found' });
      }

      const testPayload = {
        event: 'webhook.test',
        timestamp: new Date().toISOString(),
        data: { message: 'EAM webhook test delivery' },
      };
      const body = JSON.stringify(testPayload);
      const { createHmac } = await import('node:crypto');
      const signature = createHmac('sha256', wh.secret ?? 'eam-default').update(body).digest('hex');

      let httpStatus: number | undefined;
      let error: string | undefined;
      let ok = false;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const resp = await fetch(wh.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-EAM-Signature': signature,
            'X-EAM-Event': 'webhook.test',
          },
          body,
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));
        httpStatus = resp.status;
        ok = resp.ok;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }

      // ── Log this test delivery ────────────────────────────────────────────
      await db.insert(webhookDeliveryLog).values({
        subscriptionId: wh.id,
        eventType: 'webhook.test',
        payload: testPayload as Record<string, unknown>,
        attempt: 1,
        status: ok ? 'DELIVERED' : 'FAILED',
        httpStatus,
        error,
      });

      if (!ok) {
        return reply.code(502).send({
          error: error ?? 'Webhook delivery failed',
          httpStatus,
        });
      }
      return { ok: true, status: httpStatus, url: wh.url };
    },
  );

  // ─── Webhook Delivery Log ─────────────────────────────────────────────────────
  app.get(
    '/admin/integrations/webhooks/:id/delivery-log',
    {
      ...guard,
      schema: { tags: ['Integrations'], summary: 'Delivery log for a webhook subscription' },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const q = request.query as { limit?: string };
      const limit = Math.min(200, Number(q.limit ?? 50));

      const [wh] = await db
        .select()
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.id, id))
        .limit(1);
      if (!wh || wh.tenantId !== request.user!.tenantId) {
        return reply.code(404).send({ error: 'Not found' });
      }

      return db
        .select()
        .from(webhookDeliveryLog)
        .where(eq(webhookDeliveryLog.subscriptionId, id))
        .orderBy(desc(webhookDeliveryLog.deliveredAt))
        .limit(limit);
    },
  );

  // ─── Retry a failed webhook delivery ─────────────────────────────────────────
  app.post(
    '/admin/integrations/webhooks/delivery-log/:logId/retry',
    {
      ...guard,
      schema: { tags: ['Integrations'], summary: 'Retry a failed webhook delivery' },
    },
    async (request, reply) => {
      const { logId } = request.params as { logId: string };

      const [log] = await db
        .select()
        .from(webhookDeliveryLog)
        .where(eq(webhookDeliveryLog.id, logId))
        .limit(1);
      if (!log) return reply.code(404).send({ error: 'Log entry not found' });

      const [wh] = await db
        .select()
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.id, log.subscriptionId))
        .limit(1);
      if (!wh || wh.tenantId !== request.user!.tenantId) {
        return reply.code(404).send({ error: 'Subscription not found' });
      }

      const body = JSON.stringify({
        event: log.eventType,
        data: log.payload,
        timestamp: new Date().toISOString(),
        retried: true,
      });
      const signature = (await import('node:crypto'))
        .createHmac('sha256', wh.secret).update(body).digest('hex');

      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 10000);
      let ok = false;
      let httpStatus: number | undefined;
      let error: string | undefined;

      try {
        const res = await fetch(wh.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-EAM-Signature': signature,
            'X-EAM-Event': log.eventType,
          },
          body,
          signal: ctrl.signal,
        });
        ok = res.ok;
        httpStatus = res.status;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      } finally {
        clearTimeout(timeout);
      }

      const [newLog] = await db
        .insert(webhookDeliveryLog)
        .values({
          subscriptionId: wh.id,
          eventType: log.eventType,
          payload: log.payload ?? {},
          attempt: log.attempt + 1,
          status: ok ? 'DELIVERED' : 'FAILED',
          httpStatus,
          error,
        })
        .returning();

      return { ok, httpStatus, error, logId: newLog!.id };
    },
  );

  // ─── API Key Management ────────────────────────────────────────────────────────

  app.get('/admin/integrations/api-keys', { ...guard }, async (request) => {
    const rows = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        scopes: apiKeys.scopes,
        isActive: apiKeys.isActive,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.tenantId, request.user!.tenantId))
      .orderBy(desc(apiKeys.createdAt));
    return rows;
  });

  app.post('/admin/integrations/api-keys', { ...guard }, async (request, reply) => {
    const body = request.body as {
      name: string;
      scopes?: string[];
      expiresAt?: string;
    };
    if (!body.name?.trim()) return reply.code(400).send({ error: 'Name is required' });

    // Generate a secure random key
    const { randomBytes, createHash } = await import('node:crypto');
    const rawKey = `eam_${randomBytes(32).toString('base64url')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 10); // "eam_" + 6 chars

    const [row] = await db.insert(apiKeys).values({
      tenantId: request.user!.tenantId,
      createdBy: request.user!.id,
      name: body.name.trim(),
      keyHash,
      keyPrefix,
      scopes: body.scopes ?? [],
      isActive: true,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    }).returning();

    // Return the raw key ONCE — never stored again
    return reply.code(201).send({
      id: row!.id,
      name: row!.name,
      keyPrefix: row!.keyPrefix,
      scopes: row!.scopes,
      rawKey, // show only on creation
      createdAt: row!.createdAt,
    });
  });

  app.patch('/admin/integrations/api-keys/:id', { ...guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { isActive?: boolean; name?: string; scopes?: string[] };

    const updates: Partial<typeof apiKeys.$inferInsert> = {};
    if (body.isActive != null) updates.isActive = body.isActive;
    if (body.name != null) updates.name = body.name;
    if (body.scopes != null) updates.scopes = body.scopes;

    const [row] = await db.update(apiKeys).set(updates)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.tenantId, request.user!.tenantId)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'API key not found' });
    return row;
  });

  app.delete('/admin/integrations/api-keys/:id', { ...guard }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await db.select().from(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.tenantId, request.user!.tenantId))).limit(1);
    if (!row) return reply.code(404).send({ error: 'API key not found' });
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
    return reply.code(204).send();
  });
}

