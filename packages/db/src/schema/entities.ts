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

// --- Org structure ---

export const organisations = pgTable(
  'organisations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    code: text('code').notNull(),
    description: text('description'),
    address: text('address'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('organisations_tenant_idx').on(t.tenantId)],
);

export const sites = pgTable(
  'sites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id').references(() => organisations.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    siteNum: text('site_num').notNull(),
    description: text('description'),
    address: text('address'),
    timezone: text('timezone').default('UTC'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('sites_tenant_idx').on(t.tenantId)],
);

// --- Status model ---

export const statusSets = pgTable('status_sets', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  label: text('label').notNull(),
  entityType: text('entity_type').notNull(),
  description: text('description'),
  isSystem: boolean('is_system').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const statusTransitions = pgTable('status_transitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  statusSetId: uuid('status_set_id')
    .notNull()
    .references(() => statusSets.id, { onDelete: 'cascade' }),
  fromStatus: text('from_status').notNull(),
  toStatus: text('to_status').notNull(),
  label: text('label'),
  requiresComment: boolean('requires_comment').notNull().default(false),
  requiredRole: text('required_role'),
  notifyRoles: text('notify_roles').array().default([]),
  conditionExpression: text('condition_expression'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
