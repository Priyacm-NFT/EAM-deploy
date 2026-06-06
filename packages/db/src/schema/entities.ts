import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  numeric,
  index,
  uniqueIndex,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants, users } from './identity.js';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const locationTypeEnum = pgEnum('location_type', [
  'FUNCTIONAL',
  'OPERATING',
  'REPAIR',
  'SALVAGE',
]);

export const assetStatusEnum = pgEnum('asset_status', [
  'ACTIVE',
  'INACTIVE',
  'DECOMMISSIONED',
  'DISPOSED',
  'IN_REPAIR',
  'STANDBY',
]);

export const criticalityEnum = pgEnum('criticality', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export const srStatusEnum = pgEnum('sr_status', [
  'NEW',
  'QUEUED',
  'IN_PROGRESS',
  'CLOSED',
  'RESOLVED',
  'CONVERTED',
  'CANCELLED',
]);

export const srPriorityEnum = pgEnum('sr_priority', ['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

export const srChannelEnum = pgEnum('sr_channel', ['WEB', 'MOBILE', 'EMAIL', 'API', 'WALK_IN']);

export const woStatusEnum = pgEnum('wo_status', [
  'WAPPR',
  'APPR',
  'INPRG',
  'COMP',
  'CLOSE',
  'HOLD',
  'CAN',
]);

export const woTypeEnum = pgEnum('wo_type', [
  'CM',
  'PM',
  'EMERGENCY',
  'PROJECT',
  'STANDING',
  'INSPECTION',
  'CALIBRATION',
]);

export const woPriorityEnum = pgEnum('wo_priority', ['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']);

// ─── Organisation & Site ──────────────────────────────────────────────────────

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
    glAccount: text('gl_account'),
    costCenter: text('cost_center'),
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
    glAccount: text('gl_account'),
    costCenter: text('cost_center'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('sites_tenant_idx').on(t.tenantId)],
);

// ─── Locations ────────────────────────────────────────────────────────────────

export const locations = pgTable(
  'locations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id').references(() => sites.id, { onDelete: 'set null' }),
    orgId: uuid('org_id').references(() => organisations.id, { onDelete: 'set null' }),
    parentId: uuid('parent_id'),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    type: locationTypeEnum('type').default('FUNCTIONAL'),
    glAccount: text('gl_account'),
    costCenter: text('cost_center'),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('locations_tenant_idx').on(t.tenantId),
    index('locations_site_idx').on(t.siteId),
    index('locations_parent_idx').on(t.parentId),
  ],
);

// ─── Asset Classifications ────────────────────────────────────────────────────

export const assetClassifications = pgTable(
  'asset_classifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    classCode: text('class_code').notNull(),
    description: text('description').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('asset_class_tenant_idx').on(t.tenantId)],
);

export const assetClassAttributes = pgTable('asset_class_attributes', {
  id: uuid('id').primaryKey().defaultRandom(),
  classId: uuid('class_id')
    .notNull()
    .references(() => assetClassifications.id, { onDelete: 'cascade' }),
  attrName: text('attr_name').notNull(),
  attrType: text('attr_type').notNull().default('text'),
  isRequired: boolean('is_required').notNull().default(false),
  defaultValue: text('default_value'),
});

// ─── Assets ───────────────────────────────────────────────────────────────────

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
    siteId: uuid('site_id').references(() => sites.id),
    orgId: uuid('org_id').references(() => organisations.id),
    parentAssetId: uuid('parent_asset_id'),
    classId: uuid('class_id').references(() => assetClassifications.id),
    status: assetStatusEnum('status').notNull().default('ACTIVE'),
    criticality: criticalityEnum('criticality').default('MEDIUM'),
    manufacturer: text('manufacturer'),
    model: text('model'),
    serialNum: text('serial_num'),
    installDate: timestamp('install_date', { withTimezone: true }),
    warrantyExpiry: timestamp('warranty_expiry', { withTimezone: true }),
    glAccount: text('gl_account'),
    costCenter: text('cost_center'),
    purchaseCost: numeric('purchase_cost', { precision: 14, scale: 2 }),
    replacementCost: numeric('replacement_cost', { precision: 14, scale: 2 }),
    classAttributes: jsonb('class_attributes').$type<Record<string, unknown>>().default({}),
    customData: jsonb('custom_data').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('assets_tenant_idx').on(t.tenantId),
    index('assets_location_idx').on(t.locationId),
    index('assets_site_idx').on(t.siteId),
    index('assets_status_idx').on(t.tenantId, t.status),
  ],
);

// ─── Asset Meters ─────────────────────────────────────────────────────────────

export const meterTypeEnum = pgEnum('meter_type', ['GAUGE', 'CONTINUOUS', 'CHARACTERISTIC']);

export const assetMeters = pgTable(
  'asset_meters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    unit: text('unit').notNull(),
    meterType: meterTypeEnum('meter_type').notNull().default('CONTINUOUS'),
    lastReading: numeric('last_reading', { precision: 18, scale: 4 }),
    lastReadingDate: timestamp('last_reading_date', { withTimezone: true }),
    rolloverValue: numeric('rollover_value', { precision: 18, scale: 4 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('asset_meters_asset_idx').on(t.assetId)],
);

export const assetMeterReadings = pgTable(
  'asset_meter_readings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meterId: uuid('meter_id')
      .notNull()
      .references(() => assetMeters.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    value: numeric('value', { precision: 18, scale: 4 }).notNull(),
    delta: numeric('delta', { precision: 18, scale: 4 }),
    readingDate: timestamp('reading_date', { withTimezone: true }).defaultNow().notNull(),
    source: text('source').default('MANUAL'),
    loggedByUserId: uuid('logged_by_user_id').references(() => users.id),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('meter_readings_meter_idx').on(t.meterId)],
);

// ─── Asset Move History ───────────────────────────────────────────────────────

export const assetMoveHistory = pgTable(
  'asset_move_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    fromLocationId: uuid('from_location_id').references(() => locations.id),
    toLocationId: uuid('to_location_id').references(() => locations.id),
    movedAt: timestamp('moved_at', { withTimezone: true }).defaultNow().notNull(),
    movedByUserId: uuid('moved_by_user_id').references(() => users.id),
    reason: text('reason'),
  },
  (t) => [index('asset_move_asset_idx').on(t.assetId)],
);

// ─── Failure Codes ────────────────────────────────────────────────────────────

export const failureCodeTypeEnum = pgEnum('failure_code_type', ['PROBLEM', 'CAUSE', 'REMEDY']);

export const failureCodes = pgTable(
  'failure_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    type: failureCodeTypeEnum('type').notNull(),
    code: text('code').notNull(),
    description: text('description').notNull(),
    parentId: uuid('parent_id'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('failure_codes_tenant_type_idx').on(t.tenantId, t.type)],
);

// ─── Service Requests ─────────────────────────────────────────────────────────

export const serviceRequests = pgTable(
  'service_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    srNum: text('sr_num').notNull(),
    description: text('description').notNull(),
    status: srStatusEnum('status').notNull().default('NEW'),
    priority: srPriorityEnum('priority').notNull().default('MEDIUM'),
    channel: srChannelEnum('channel').default('WEB'),
    category: text('category'),
    requesterId: uuid('requester_id').references(() => users.id),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id),
    assetId: uuid('asset_id').references(() => assets.id),
    locationId: uuid('location_id').references(() => locations.id),
    siteId: uuid('site_id').references(() => sites.id),
    orgId: uuid('org_id').references(() => organisations.id),
    slaTargetHours: integer('sla_target_hours'),
    slaDueAt: timestamp('sla_due_at', { withTimezone: true }),
    slaBreached: boolean('sla_breached').notNull().default(false),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    convertedToWoId: uuid('converted_to_wo_id'),
    closureNotes: text('closure_notes'),
    customData: jsonb('custom_data').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('service_requests_tenant_idx').on(t.tenantId),
    index('service_requests_status_idx').on(t.tenantId, t.status),
    index('service_requests_sla_idx').on(t.tenantId, t.slaBreached, t.slaDueAt),
  ],
);

// ─── Job Plans ────────────────────────────────────────────────────────────────

export const jobPlanStatusEnum = pgEnum('job_plan_status', ['DRAFT', 'ACTIVE', 'INACTIVE']);

export const jobPlans = pgTable(
  'job_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    jpNum: text('jp_num').notNull(),
    description: text('description').notNull(),
    longDescription: text('long_description'),
    status: jobPlanStatusEnum('status').notNull().default('DRAFT'),
    version: integer('version').notNull().default(1),
    estimatedDurationHours: numeric('estimated_duration_hours', { precision: 8, scale: 2 }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('job_plans_tenant_idx').on(t.tenantId),
    uniqueIndex('job_plans_num_idx').on(t.tenantId, t.jpNum),
  ],
);

export const jobPlanTasks = pgTable('job_plan_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  jpId: uuid('jp_id')
    .notNull()
    .references(() => jobPlans.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  description: text('description').notNull(),
  taskType: text('task_type').default('GENERAL'),
  estimatedHours: numeric('estimated_hours', { precision: 8, scale: 2 }),
  instructions: text('instructions'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const jobPlanLabour = pgTable('job_plan_labour', {
  id: uuid('id').primaryKey().defaultRandom(),
  jpId: uuid('jp_id')
    .notNull()
    .references(() => jobPlans.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id').references(() => jobPlanTasks.id),
  craft: text('craft').notNull(),
  quantity: integer('quantity').notNull().default(1),
  hours: numeric('hours', { precision: 8, scale: 2 }).notNull(),
  rate: numeric('rate', { precision: 10, scale: 2 }),
});

export const jobPlanMaterials = pgTable('job_plan_materials', {
  id: uuid('id').primaryKey().defaultRandom(),
  jpId: uuid('jp_id')
    .notNull()
    .references(() => jobPlans.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id').references(() => jobPlanTasks.id),
  itemNum: text('item_num'),
  description: text('description').notNull(),
  quantity: numeric('quantity', { precision: 10, scale: 4 }).notNull(),
  unitCost: numeric('unit_cost', { precision: 10, scale: 2 }),
});

export const jobPlanTools = pgTable('job_plan_tools', {
  id: uuid('id').primaryKey().defaultRandom(),
  jpId: uuid('jp_id')
    .notNull()
    .references(() => jobPlans.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id').references(() => jobPlanTasks.id),
  toolDescription: text('tool_description').notNull(),
  quantity: integer('quantity').notNull().default(1),
});

export const jobPlanSafety = pgTable('job_plan_safety', {
  id: uuid('id').primaryKey().defaultRandom(),
  jpId: uuid('jp_id')
    .notNull()
    .references(() => jobPlans.id, { onDelete: 'cascade' }),
  hazard: text('hazard').notNull(),
  control: text('control').notNull(),
  ppe: text('ppe'),
  sequence: integer('sequence').default(0),
});

// ─── Work Orders ──────────────────────────────────────────────────────────────

export const workOrders = pgTable(
  'work_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    woNum: text('wo_num').notNull(),
    description: text('description').notNull(),
    longDescription: text('long_description'),
    type: woTypeEnum('type').notNull().default('CM'),
    status: woStatusEnum('status').notNull().default('WAPPR'),
    priority: woPriorityEnum('priority').notNull().default('MEDIUM'),
    assignedToUserId: uuid('assigned_to_user_id').references(() => users.id),
    assetId: uuid('asset_id').references(() => assets.id),
    locationId: uuid('location_id').references(() => locations.id),
    siteId: uuid('site_id').references(() => sites.id),
    orgId: uuid('org_id').references(() => organisations.id),
    srId: uuid('sr_id').references(() => serviceRequests.id),
    pmId: uuid('pm_id'),
    jobPlanId: uuid('job_plan_id').references(() => jobPlans.id),
    permitId: uuid('permit_id'),
    targetStartDate: timestamp('target_start_date', { withTimezone: true }),
    targetFinishDate: timestamp('target_finish_date', { withTimezone: true }),
    actualStartDate: timestamp('actual_start_date', { withTimezone: true }),
    actualFinishDate: timestamp('actual_finish_date', { withTimezone: true }),
    failureProblemId: uuid('failure_problem_id').references(() => failureCodes.id),
    failureCauseId: uuid('failure_cause_id').references(() => failureCodes.id),
    failureRemedyId: uuid('failure_remedy_id').references(() => failureCodes.id),
    downtimeHours: numeric('downtime_hours', { precision: 8, scale: 2 }),
    closureNotes: text('closure_notes'),
    laborCost: numeric('labor_cost', { precision: 14, scale: 2 }).default('0'),
    materialCost: numeric('material_cost', { precision: 14, scale: 2 }).default('0'),
    serviceCost: numeric('service_cost', { precision: 14, scale: 2 }).default('0'),
    toolCost: numeric('tool_cost', { precision: 14, scale: 2 }).default('0'),
    totalCost: numeric('total_cost', { precision: 14, scale: 2 }).default('0'),
    customData: jsonb('custom_data').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('work_orders_tenant_idx').on(t.tenantId),
    index('work_orders_status_idx').on(t.tenantId, t.status),
    index('work_orders_asset_idx').on(t.assetId),
    index('work_orders_sr_idx').on(t.srId),
  ],
);

// ─── Work Order Children ──────────────────────────────────────────────────────

export const woTaskStatusEnum = pgEnum('wo_task_status', [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'SKIPPED',
]);

export const woTasks = pgTable(
  'wo_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    woId: uuid('wo_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    description: text('description').notNull(),
    taskType: text('task_type').default('GENERAL'),
    status: woTaskStatusEnum('status').notNull().default('PENDING'),
    assignedUserId: uuid('assigned_user_id').references(() => users.id),
    estimatedHours: numeric('estimated_hours', { precision: 8, scale: 2 }),
    actualHours: numeric('actual_hours', { precision: 8, scale: 2 }),
    instructions: text('instructions'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('wo_tasks_wo_idx').on(t.woId)],
);

export const woLabour = pgTable(
  'wo_labour',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    woId: uuid('wo_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => woTasks.id),
    userId: uuid('user_id').references(() => users.id),
    craft: text('craft').notNull(),
    workDate: timestamp('work_date', { withTimezone: true }).notNull(),
    regularHours: numeric('regular_hours', { precision: 8, scale: 2 }).notNull().default('0'),
    overtimeHours: numeric('overtime_hours', { precision: 8, scale: 2 }).notNull().default('0'),
    regularRate: numeric('regular_rate', { precision: 10, scale: 2 }),
    overtimeRate: numeric('overtime_rate', { precision: 10, scale: 2 }),
    totalCost: numeric('total_cost', { precision: 14, scale: 2 }),
    approved: boolean('approved').notNull().default(false),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('wo_labour_wo_idx').on(t.woId)],
);

export const woMaterials = pgTable(
  'wo_materials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    woId: uuid('wo_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id').references(() => woTasks.id),
    itemId: uuid('item_id'),
    itemNum: text('item_num'),
    description: text('description').notNull(),
    storeroomId: uuid('storeroom_id'),
    qtyPlanned: numeric('qty_planned', { precision: 10, scale: 4 }).default('0'),
    qtyActual: numeric('qty_actual', { precision: 10, scale: 4 }).default('0'),
    unitCost: numeric('unit_cost', { precision: 10, scale: 2 }),
    totalCost: numeric('total_cost', { precision: 14, scale: 2 }),
    reservationId: uuid('reservation_id'),
    isIssued: boolean('is_issued').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('wo_materials_wo_idx').on(t.woId)],
);

export const woTools = pgTable(
  'wo_tools',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    woId: uuid('wo_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    qtyPlanned: integer('qty_planned').default(1),
    qtyActual: integer('qty_actual').default(0),
    chargeRate: numeric('charge_rate', { precision: 10, scale: 2 }),
    totalCost: numeric('total_cost', { precision: 14, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('wo_tools_wo_idx').on(t.woId)],
);

export const woServices = pgTable(
  'wo_services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    woId: uuid('wo_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    vendor: text('vendor'),
    contractNum: text('contract_num'),
    cost: numeric('cost', { precision: 14, scale: 2 }),
    invoiceRef: text('invoice_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('wo_services_wo_idx').on(t.woId)],
);

export const woSafety = pgTable(
  'wo_safety',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    woId: uuid('wo_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    hazard: text('hazard').notNull(),
    control: text('control').notNull(),
    ppe: text('ppe'),
    completed: boolean('completed').notNull().default(false),
    completedByUserId: uuid('completed_by_user_id').references(() => users.id),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    sequence: integer('sequence').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('wo_safety_wo_idx').on(t.woId)],
);

// ─── Preventive Maintenance ───────────────────────────────────────────────────

export const pmFrequencyTypeEnum = pgEnum('pm_frequency_type', [
  'CALENDAR',
  'METER',
  'CALENDAR_AND_METER',
  'SEASONAL',
]);

export const pmIntervalUnitEnum = pgEnum('pm_interval_unit', [
  'HOUR',
  'DAY',
  'WEEK',
  'MONTH',
  'YEAR',
]);

export const pmStatusEnum = pgEnum('pm_status', ['ACTIVE', 'INACTIVE', 'DRAFT']);

export const pmMasters = pgTable(
  'pm_masters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    pmNum: text('pm_num').notNull(),
    description: text('description').notNull(),
    status: pmStatusEnum('status').notNull().default('ACTIVE'),
    assetId: uuid('asset_id').references(() => assets.id),
    locationId: uuid('location_id').references(() => locations.id),
    siteId: uuid('site_id').references(() => sites.id),
    jobPlanId: uuid('job_plan_id').references(() => jobPlans.id),
    frequencyType: pmFrequencyTypeEnum('frequency_type').notNull().default('CALENDAR'),
    interval: integer('interval'),
    intervalUnit: pmIntervalUnitEnum('interval_unit'),
    seasonalMonth: integer('seasonal_month'),
    seasonalDay: integer('seasonal_day'),
    leadDays: integer('lead_days').notNull().default(7),
    nextDueDate: timestamp('next_due_date', { withTimezone: true }),
    lastWoId: uuid('last_wo_id'),
    lastGeneratedAt: timestamp('last_generated_at', { withTimezone: true }),
    priority: woPriorityEnum('priority').default('MEDIUM'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('pm_masters_tenant_idx').on(t.tenantId),
    index('pm_masters_next_due_idx').on(t.tenantId, t.nextDueDate),
  ],
);

export const pmMeterTriggers = pgTable('pm_meter_triggers', {
  id: uuid('id').primaryKey().defaultRandom(),
  pmId: uuid('pm_id')
    .notNull()
    .references(() => pmMasters.id, { onDelete: 'cascade' }),
  meterId: uuid('meter_id')
    .notNull()
    .references(() => assetMeters.id, { onDelete: 'cascade' }),
  threshold: numeric('threshold', { precision: 18, scale: 4 }).notNull(),
  resetOnWo: boolean('reset_on_wo').notNull().default(true),
});

export const pmForecastStatusEnum = pgEnum('pm_forecast_status', [
  'PROJECTED',
  'GENERATED',
  'COMPLETED',
  'SKIPPED',
]);

export const pmForecasts = pgTable(
  'pm_forecasts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pmId: uuid('pm_id')
      .notNull()
      .references(() => pmMasters.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    forecastDate: timestamp('forecast_date', { withTimezone: true }).notNull(),
    status: pmForecastStatusEnum('status').notNull().default('PROJECTED'),
    woId: uuid('wo_id').references(() => workOrders.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('pm_forecasts_pm_idx').on(t.pmId),
    index('pm_forecasts_date_idx').on(t.tenantId, t.forecastDate),
  ],
);

// ─── Permits to Work ──────────────────────────────────────────────────────────

export const permitTypeEnum = pgEnum('permit_type', [
  'HOT_WORK',
  'CONFINED_SPACE',
  'HEIGHT',
  'ELECTRICAL',
  'EXCAVATION',
  'CHEMICAL',
  'GENERAL',
]);

export const permitStatusEnum = pgEnum('permit_status', [
  'DRAFT',
  'PENDING_APPROVAL',
  'ACTIVE',
  'SUSPENDED',
  'EXPIRED',
  'CLOSED',
  'REJECTED',
]);

export const permits = pgTable(
  'permits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    permitNum: text('permit_num').notNull(),
    type: permitTypeEnum('type').notNull(),
    woId: uuid('wo_id').references(() => workOrders.id),
    assetId: uuid('asset_id').references(() => assets.id),
    locationId: uuid('location_id').references(() => locations.id),
    description: text('description').notNull(),
    status: permitStatusEnum('status').notNull().default('DRAFT'),
    issuedByUserId: uuid('issued_by_user_id').references(() => users.id),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validTo: timestamp('valid_to', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('permits_tenant_idx').on(t.tenantId),
    index('permits_wo_idx').on(t.woId),
    index('permits_status_idx').on(t.tenantId, t.status),
  ],
);

export const permitChecklistCategoryEnum = pgEnum('permit_checklist_category', [
  'JSA',
  'PPE',
  'ISOLATION',
  'GAS_TEST',
  'LOTO',
  'GENERAL',
]);

export const permitChecklistItems = pgTable(
  'permit_checklist_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    permitId: uuid('permit_id')
      .notNull()
      .references(() => permits.id, { onDelete: 'cascade' }),
    category: permitChecklistCategoryEnum('category').notNull().default('GENERAL'),
    description: text('description').notNull(),
    sequence: integer('sequence').default(0),
    checked: boolean('checked').notNull().default(false),
    checkedByUserId: uuid('checked_by_user_id').references(() => users.id),
    checkedAt: timestamp('checked_at', { withTimezone: true }),
    isRequired: boolean('is_required').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('permit_checklist_permit_idx').on(t.permitId)],
);

export const permitApprovalStatusEnum = pgEnum('permit_approval_status', [
  'PENDING',
  'APPROVED',
  'REJECTED',
]);

export const permitApprovals = pgTable(
  'permit_approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    permitId: uuid('permit_id')
      .notNull()
      .references(() => permits.id, { onDelete: 'cascade' }),
    step: integer('step').notNull(),
    role: text('role').notNull(),
    assignedUserId: uuid('assigned_user_id').references(() => users.id),
    status: permitApprovalStatusEnum('status').notNull().default('PENDING'),
    comments: text('comments'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('permit_approvals_permit_idx').on(t.permitId)],
);

// ─── Inventory & Storerooms ───────────────────────────────────────────────────

export const itemTypeEnum = pgEnum('item_type', ['STOCKED', 'NON_STOCKED', 'SPECIAL_ORDER']);

export const costMethodEnum = pgEnum('cost_method', ['AVERAGE', 'FIFO', 'STANDARD']);

export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    itemNum: text('item_num').notNull(),
    description: text('description').notNull(),
    longDescription: text('long_description'),
    commodityCode: text('commodity_code'),
    unitOfIssue: text('unit_of_issue').notNull().default('EA'),
    manufacturer: text('manufacturer'),
    partNum: text('part_num'),
    itemType: itemTypeEnum('item_type').notNull().default('STOCKED'),
    glAccount: text('gl_account'),
    isHazardous: boolean('is_hazardous').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    customData: jsonb('custom_data').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('items_tenant_idx').on(t.tenantId),
    uniqueIndex('items_num_idx').on(t.tenantId, t.itemNum),
  ],
);

export const storerooms = pgTable(
  'storerooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id').references(() => sites.id),
    storeroomNum: text('storeroom_num').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    custodianUserId: uuid('custodian_user_id').references(() => users.id),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('storerooms_tenant_idx').on(t.tenantId)],
);

export const inventoryBalances = pgTable(
  'inventory_balances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    storeroomId: uuid('storeroom_id')
      .notNull()
      .references(() => storerooms.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    qtyOnHand: numeric('qty_on_hand', { precision: 14, scale: 4 }).notNull().default('0'),
    qtyReserved: numeric('qty_reserved', { precision: 14, scale: 4 }).notNull().default('0'),
    qtyOnOrder: numeric('qty_on_order', { precision: 14, scale: 4 }).notNull().default('0'),
    minQty: numeric('min_qty', { precision: 14, scale: 4 }).default('0'),
    maxQty: numeric('max_qty', { precision: 14, scale: 4 }),
    safetyStock: numeric('safety_stock', { precision: 14, scale: 4 }).default('0'),
    binLocation: text('bin_location'),
    avgCost: numeric('avg_cost', { precision: 10, scale: 4 }).default('0'),
    costMethod: costMethodEnum('cost_method').default('AVERAGE'),
    lastCountDate: timestamp('last_count_date', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('inv_balances_item_idx').on(t.itemId, t.storeroomId),
    uniqueIndex('inv_balances_unique_idx').on(t.itemId, t.storeroomId),
  ],
);

export const inventoryTxTypeEnum = pgEnum('inventory_tx_type', [
  'ISSUE',
  'RETURN',
  'TRANSFER',
  'RECEIPT',
  'ADJUSTMENT',
  'CYCLE_COUNT',
  'PHYSICAL_INVENTORY',
]);

export const inventoryTransactions = pgTable(
  'inventory_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id),
    storeroomId: uuid('storeroom_id')
      .notNull()
      .references(() => storerooms.id),
    txType: inventoryTxTypeEnum('tx_type').notNull(),
    qty: numeric('qty', { precision: 14, scale: 4 }).notNull(),
    unitCost: numeric('unit_cost', { precision: 10, scale: 4 }),
    totalCost: numeric('total_cost', { precision: 14, scale: 2 }),
    woId: uuid('wo_id').references(() => workOrders.id),
    toStoreroomId: uuid('to_storeroom_id').references(() => storerooms.id),
    userId: uuid('user_id').references(() => users.id),
    txDate: timestamp('tx_date', { withTimezone: true }).defaultNow().notNull(),
    referenceNum: text('reference_num'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('inv_tx_tenant_idx').on(t.tenantId),
    index('inv_tx_item_idx').on(t.itemId),
    index('inv_tx_wo_idx').on(t.woId),
  ],
);

export const materialReservations = pgTable(
  'material_reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    woId: uuid('wo_id')
      .notNull()
      .references(() => workOrders.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id),
    storeroomId: uuid('storeroom_id')
      .notNull()
      .references(() => storerooms.id),
    qtyReserved: numeric('qty_reserved', { precision: 14, scale: 4 }).notNull(),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('material_res_wo_idx').on(t.woId)],
);

// ─── Labour & Crew Management ─────────────────────────────────────────────────

export const labourCrafts = pgTable(
  'labour_crafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    craftCode: text('craft_code').notNull(),
    description: text('description').notNull(),
    defaultRate: numeric('default_rate', { precision: 10, scale: 2 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('labour_crafts_tenant_idx').on(t.tenantId),
    uniqueIndex('labour_crafts_code_idx').on(t.tenantId, t.craftCode),
  ],
);

export const labourRecords = pgTable(
  'labour_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    craftId: uuid('craft_id').references(() => labourCrafts.id),
    regularRate: numeric('regular_rate', { precision: 10, scale: 2 }),
    overtimeRate: numeric('overtime_rate', { precision: 10, scale: 2 }),
    certifications: jsonb('certifications').$type<string[]>().default([]),
    shiftCode: text('shift_code'),
    calendarCode: text('calendar_code'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('labour_records_tenant_idx').on(t.tenantId)],
);

export const crews = pgTable(
  'crews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    crewNum: text('crew_num').notNull(),
    name: text('name').notNull(),
    siteId: uuid('site_id').references(() => sites.id),
    leadUserId: uuid('lead_user_id').references(() => users.id),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('crews_tenant_idx').on(t.tenantId)],
);

export const crewMembers = pgTable(
  'crew_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    crewId: uuid('crew_id')
      .notNull()
      .references(() => crews.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').default('MEMBER'),
    isPrimary: boolean('is_primary').notNull().default(false),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('crew_members_crew_idx').on(t.crewId),
    uniqueIndex('crew_members_unique_idx').on(t.crewId, t.userId),
  ],
);

// ─── Dashboard & Chat (P0-7 retained) ─────────────────────────────────────────

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

// ─── Status Sets (P0-2 retained) ──────────────────────────────────────────────

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
