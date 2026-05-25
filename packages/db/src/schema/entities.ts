import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import { tenants } from './identity.js';

export const locations = pgTable(
  'locations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('locations_tenant_idx').on(t.tenantId)],
);

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    assetNum: text('asset_num').notNull(),
    description: text('description').notNull(),
    locationId: uuid('location_id').references(() => locations.id),
    status: text('status').notNull().default('ACTIVE'),
    customData: jsonb('custom_data').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('assets_tenant_idx').on(t.tenantId)],
);

export const serviceRequests = pgTable(
  'service_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    srNum: text('sr_num').notNull(),
    description: text('description').notNull(),
    status: text('status').notNull().default('NEW'),
    priority: text('priority').notNull().default('MEDIUM'),
    requesterId: uuid('requester_id'),
    assetId: uuid('asset_id').references(() => assets.id),
    locationId: uuid('location_id').references(() => locations.id),
    customData: jsonb('custom_data').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('service_requests_tenant_idx').on(t.tenantId)],
);

export const workOrders = pgTable(
  'work_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    woNum: text('wo_num').notNull(),
    description: text('description').notNull(),
    status: text('status').notNull().default('WAPPR'),
    assignedToUserId: uuid('assigned_to_user_id'),
    assetId: uuid('asset_id').references(() => assets.id),
    siteNum: text('site_num'),
    totalCost: integer('total_cost').default(0),
    customData: jsonb('custom_data').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('work_orders_tenant_idx').on(t.tenantId)],
);

export const dashboardLayouts = pgTable('dashboard_layouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id'),
  roleId: uuid('role_id'),
  name: text('name').notNull().default('Default'),
  layout: jsonb('layout').$type<Record<string, unknown>>().notNull().default({}),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  fromUserId: uuid('from_user_id').notNull(),
  toUserId: uuid('to_user_id').notNull(),
  content: text('content').notNull(),
  contextEntityType: text('context_entity_type'),
  contextEntityId: uuid('context_entity_id'),
  attachmentId: uuid('attachment_id'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const userPresence = pgTable('user_presence', {
  userId: uuid('user_id').primaryKey(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('OFFLINE'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  socketId: text('socket_id'),
});
