import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, entityDefinitions, integrationConnections } from '@eam/db';
import { requirePermission } from '../plugins/auth.js';
import { adminIdentityRoutes } from './admin-identity.js';
import { adminIdentityProviderRoutes } from './admin-identity-providers.js';
import { adminConfigRoutes } from './admin-config.js';

export async function adminRoutes(app: FastifyInstance) {
  await app.register(adminIdentityRoutes);
  await app.register(adminIdentityProviderRoutes);
  await app.register(adminConfigRoutes);

  const configGuard = { preHandler: requirePermission('admin:config:manage') };

  app.get('/admin/config/entities', configGuard, async (request) => {
    return db
      .select()
      .from(entityDefinitions)
      .where(eq(entityDefinitions.tenantId, request.user!.tenantId));
  });

  app.get('/admin/integrations/connections', { preHandler: requirePermission('admin:integrations:manage') }, async (request) => {
    return db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.tenantId, request.user!.tenantId));
  });
}
