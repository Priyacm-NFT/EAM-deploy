import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, entityDefinitions } from '@eam/db';
import { requirePermission } from '../plugins/auth.js';
import { adminIdentityRoutes } from './admin-identity.js';
import { adminIdentityProviderRoutes } from './admin-identity-providers.js';
import { adminConfigRoutes } from './admin-config.js';
import { adminIntegrationRoutes } from './admin-integrations.js';
import { adminReportingRoutes } from './admin-reporting.js';
import { adminNotificationRoutes } from './admin-notifications.js';

export async function adminRoutes(app: FastifyInstance) {
  await app.register(adminIdentityRoutes);
  await app.register(adminIdentityProviderRoutes);
  await app.register(adminConfigRoutes);
  await app.register(adminIntegrationRoutes);
  await app.register(adminReportingRoutes);
  await app.register(adminNotificationRoutes);

  const configGuard = { preHandler: requirePermission('admin:config:manage') };

  app.get('/admin/config/entities', configGuard, async (request) => {
    return db
      .select()
      .from(entityDefinitions)
      .where(eq(entityDefinitions.tenantId, request.user!.tenantId));
  });

}
