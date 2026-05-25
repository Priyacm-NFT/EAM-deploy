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
import { requirePermission } from '../plugins/auth.js';
import { authenticate } from '../plugins/auth.js';

const adminGuard = { preHandler: requirePermission('admin:notifications:manage') };

export async function adminNotificationRoutes(app: FastifyInstance) {
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

  app.patch('/admin/notifications/triggers/:id', adminGuard, async (request) => {
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
      .where(
        and(
          eq(notificationTriggers.id, id),
          eq(notificationTriggers.tenantId, request.user!.tenantId),
        ),
      )
      .returning();
    return row;
  });

  app.get('/admin/notifications/delivery-log', adminGuard, async (request) => {
    const tenantId = request.user!.tenantId;
    const triggers = await db
      .select({ id: notificationTriggers.id })
      .from(notificationTriggers)
      .where(eq(notificationTriggers.tenantId, tenantId));
    const triggerIds = triggers.map((t) => t.id);
    if (triggerIds.length === 0) return [];
    return db
      .select()
      .from(notificationDeliveryLog)
      .orderBy(desc(notificationDeliveryLog.sentAt))
      .limit(200);
  });

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
      })
      .returning();
    return row;
  });

  app.post('/admin/notifications/smtp/test', adminGuard, async (request) => {
    const body = request.body as { to: string };
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'localhost',
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: process.env.SMTP_SECURE === 'true',
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM ?? 'eam@localhost',
      to: body.to,
      subject: 'EAM SMTP test',
      html: '<p>SMTP configuration test succeeded.</p>',
    });
    return { ok: true };
  });

  app.get('/users/me/notification-prefs', { preHandler: authenticate }, async (request) => {
    return db
      .select()
      .from(userNotificationPrefs)
      .where(eq(userNotificationPrefs.userId, request.user!.id));
  });

  app.put('/users/me/notification-prefs/:triggerId', { preHandler: authenticate }, async (request) => {
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
      throw { statusCode: 400, message: 'Mandatory notifications cannot be disabled' };
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
