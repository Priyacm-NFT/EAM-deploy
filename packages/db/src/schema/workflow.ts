import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { tenants } from './identity.js';

export const workflowDefinitions = pgTable('workflow_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  entityType: text('entity_type').notNull(),
  triggerEvent: text('trigger_event').notNull(),
  triggerCondition: jsonb('trigger_condition').$type<Record<string, unknown>>(),
  definition: jsonb('definition').$type<Record<string, unknown>>().notNull(),
  version: text('version').notNull().default('1'),
  isActive: text('is_active').notNull().default('true'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const workflowInstances = pgTable(
  'workflow_instances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowDefId: uuid('workflow_def_id')
      .notNull()
      .references(() => workflowDefinitions.id),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('RUNNING'),
    currentNodeId: text('current_node_id'),
    context: jsonb('context').$type<Record<string, unknown>>().notNull().default({}),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    error: text('error'),
  },
  (t) => [index('workflow_instances_entity_idx').on(t.entityType, t.entityId)],
);

export const workflowTasks = pgTable('workflow_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  instanceId: uuid('instance_id')
    .notNull()
    .references(() => workflowInstances.id, { onDelete: 'cascade' }),
  nodeId: text('node_id').notNull(),
  nodeType: text('node_type').notNull(),
  assignedToUserId: uuid('assigned_to_user_id'),
  assignedToRole: text('assigned_to_role'),
  assignedToGroup: text('assigned_to_group'),
  status: text('status').notNull().default('PENDING'),
  dueAt: timestamp('due_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  completedBy: uuid('completed_by'),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const workflowHistory = pgTable('workflow_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  instanceId: uuid('instance_id')
    .notNull()
    .references(() => workflowInstances.id, { onDelete: 'cascade' }),
  nodeId: text('node_id'),
  action: text('action').notNull(),
  actorId: uuid('actor_id'),
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  comment: text('comment'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
