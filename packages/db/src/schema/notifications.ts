import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { tenants, users } from './identity.js';

export const notificationTemplates = pgTable('notification_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  subjectTemplate: text('subject_template').notNull(),
  htmlTemplate: text('html_template').notNull(),
  textTemplate: text('text_template'),
  mergeFields: jsonb('merge_fields').$type<Record<string, unknown>>().default({}),
  isSystem: boolean('is_system').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
});

export const notificationTriggers = pgTable('notification_triggers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  entityType: text('entity_type'),
  conditionExpression: text('condition_expression'),
  templateId: uuid('template_id').references(() => notificationTemplates.id),
  distributionConfig: jsonb('distribution_config').$type<Record<string, unknown>>().notNull(),
  digestConfig: jsonb('digest_config').$type<Record<string, unknown>>(),
  rateLimitConfig: jsonb('rate_limit_config').$type<Record<string, unknown>>(),
  isMandatory: boolean('is_mandatory').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
});

export const inAppNotifications = pgTable('in_app_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  isRead: boolean('is_read').notNull().default(false),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

export const notificationDeliveryLog = pgTable('notification_delivery_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  triggerId: uuid('trigger_id'),
  entityId: uuid('entity_id'),
  recipientEmail: text('recipient_email'),
  recipientUserId: uuid('recipient_user_id'),
  channel: text('channel').notNull(),
  status: text('status').notNull(),
  error: text('error'),
  bounceType: text('bounce_type'),      // 'hard' | 'soft' | null
  bounceCode: text('bounce_code'),      // SMTP bounce code e.g. "550"
  bounceMessage: text('bounce_message'), // human-readable bounce reason
  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Email bounce suppression list ─────────────────────────────────────────────
export const emailBounceList = pgTable('email_bounce_list', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  bounceType: text('bounce_type').notNull(), // 'hard' | 'soft'
  bounceCode: text('bounce_code'),
  bounceMessage: text('bounce_message'),
  suppressUntil: timestamp('suppress_until', { withTimezone: true }), // null = permanent for hard
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const smtpConfigurations = pgTable('smtp_configurations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  host: text('host').notNull(),
  port: integer('port').notNull(),
  secure: boolean('secure').notNull().default(false),
  username: text('username'),
  password: text('password'),
  fromEmail: text('from_email').notNull(),
  fromName: text('from_name'),
  isActive: boolean('is_active').notNull().default(true),
});

export const notificationDigestQueue = pgTable('notification_digest_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  triggerId: uuid('trigger_id')
    .notNull()
    .references(() => notificationTriggers.id, { onDelete: 'cascade' }),
  recipientUserId: uuid('recipient_user_id').references(() => users.id),
  recipientEmail: text('recipient_email').notNull(),
  subject: text('subject').notNull(),
  html: text('html').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  flushAfter: timestamp('flush_after', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userNotificationPrefs = pgTable(
  'user_notification_prefs',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    triggerId: uuid('trigger_id')
      .notNull()
      .references(() => notificationTriggers.id, { onDelete: 'cascade' }),
    emailEnabled: boolean('email_enabled').notNull().default(true),
    inAppEnabled: boolean('in_app_enabled').notNull().default(true),
    digestEnabled: boolean('digest_enabled').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.userId, t.triggerId] })],
);
