import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import {
  db,
  integrationConnections,
  integrationJobs,
  integrationRunLog,
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
}
