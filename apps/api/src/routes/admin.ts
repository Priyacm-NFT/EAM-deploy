import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db, entityDefinitions, fieldDefinitions, fieldRules } from '@eam/db';
import { requirePermission } from '../plugins/auth.js';
import { SchemaExtensionService } from '@eam/config-engine';
import { adminIdentityRoutes } from './admin-identity.js';
import { adminIdentityProviderRoutes } from './admin-identity-providers.js';

export async function adminRoutes(app: FastifyInstance) {
  await app.register(adminIdentityRoutes);
  await app.register(adminIdentityProviderRoutes);

  const configGuard = { preHandler: requirePermission('admin:config:manage') };

  app.get('/admin/config/entities', configGuard, async (request) => {
    return db
      .select()
      .from(entityDefinitions)
      .where(eq(entityDefinitions.tenantId, request.user!.tenantId));
  });

  app.post('/admin/config/entities/:entityId/fields', configGuard, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const body = request.body as {
      fieldKey: string;
      label: string;
      fieldType: string;
      isRequiredGlobal?: boolean;
      pgType?: 'TEXT';
    };
    const [entity] = await db
      .select()
      .from(entityDefinitions)
      .where(eq(entityDefinitions.id, entityId))
      .limit(1);
    if (!entity) return reply.status(404).send({ error: 'Entity not found' });

    const [field] = await db
      .insert(fieldDefinitions)
      .values({
        tenantId: request.user!.tenantId,
        entityId,
        fieldKey: body.fieldKey,
        label: body.label,
        fieldType: body.fieldType as 'TEXT',
        isRequiredGlobal: body.isRequiredGlobal ?? false,
      })
      .returning();

    const ext = new SchemaExtensionService(db);
    await ext.addColumn({
      tableName: entity.tableName,
      columnName: body.fieldKey,
      pgType: body.pgType ?? 'TEXT',
      tenantId: request.user!.tenantId,
      adminUserId: request.user!.id,
    });

    return reply.status(201).send(field);
  });

  app.get('/admin/config/entities/:entityId/rules', configGuard, async (request) => {
    const { entityId } = request.params as { entityId: string };
    return db
      .select()
      .from(fieldRules)
      .where(
        and(eq(fieldRules.entityId, entityId), eq(fieldRules.tenantId, request.user!.tenantId)),
      );
  });

  app.post('/admin/config/entities/:entityId/rules', configGuard, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const body = request.body as {
      fieldKey: string;
      ruleType: 'REQUIRED' | 'READONLY' | 'HIDDEN' | 'VISIBLE';
      conditionExpression?: string;
      roleId?: string;
      statusCondition?: string;
    };
    const [rule] = await db
      .insert(fieldRules)
      .values({
        tenantId: request.user!.tenantId,
        entityId,
        fieldKey: body.fieldKey,
        ruleType: body.ruleType,
        conditionExpression: body.conditionExpression,
        roleId: body.roleId,
        statusCondition: body.statusCondition,
      })
      .returning();
    return reply.status(201).send(rule);
  });

  app.get('/admin/integrations/connections', { preHandler: requirePermission('admin:integrations:manage') }, async (request) => {
    const { integrationConnections } = await import('@eam/db');
    return db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.tenantId, request.user!.tenantId));
  });
}
