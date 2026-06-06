import { Worker, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { db, attachments, documentTypes, smtpConfigurations } from '@eam/db';
import { eq, and } from 'drizzle-orm';
import { scanBuffer, deleteObject } from '@eam/attachment-service';
import { createHash } from 'node:crypto';
import { renderTemplate, wireEventBusPublisher } from '@eam/notification-service';
import { globalEventBus } from '@eam/shared';
import { registerWorkflowHandlers } from './workflow.js';
import { registerIntegrationJobHandlers } from './integration-jobs.js';
import { registerReportHandlers, startReportScheduleCron } from './reports.js';
import { registerNotificationHandlers } from './notifications.js';
import { startSlaMonitorCron, runSlaCheck } from './sla-monitor.js';
import { startPmSchedulerCron } from './pm-scheduler.js';

const connection = new Redis(
  process.env.REDIS_URL ?? 'redis://localhost:6379',
  {
    maxRetriesPerRequest: null,
  },
);

export const virusScanQueue = new Queue('virus-scan', { connection });
export const sendEmailQueue = new Queue('send-email', { connection });
export const ldapSyncQueue = new Queue('ldap-sync', { connection });

new Worker(
  'virus-scan',
  async (job) => {
    const { attachmentId, bufferBase64 } = job.data as {
      attachmentId: string;
      bufferBase64: string;
    };

    const buffer = Buffer.from(bufferBase64, 'base64');

    // FIX 6: compute SHA-256 before scanning
    const checksumSha256 = createHash('sha256')
      .update(buffer)
      .digest('hex');

    const result = await scanBuffer(buffer);

    const scanStatus =
      result.status === 'INFECTED'
        ? 'INFECTED'
        : result.status === 'FAILED'
          ? 'FAILED'
          : 'CLEAN';

    // FIX 5: load virusScanAction from documentType
    const [att] = await db
      .select({
        documentTypeId: attachments.documentTypeId,
        storageKey: attachments.storageKey,
      })
      .from(attachments)
      .where(eq(attachments.id, attachmentId))
      .limit(1);

    const [docType] = att
      ? await db
          .select({
            virusScanAction: documentTypes.virusScanAction,
          })
          .from(documentTypes)
          .where(eq(documentTypes.id, att.documentTypeId))
          .limit(1)
      : [undefined];

    const action = docType?.virusScanAction ?? 'QUARANTINE';

    if (result.status === 'INFECTED') {
      if (action === 'REJECT' && att?.storageKey) {
        try {
          await deleteObject(att.storageKey);
        } catch (e) {
          console.error('[virus-scan] delete failed:', e);
        }
      }

      await globalEventBus.emit('ATTACHMENT_VIRUS_FOUND', {
        attachmentId,
        action,
      });
    }

    // FIX 5 + FIX 6
    await db
      .update(attachments)
      .set({
        scanStatus,
        scanResult: result as unknown as Record<string, unknown>,
        scanEngineVersion: result.engine ?? 'clamav',
        checksumSha256,
      })
      .where(eq(attachments.id, attachmentId));
  },
  { connection },
);

new Worker(
  'send-email',
  async (job) => {
    const { subject, html, to, tenantId } = job.data as {
      subject: string;
      html: string;
      to: string;
      tenantId?: string;
    };

    const nodemailer = await import('nodemailer');

    // FIX 8: use tenant SMTP if available
    if (tenantId) {
      const [cfg] = await db
        .select()
        .from(smtpConfigurations)
        .where(
          and(
            eq(smtpConfigurations.tenantId, tenantId),
            eq(smtpConfigurations.isActive, true),
          ),
        )
        .limit(1);

      if (cfg) {
        const transport = nodemailer.createTransport({
          host: cfg.host,
          port: cfg.port,
          secure: cfg.secure,
          auth: cfg.username
            ? {
                user: cfg.username,
                pass: cfg.password ?? '',
              }
            : undefined,
        });

        await transport.sendMail({
          from: cfg.fromName
            ? `"${cfg.fromName}" <${cfg.fromEmail}>`
            : cfg.fromEmail,
          to,
          subject: renderTemplate(subject, {}),
          html: renderTemplate(html, {}),
        });

        return;
      }
    }

    // Fallback SMTP
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'localhost',
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: process.env.SMTP_SECURE === 'true',
    });

    await transport.sendMail({
      from: process.env.SMTP_FROM ?? 'eam@localhost',
      to,
      subject: renderTemplate(subject, {}),
      html: renderTemplate(html, {}),
    });
  },
  { connection },
);

new Worker(
  'ldap-sync',
  async (job) => {
    const { providerId } = job.data as { providerId?: string };

    const { LdapSyncService } = await import('@eam/auth');
    const sync = new LdapSyncService(db);

    if (providerId) {
      await sync.syncProvider(providerId);
    } else {
      await sync.syncAllActive();
    }
  },
  { connection },
);

await ldapSyncQueue.add(
  'cron-ldap-sync',
  {},
  {
    repeat: {
      pattern: '0 */6 * * *',
    },
    jobId: 'ldap-sync-cron',
  },
);

wireEventBusPublisher(globalEventBus, connection);

const { dispatcher } = registerNotificationHandlers(
  connection,
  sendEmailQueue,
);

dispatcher.attach(globalEventBus);

registerWorkflowHandlers(connection, sendEmailQueue);
registerIntegrationJobHandlers(connection);
registerReportHandlers(connection, sendEmailQueue);

await startReportScheduleCron(connection);

startSlaMonitorCron(connection);
startPmSchedulerCron(connection);

// SLA worker — processes the queue triggered by cron
const { Worker: BullWorker } = await import('bullmq');

new BullWorker(
  'sla-monitor',
  async () => {
    await runSlaCheck();
  },
  { connection },
);

console.log('EAM worker started');