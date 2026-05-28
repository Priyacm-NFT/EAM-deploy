import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { initJwtKeys } from '@eam/auth';
import { seedDatabase, db } from '@eam/db';
import { createAuthPlugin } from './plugins/create-auth-plugin.js';
import { ensureDevAdminUser } from './lib/dev-seed.js';
import { ssoRoutes } from './routes/sso.js';
import { healthRoutes } from './routes/health.js';
import { adminRoutes } from './routes/admin.js';
import { attachmentRoutes } from './routes/attachments.js';
import { reportRoutes } from './routes/reports.js';
import { notificationRoutes } from './routes/notifications.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { chatRoutes } from './routes/chat.js';
import { presenceRoutes } from './routes/presence.js';
import { assetRoutes } from './routes/assets.js';
import { serviceRequestRoutes } from './routes/service-requests.js';
import { workOrderRoutes } from './routes/work-orders.js';
import { jobPlanRoutes } from './routes/job-plans.js';
import { pmRoutes } from './routes/pm.js';
import { permitRoutes } from './routes/permits.js';
import { inventoryRoutes } from './routes/inventory.js';
import { labourRoutes } from './routes/labour.js';
import { setupSocketIO } from './socket.js';
import { wireApiNotificationBridge } from './lib/notification-bridge.js';

export { setupSocketIO };

const PORT = Number(process.env.PORT ?? 3000);

export async function buildApp() {
  await initJwtKeys();
  if (process.env.NODE_ENV !== 'production' && process.env.AUTO_SEED !== 'false') {
    await seedDatabase(db);
    await ensureDevAdminUser();
  }
  // Skip Redis notification bridge in test environment to avoid connection hangs
  if (process.env.DISABLE_NOTIFICATION_BRIDGE !== 'true') {
    wireApiNotificationBridge();
  }

  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

  await app.register(helmet);
  await app.register(cors, {
    origin: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(','),
  });

  // Rate limit only sensitive auth mutation endpoints (login, register, password reset).
  // /auth/me and /auth/refresh are called on every page load and must NOT be rate limited.
  await app.register(rateLimit, {
    max: 20,
    timeWindow: '1 minute',
    hook: 'onRequest',
    allowList: (req) => {
      const url = req.url;
      // Only rate-limit these specific auth endpoints
      const limited = [
        '/auth/login',
        '/auth/register',
        '/auth/password/reset-request',
        '/auth/password/reset',
      ];
      return !limited.some((path) => url.startsWith(path));
    },
  });

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'EAM API', version: '0.0.0' },
      tags: [
        { name: 'Health', description: 'Service health checks' },
        { name: 'Integrations', description: 'Integration connections, jobs, export' },
        { name: 'Reports', description: 'Reporting and analytics' },
      ],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(healthRoutes);
  await app.register(createAuthPlugin);
  await app.register(ssoRoutes);
  await app.register(adminRoutes);
  await app.register(attachmentRoutes);
  await app.register(reportRoutes);
  await app.register(notificationRoutes);
  await app.register(dashboardRoutes);
  await app.register(chatRoutes);
  await app.register(presenceRoutes);
  await app.register(assetRoutes);
  await app.register(serviceRequestRoutes);
  await app.register(workOrderRoutes);
  await app.register(jobPlanRoutes);
  await app.register(pmRoutes);
  await app.register(permitRoutes);
  await app.register(inventoryRoutes);
  await app.register(labourRoutes);

  return app;
}

async function main() {
  const app = await buildApp();
  const server = app.server;
  setupSocketIO(server);

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`API listening on http://localhost:${PORT}`);
}

import { fileURLToPath } from 'node:url';

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

