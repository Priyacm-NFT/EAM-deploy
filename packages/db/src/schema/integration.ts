import { pgTable, uuid, text, timestamp, boolean, jsonb, integer, pgEnum } from 'drizzle-orm/pg-core';
import { tenants, users } from './identity.js';

export const adapterTypeEnum = pgEnum('adapter_type', [
  'REST',
  'SOAP',
  'KAFKA',
  'RABBITMQ',
  'SFTP',
  'JDBC',
  'WEBHOOK_OUTBOUND',
]);

export const integrationConnections = pgTable('integration_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  adapterType: adapterTypeEnum('adapter_type').notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const integrationJobs = pgTable('integration_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id')
    .notNull()
    .references(() => integrationConnections.id, { onDelete: 'cascade' }),
  jobType: text('job_type').notNull(),
  scheduleCron: text('schedule_cron'),
  triggerEvent: text('trigger_event'),
  mappingConfig: jsonb('mapping_config').$type<Record<string, unknown>>().default({}),
  isActive: boolean('is_active').notNull().default(true),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
});

export const integrationRunLog = pgTable('integration_run_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id')
    .notNull()
    .references(() => integrationJobs.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  recordsProcessed: integer('records_processed').default(0),
  recordsFailed: integer('records_failed').default(0),
  errorDetails: jsonb('error_details').$type<unknown[]>().default([]),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const webhookSubscriptions = pgTable('webhook_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  secret: text('secret').notNull(),
  events: text('events').array().notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const webhookDeliveryLog = pgTable('webhook_delivery_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  subscriptionId: uuid('subscription_id')
    .notNull()
    .references(() => webhookSubscriptions.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>(),
  attempt: integer('attempt').notNull().default(1),
  status: text('status').notNull(), // DELIVERED | FAILED | RETRYING
  httpStatus: integer('http_status'),
  error: text('error'),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── API Keys — per-consumer tokens for the API gateway ───────────────────────
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by')
    .references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),              // human label e.g. "SAP connector"
  keyHash: text('key_hash').notNull(),       // SHA-256 hash — never store raw
  keyPrefix: text('key_prefix').notNull(),   // first 8 chars shown in UI e.g. "eam_k1ab"
  scopes: text('scopes').array().notNull().default([]),  // e.g. ["read:assets","write:work_orders"]
  isActive: boolean('is_active').notNull().default(true),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
