import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  pgEnum,
  index,
  integer,
} from 'drizzle-orm/pg-core';
import { tenants } from './identity.js';

export const fieldTypeEnum = pgEnum('field_type', [
  'TEXT',
  'NUMBER',
  'DATE',
  'DATETIME',
  'BOOLEAN',
  'PICKLIST',
  'MULTI_SELECT',
  'LOOKUP',
  'FORMULA',
  'ATTACHMENT',
  'URL',
  'EMAIL',
  'PHONE',
]);

export const fieldRuleTypeEnum = pgEnum('field_rule_type', [
  'REQUIRED',
  'READONLY',
  'HIDDEN',
  'VISIBLE',
]);

export const entityDefinitions = pgTable(
  'entity_definitions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    label: text('label').notNull(),
    tableName: text('table_name').notNull(),
    isSystem: boolean('is_system').notNull().default(false),
    icon: text('icon'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('entity_definitions_tenant_idx').on(t.tenantId)],
);

export const fieldDefinitions = pgTable('field_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  entityId: uuid('entity_id')
    .notNull()
    .references(() => entityDefinitions.id, { onDelete: 'cascade' }),
  fieldKey: text('field_key').notNull(),
  label: text('label').notNull(),
  fieldType: fieldTypeEnum('field_type').notNull(),
  isSystem: boolean('is_system').notNull().default(false),
  isRequiredGlobal: boolean('is_required_global').notNull().default(false),
  isSearchable: boolean('is_searchable').notNull().default(false),
  defaultValue: text('default_value'),
  placeholder: text('placeholder'),
  helpText: text('help_text'),
  validationRules: jsonb('validation_rules').$type<Record<string, unknown>>().default({}),
  lookupEntity: text('lookup_entity'),
  lookupDisplayField: text('lookup_display_field'),
  formulaExpression: text('formula_expression'),
  displayOrder: integer('display_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const picklistDefinitions = pgTable('picklist_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  label: text('label').notNull(),
  isSystem: boolean('is_system').notNull().default(false),
});

export const picklistValues = pgTable('picklist_values', {
  id: uuid('id').primaryKey().defaultRandom(),
  picklistId: uuid('picklist_id')
    .notNull()
    .references(() => picklistDefinitions.id, { onDelete: 'cascade' }),
  value: text('value').notNull(),
  label: text('label').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  parentValue: text('parent_value'),
  isActive: boolean('is_active').notNull().default(true),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }),
  effectiveTo: timestamp('effective_to', { withTimezone: true }),
});

export const formLayouts = pgTable('form_layouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  entityId: uuid('entity_id')
    .notNull()
    .references(() => entityDefinitions.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id'),
  name: text('name').notNull(),
  definition: jsonb('definition').$type<Record<string, unknown>>().notNull().default({}),
  version: integer('version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tableViews = pgTable('table_views', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  entityId: uuid('entity_id')
    .notNull()
    .references(() => entityDefinitions.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id'),
  name: text('name').notNull(),
  columnConfig: jsonb('column_config').$type<unknown[]>().notNull().default([]),
  defaultSort: text('default_sort'),
  defaultFilter: jsonb('default_filter').$type<Record<string, unknown>>().default({}),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const fieldRules = pgTable('field_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  entityId: uuid('entity_id')
    .notNull()
    .references(() => entityDefinitions.id, { onDelete: 'cascade' }),
  fieldKey: text('field_key').notNull(),
  ruleType: fieldRuleTypeEnum('rule_type').notNull(),
  conditionExpression: text('condition_expression'),
  roleId: uuid('role_id'),
  statusCondition: text('status_condition'),
  displayOrder: integer('display_order').notNull().default(0),
});

export const configVersions = pgTable('config_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  versionNum: integer('version_num').notNull(),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const schemaMigrations = pgTable('schema_migrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  tableName: text('table_name').notNull(),
  columnName: text('column_name').notNull(),
  operation: text('operation').notNull(),
  sqlExecuted: text('sql_executed').notNull(),
  status: text('status').notNull(),
  executedBy: uuid('executed_by'),
  executedAt: timestamp('executed_at', { withTimezone: true }).defaultNow().notNull(),
  error: text('error'),
});
