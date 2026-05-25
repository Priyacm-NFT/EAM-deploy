import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, users, groups, roles, entityDefinitions, fieldDefinitions } from '@eam/db';
import { requirePermission } from '../plugins/auth.js';
import { SchemaExtensionService } from '@eam/config-engine';

export async function adminRoutes(app: FastifyInstance) {
  const guard = { preHandler: requirePermission('admin:users:manage') };

  app.get('/admin/users', guard, async (request) => {
    const list = await db.select().from(users).where(eq(users.tenantId, request.user!.tenantId));
    return list;
  });

  app.get('/admin/groups', guard, async (request) => {
    return db.select().from(groups).where(eq(groups.tenantId, request.user!.tenantId));
  });

  app.get('/admin/roles', guard, async (request) => {
    return db.select().from(roles).where(eq(roles.tenantId, request.user!.tenantId));
  });

  app.get('/admin/users/:id/effective-permissions', guard, async (request) => {
    const { id } = request.params as { id: string };
    const { getEffectivePermissions } = await import('@eam/auth');
    return getEffectivePermissions(db, id);
  });

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

  app.get('/admin/integrations/connections', { preHandler: requirePermission('admin:integrations:manage') }, async (request) => {
    const { integrationConnections } = await import('@eam/db');
    return db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.tenantId, request.user!.tenantId));
  });
}
