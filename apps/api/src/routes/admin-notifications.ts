import type { FastifyInstance } from 'fastify';
import { and, desc, eq } from 'drizzle-orm';
import {
  db,
  notificationTemplates,
  notificationTriggers,
  notificationDeliveryLog,
  smtpConfigurations,
  userNotificationPrefs,
} from '@eam/db';
import { renderTemplate } from '@eam/notification-service';
import { requirePermission, authenticate } from '../plugins/auth.js';

const adminGuard = { preHandler: requirePermission('admin:notifications:manage') };

export async function adminNotificationRoutes(app: FastifyInstance) {

  // ─── Templates ───────────────────────────────────────────────────────────────

  app.get('/admin/notifications/templates', adminGuard, async (request) => {
    return db
      .select()
      .from(notificationTemplates)
      .where(eq(notificationTemplates.tenantId, request.user!.tenantId));
  });

  app.post('/admin/notifications/templates', adminGuard, async (request) => {
    const body = request.body as {
      name: string;
      subjectTemplate: string;
      htmlTemplate: string;
      textTemplate?: string;
    };
    const [row] = await db
      .insert(notificationTemplates)
      .values({
        tenantId: request.user!.tenantId,
        name: body.name,
        subjectTemplate: body.subjectTemplate,
        htmlTemplate: body.htmlTemplate,
        textTemplate: body.textTemplate,
      })
      .returning();
    return row;
  });

  app.put('/admin/notifications/templates/:id', adminGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{
      name: string;
      subjectTemplate: string;
      htmlTemplate: string;
      textTemplate: string;
      isActive: boolean;
    }>;
    const [row] = await db
      .update(notificationTemplates)
      .set(body)
      .where(and(eq(notificationTemplates.id, id), eq(notificationTemplates.tenantId, request.user!.tenantId)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'Template not found' });
    return row;
  });

  app.delete('/admin/notifications/templates/:id', adminGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db
      .delete(notificationTemplates)
      .where(and(eq(notificationTemplates.id, id), eq(notificationTemplates.tenantId, request.user!.tenantId)));
    return reply.code(204).send();
  });

  app.post('/admin/notifications/templates/preview', adminGuard, async (request) => {
    const body = request.body as {
      subjectTemplate: string;
      htmlTemplate: string;
      sampleData?: Record<string, unknown>;
    };
    const data = body.sampleData ?? {
      wo_num: 'WO-1001',
      assignee: { name: 'Alex Tech' },
      asset: { description: 'Pump A' },
    };
    return {
      subject: renderTemplate(body.subjectTemplate, data),
      html: renderTemplate(body.htmlTemplate, data),
    };
  });

  // ─── Triggers ────────────────────────────────────────────────────────────────

  app.get('/admin/notifications/triggers', adminGuard, async (request) => {
    return db
      .select()
      .from(notificationTriggers)
      .where(eq(notificationTriggers.tenantId, request.user!.tenantId));
  });

  app.post('/admin/notifications/triggers', adminGuard, async (request) => {
    const body = request.body as {
      eventType: string;
      entityType?: string;
      conditionExpression?: string;
      templateId?: string;
      distributionConfig: Record<string, unknown>;
      digestConfig?: Record<string, unknown>;
      rateLimitConfig?: Record<string, unknown>;
      isMandatory?: boolean;
    };
    const [row] = await db
      .insert(notificationTriggers)
      .values({
        tenantId: request.user!.tenantId,
        eventType: body.eventType,
        entityType: body.entityType,
        conditionExpression: body.conditionExpression,
        templateId: body.templateId,
        distributionConfig: body.distributionConfig,
        digestConfig: body.digestConfig,
        rateLimitConfig: body.rateLimitConfig,
        isMandatory: body.isMandatory ?? false,
      })
      .returning();
    return row;
  });

  app.patch('/admin/notifications/triggers/:id', adminGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{
      isActive: boolean;
      conditionExpression: string;
      digestConfig: Record<string, unknown>;
      rateLimitConfig: Record<string, unknown>;
    }>;
    const [row] = await db
      .update(notificationTriggers)
      .set(body)
      .where(and(eq(notificationTriggers.id, id), eq(notificationTriggers.tenantId, request.user!.tenantId)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'Trigger not found' });
    return row;
  });

  app.delete('/admin/notifications/triggers/:id', adminGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db
      .delete(notificationTriggers)
      .where(and(eq(notificationTriggers.id, id), eq(notificationTriggers.tenantId, request.user!.tenantId)));
    return reply.code(204).send();
  });

  // ─── Delivery log ─────────────────────────────────────────────────────────────

  app.get('/admin/notifications/delivery-log', adminGuard, async (_request) => {
    return db
      .select()
      .from(notificationDeliveryLog)
      .orderBy(desc(notificationDeliveryLog.sentAt))
      .limit(200);
  });

  // ─── SMTP Configuration ───────────────────────────────────────────────────────

  app.get('/admin/notifications/smtp', adminGuard, async (request) => {
    return db
      .select({
        id: smtpConfigurations.id,
        host: smtpConfigurations.host,
        port: smtpConfigurations.port,
        secure: smtpConfigurations.secure,
        username: smtpConfigurations.username,
        fromEmail: smtpConfigurations.fromEmail,
        fromName: smtpConfigurations.fromName,
        isActive: smtpConfigurations.isActive,
      })
      .from(smtpConfigurations)
      .where(eq(smtpConfigurations.tenantId, request.user!.tenantId));
  });

  app.post('/admin/notifications/smtp', adminGuard, async (request) => {
    const body = request.body as {
      host: string;
      port: number;
      secure?: boolean;
      username?: string;
      password?: string;
      fromEmail: string;
      fromName?: string;
      isActive?: boolean;
    };
    const [row] = await db
      .insert(smtpConfigurations)
      .values({
        tenantId: request.user!.tenantId,
        host: body.host,
        port: body.port,
        secure: body.secure ?? false,
        username: body.username,
        password: body.password,
        fromEmail: body.fromEmail,
        fromName: body.fromName,
        isActive: body.isActive ?? true,
      })
      .returning();
    return row;
  });

  app.put('/admin/notifications/smtp/:id', adminGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{
      host: string;
      port: number;
      secure: boolean;
      username: string;
      password: string;
      fromEmail: string;
      fromName: string;
      isActive: boolean;
    }>;
    const updateData: Record<string, unknown> = { ...body };
    if (!body.password) delete updateData.password; // don't overwrite with blank
    const [row] = await db
      .update(smtpConfigurations)
      .set(updateData as typeof smtpConfigurations.$inferInsert)
      .where(and(eq(smtpConfigurations.id, id), eq(smtpConfigurations.tenantId, request.user!.tenantId)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'SMTP config not found' });
    return row;
  });

  app.delete('/admin/notifications/smtp/:id', adminGuard, async (request, reply) => {
    const { id } = request.params as { id: string };
    await db
      .delete(smtpConfigurations)
      .where(and(eq(smtpConfigurations.id, id), eq(smtpConfigurations.tenantId, request.user!.tenantId)));
    return reply.code(204).send();
  });

  app.post('/admin/notifications/smtp/test', adminGuard, async (request, _reply) => {
    const body = request.body as { toEmail: string };
    const tid = request.user!.tenantId;

    // Try to find active SMTP config for tenant
    const [cfg] = await db
      .select()
      .from(smtpConfigurations)
      .where(and(eq(smtpConfigurations.tenantId, tid), eq(smtpConfigurations.isActive, true)))
      .limit(1);

    const nodemailer = await import('nodemailer');
    const transport = cfg
      ? nodemailer.createTransport({
          host: cfg.host,
          port: cfg.port,
          secure: cfg.secure,
          auth: cfg.username ? { user: cfg.username, pass: cfg.password ?? '' } : undefined,
        })
      : nodemailer.createTransport({
          host: process.env.SMTP_HOST ?? 'localhost',
          port: Number(process.env.SMTP_PORT ?? 1025),
          secure: false,
        });

    await transport.sendMail({
      from: cfg ? (cfg.fromName ? `"${cfg.fromName}" <${cfg.fromEmail}>` : cfg.fromEmail) : (process.env.SMTP_FROM ?? 'eam@localhost'),
      to: body.toEmail,
      subject: 'EAM Platform — SMTP test',
      html: '<p>Your SMTP configuration is working correctly.</p><p>This is a test email from EAM Platform.</p>',
    });

    // Update last tested status
    if (cfg) {
      await db
        .update(smtpConfigurations)
        .set({ isActive: cfg.isActive })
        .where(eq(smtpConfigurations.id, cfg.id));
    }

    return { ok: true, sentTo: body.toEmail };
  });

  // ─── User Notification Preferences ───────────────────────────────────────────

  app.get('/users/me/notification-prefs', { preHandler: authenticate }, async (request) => {
    return db
      .select()
      .from(userNotificationPrefs)
      .where(eq(userNotificationPrefs.userId, request.user!.id));
  });

  app.put('/users/me/notification-prefs/:triggerId', { preHandler: authenticate }, async (request, reply) => {
    const { triggerId } = request.params as { triggerId: string };
    const body = request.body as {
      emailEnabled?: boolean;
      inAppEnabled?: boolean;
      digestEnabled?: boolean;
    };

    const [trigger] = await db
      .select()
      .from(notificationTriggers)
      .where(eq(notificationTriggers.id, triggerId))
      .limit(1);

    if (trigger?.isMandatory && body.emailEnabled === false) {
      return reply.code(400).send({ error: 'Mandatory notifications cannot be disabled' });
    }

    const [existing] = await db
      .select()
      .from(userNotificationPrefs)
      .where(
        and(
          eq(userNotificationPrefs.userId, request.user!.id),
          eq(userNotificationPrefs.triggerId, triggerId),
        ),
      )
      .limit(1);

    if (existing) {
      const [row] = await db
        .update(userNotificationPrefs)
        .set(body)
        .where(
          and(
            eq(userNotificationPrefs.userId, request.user!.id),
            eq(userNotificationPrefs.triggerId, triggerId),
          ),
        )
        .returning();
      return row;
    }

    const [row] = await db
      .insert(userNotificationPrefs)
      .values({
        userId: request.user!.id,
        triggerId,
        emailEnabled: body.emailEnabled ?? true,
        inAppEnabled: body.inAppEnabled ?? true,
        digestEnabled: body.digestEnabled ?? false,
      })
      .returning();
    return row;
  });
}
