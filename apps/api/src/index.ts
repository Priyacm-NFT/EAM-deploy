import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { initJwtKeys } from '@eam/auth';
import { authRoutes } from './routes/auth.js';
import { mfaRoutes } from './routes/mfa.js';
import { ssoRoutes } from './routes/sso.js';
import { healthRoutes } from './routes/health.js';
import { adminRoutes } from './routes/admin.js';
import { attachmentRoutes } from './routes/attachments.js';
import { reportRoutes } from './routes/reports.js';
import { notificationRoutes } from './routes/notifications.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { chatRoutes } from './routes/chat.js';
import { setupSocketIO } from './socket.js';

const PORT = Number(process.env.PORT ?? 3000);

export async function buildApp() {
  await initJwtKeys();

  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

  await app.register(helmet);
  await app.register(cors, {
    origin: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(','),
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    hook: 'onRequest',
    allowList: (req) => !req.url.startsWith('/auth'),
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
  await app.register(authRoutes);
  await app.register(mfaRoutes);
  await app.register(ssoRoutes);
  await app.register(adminRoutes);
  await app.register(attachmentRoutes);
  await app.register(reportRoutes);
  await app.register(notificationRoutes);
  await app.register(dashboardRoutes);
  await app.register(chatRoutes);

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
