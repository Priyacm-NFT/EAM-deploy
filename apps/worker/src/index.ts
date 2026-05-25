import { Worker, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { eq } from 'drizzle-orm';
import { db, attachments } from '@eam/db';
import { scanBuffer } from '@eam/attachment-service';
import { renderTemplate } from '@eam/notification-service';
import { globalEventBus } from '@eam/shared';
import { registerWorkflowHandlers } from './workflow.js';
import { registerIntegrationJobHandlers } from './integration-jobs.js';

const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

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
    const result = await scanBuffer(buffer);
    await db
      .update(attachments)
      .set({
        scanStatus: result.status === 'INFECTED' ? 'INFECTED' : 'CLEAN',
        scanResult: result as unknown as Record<string, unknown>,
      })
      .where(eq(attachments.id, attachmentId));
    if (result.status === 'INFECTED') {
      await globalEventBus.emit('ATTACHMENT_VIRUS_FOUND', { attachmentId });
    }
  },
  { connection },
);

new Worker(
  'send-email',
  async (job) => {
    const { subject, html, to } = job.data as { subject: string; html: string; to: string };
    const nodemailer = await import('nodemailer');
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
  { repeat: { pattern: '0 */6 * * *' }, jobId: 'ldap-sync-cron' },
);

registerWorkflowHandlers(connection, sendEmailQueue);
registerIntegrationJobHandlers(connection);

console.log('EAM worker started');
