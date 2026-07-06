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
import { accountRoutes } from './routes/account.js';
import { setupSocketIO } from './socket.js';
import { wireApiNotificationBridge, getNotificationRedis } from './lib/notification-bridge.js';
import { NotificationDispatcher, createSmtpTransport, smtpFromAddress } from '@eam/notification-service';
import { globalEventBus } from '@eam/shared';
import { smtpConfigurations } from '@eam/db';
import { and, eq } from 'drizzle-orm';
import { WorkflowEngine } from '@eam/workflow-engine';
import { startDeactivationScheduler } from './lib/deactivation-scheduler.js';

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

  // Attach notification dispatcher to event bus so triggers fire on events
  // enqueueEmail: look up the active SMTP config for the tenant and send via nodemailer
  const enqueueEmail = async (job: {
    tenantId: string;
    to: string;
    cc?: string[];
    bcc?: string[];
    subject: string;
    html: string;
  }) => {
    try {
      const [smtp] = await db
        .select()
        .from(smtpConfigurations)
        .where(
          and(
            eq(smtpConfigurations.tenantId, job.tenantId),
            eq(smtpConfigurations.isActive, true),
          ),
        )
        .limit(1);

      if (!smtp) {
        console.warn(`[notification] No active SMTP for tenant ${job.tenantId} — email not sent`);
        throw new Error('No active SMTP configuration found');
      }

      const transport = await createSmtpTransport(smtp);

      await transport.sendMail({
        from: smtpFromAddress(smtp),
        to: job.to,
        cc: job.cc?.join(', '),
        bcc: job.bcc?.join(', '),
        subject: job.subject,
        html: job.html,
      });

      console.info(`[notification] Email sent to ${job.to} — subject: "${job.subject}"`);
    } catch (err) {
      console.error('[notification] Failed to send email:', err instanceof Error ? err.message : err);
      throw err;
    }
  };

  const dispatcher = new NotificationDispatcher(db, enqueueEmail, {
    redis: getNotificationRedis(),
  });
  dispatcher.attach(globalEventBus);

  // ── SLA escalation cron — runs every 5 minutes ───────────────────────────
  const wfEngine = new WorkflowEngine(db);
  const SLA_CHECK_INTERVAL_MS = 5 * 60 * 1000;
  setInterval(async () => {
    try {
      const escalated = await wfEngine.escalateOverdueTasks();
      if (escalated > 0) console.info(`[sla-cron] Escalated ${escalated} overdue task(s)`);
    } catch (err) {
      console.error('[sla-cron] Error during SLA escalation:', err instanceof Error ? err.message : err);
    }
  }, SLA_CHECK_INTERVAL_MS);

  // ── LDAP/AD sync cron — runs every 30 minutes ────────────────────────────
  const LDAP_SYNC_INTERVAL_MS = 30 * 60 * 1000;
  setInterval(async () => {
    try {
      const { LdapSyncService } = await import('@eam/auth');
      const ldapSync = new LdapSyncService(db);
      await ldapSync.syncAllActive();
    } catch (err) {
      console.error('[ldap-cron] Error during LDAP sync:', err instanceof Error ? err.message : err);
    }
  }, LDAP_SYNC_INTERVAL_MS);

  // ── Integration job cron — checks for due scheduled jobs every minute ────
  const JOB_CRON_INTERVAL_MS = 60 * 1000;
  setInterval(async () => {
    try {
      const { processDueIntegrationJobs } = await import('@eam/integration-framework');
      const count = await processDueIntegrationJobs(db);
      if (count > 0) console.info(`[job-cron] Ran ${count} due integration job(s)`);
    } catch (err) {
      console.error('[job-cron] Error:', err instanceof Error ? err.message : err);
    }
  }, JOB_CRON_INTERVAL_MS);
  startDeactivationScheduler();

  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

  await app.register(helmet);
  await app.register(cors, {
    origin: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173').split(','),
  });

  await app.register(rateLimit, {
    max: 20,
    timeWindow: '1 minute',
    hook: 'onRequest',
    allowList: (req) => {
      const url = req.url;
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
  await app.register(accountRoutes);

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