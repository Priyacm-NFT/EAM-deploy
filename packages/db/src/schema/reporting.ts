import { pgTable, uuid, text, timestamp, boolean, jsonb, integer } from 'drizzle-orm/pg-core';
import { tenants } from './identity.js';

export const reportSubjects = pgTable('report_subjects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  label: text('label').notNull(),
  baseQuery: text('base_query').notNull(),
  availableFields: jsonb('available_fields').$type<unknown[]>().notNull().default([]),
  joins: jsonb('joins').$type<unknown[]>().default([]),
  isSystem: boolean('is_system').notNull().default(true),
});

export const reportDefinitions = pgTable('report_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  subjectId: uuid('subject_id')
    .notNull()
    .references(() => reportSubjects.id),
  definition: jsonb('definition').$type<Record<string, unknown>>().notNull(),
  isPublic: boolean('is_public').notNull().default(false),
  createdBy: uuid('created_by'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const reportSchedules = pgTable('report_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  reportId: uuid('report_id')
    .notNull()
    .references(() => reportDefinitions.id, { onDelete: 'cascade' }),
  cronExpr: text('cron_expr').notNull(),
  outputFormat: text('output_format').notNull(),
  distribution: jsonb('distribution').$type<Record<string, unknown>>().notNull(),
  skipIfEmpty: boolean('skip_if_empty').notNull().default(false),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
});

export const reportRunLog = pgTable('report_run_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  reportId: uuid('report_id')
    .notNull()
    .references(() => reportDefinitions.id),
  scheduleId: uuid('schedule_id'),
  status: text('status').notNull(),
  rowCount: integer('row_count'),
  outputKey: text('output_key'),
  error: text('error'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});
