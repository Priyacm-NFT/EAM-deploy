import { eq, and } from 'drizzle-orm';
import type { Database } from './client.js';
import {
  tenants,
  permissions,
  roles,
  rolePermissions,
  groups,
  groupRoles,
  userGroups,
  users,
} from './schema/identity.js';
import { entityDefinitions } from './schema/config.js';
import { reportSubjects, reportDefinitions } from './schema/reporting.js';
import { documentTypes } from './schema/attachments.js';
import { notificationTemplates, notificationTriggers, smtpConfigurations } from './schema/notifications.js';
import {
  organisations,
  sites,
  locations,
  statusSets,
  statusTransitions,
  failureCodes,
  labourCrafts,
  assetClassifications,
} from './schema/entities.js';
import { EAM_REPORT_SUBJECTS } from './schema/eam-reporting.js';

const DEFAULT_PERMISSIONS = [
  { resource: 'admin', action: 'users:manage', description: 'Manage users and identity' },
  { resource: 'admin', action: 'config:manage', description: 'Manage application configuration' },
  { resource: 'admin', action: 'workflows:manage', description: 'Manage workflows and schema migrations' },
  { resource: 'admin', action: 'integrations:manage', description: 'Manage integrations' },
  { resource: 'admin', action: 'attachments:manage', description: 'Manage attachments and document types' },
  { resource: 'admin', action: 'reporting:manage', description: 'Manage reports' },
  { resource: 'admin', action: 'notifications:manage', description: 'Manage notifications' },
  // Phase 1 permissions
  { resource: 'assets', action: 'read', description: 'View assets and locations' },
  { resource: 'assets', action: 'write', description: 'Create and update assets' },
  { resource: 'service_requests', action: 'read', description: 'View service requests' },
  { resource: 'service_requests', action: 'write', description: 'Create and update service requests' },
  { resource: 'work_orders', action: 'read', description: 'View work orders' },
  { resource: 'work_orders', action: 'write', description: 'Create and update work orders' },
  { resource: 'work_orders', action: 'approve', description: 'Approve work orders' },
  { resource: 'pm', action: 'read', description: 'View preventive maintenance' },
  { resource: 'pm', action: 'write', description: 'Manage preventive maintenance' },
  { resource: 'permits', action: 'read', description: 'View permits' },
  { resource: 'permits', action: 'write', description: 'Create and update permits' },
  { resource: 'permits', action: 'approve', description: 'Approve permits' },
  { resource: 'inventory', action: 'read', description: 'View inventory' },
  { resource: 'inventory', action: 'write', description: 'Manage inventory transactions' },
  { resource: 'labour', action: 'read', description: 'View labour records' },
  { resource: 'labour', action: 'write', description: 'Manage labour and crews' },
  { resource: 'reports', action: 'read', description: 'Run and view reports' },
];

export async function seedDatabase(db: Database): Promise<{ tenantId: string; adminUserId: string }> {
  const existing = await db.select().from(tenants).where(eq(tenants.slug, 'default')).limit(1);
  if (existing.length > 0) {
    await removeLegacyDemoRoles(db);
    await ensureMissingPermissions(db, existing[0]!.id);
    await ensureAdminSetup(db, existing[0]!.id);
    await seedPhase1Data(db, existing[0]!.id);
    const admin = await db.select().from(users).where(eq(users.email, 'admin@eam.local')).limit(1);
    return { tenantId: existing[0]!.id, adminUserId: admin[0]?.id ?? '' };
  }

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: 'Default Tenant',
      slug: 'default',
      settings: {
        passwordPolicy: {
          minLength: 10,
          requireUppercase: true,
          requireNumber: true,
          requireSpecial: true,
          maxAgeDays: 90,
          lockoutAfterFailures: 5,
        },
        sessionPolicy: {
          idleTimeoutMinutes: 30,
          absoluteTimeoutDays: 7,
          maxConcurrentSessions: 5,
        },
      },
    })
    .returning();

  await db.insert(permissions).values(DEFAULT_PERMISSIONS);

  const entities = [
    { name: 'Asset', label: 'Asset', tableName: 'assets' },
    { name: 'WorkOrder', label: 'Work Order', tableName: 'work_orders' },
    { name: 'ServiceRequest', label: 'Service Request', tableName: 'service_requests' },
    { name: 'Location', label: 'Location', tableName: 'locations' },
    { name: 'JobPlan', label: 'Job Plan', tableName: 'job_plans' },
    { name: 'PMaster', label: 'Preventive Maintenance', tableName: 'pm_masters' },
    { name: 'Permit', label: 'Permit to Work', tableName: 'permits' },
    { name: 'Item', label: 'Inventory Item', tableName: 'items' },
    { name: 'Storeroom', label: 'Storeroom', tableName: 'storerooms' },
  ];

  for (const e of entities) {
    await db.insert(entityDefinitions).values({
      tenantId: tenant!.id,
      name: e.name,
      label: e.label,
      tableName: e.tableName,
      isSystem: true,
    });
  }

  // Seed P0 report subjects
  await db.insert(reportSubjects).values([
    {
      name: 'work_orders',
      label: 'Work Orders',
      baseQuery: 'SELECT * FROM work_orders WHERE tenant_id = $1',
      availableFields: [
        { key: 'wo_num', label: 'WO Number', type: 'text', filterable: true },
        { key: 'status', label: 'Status', type: 'text', filterable: true },
      ],
      isSystem: true,
    },
    {
      name: 'service_requests',
      label: 'Service Requests',
      baseQuery: 'SELECT * FROM service_requests WHERE tenant_id = $1',
      availableFields: [
        { key: 'sr_num', label: 'SR Number', type: 'text', filterable: true },
        { key: 'status', label: 'Status', type: 'text', filterable: true },
      ],
      isSystem: true,
    },
    {
      name: 'assets',
      label: 'Assets',
      baseQuery: 'SELECT * FROM assets WHERE tenant_id = $1',
      availableFields: [{ key: 'asset_num', label: 'Asset Number', type: 'text' }],
      isSystem: true,
    },
  ]);

  // Seed Phase 1 — 15 standard EAM report subjects
  for (const rs of EAM_REPORT_SUBJECTS) {
    await db.insert(reportSubjects).values({
      name: rs.name,
      label: rs.label,
      baseQuery: rs.baseQuery.trim(),
      availableFields: rs.availableFields as unknown as Record<string, unknown>[],
      isSystem: true,
    });
  }

  await db.insert(documentTypes).values([
    {
      tenantId: tenant!.id,
      name: 'Safety Document',
      label: 'Safety Document',
      allowedExtensions: ['pdf', 'jpg', 'png'],
      isSystem: true,
    },
    {
      tenantId: tenant!.id,
      name: 'Inspection Photo',
      label: 'Inspection Photo',
      allowedExtensions: ['jpg', 'jpeg', 'png', 'heic'],
      isSystem: true,
    },
    {
      tenantId: tenant!.id,
      name: 'Certificate',
      label: 'Certificate',
      allowedExtensions: ['pdf'],
      isSystem: true,
    },
    {
      tenantId: tenant!.id,
      name: 'PO Copy',
      label: 'Purchase Order Copy',
      allowedExtensions: ['pdf', 'docx'],
      isSystem: true,
    },
    {
      tenantId: tenant!.id,
      name: 'CAD Drawing',
      label: 'CAD Drawing',
      allowedExtensions: ['dwg', 'dxf', 'pdf'],
      isSystem: true,
    },
    // P0-7: used by chat file attachments
    {
      tenantId: tenant!.id,
      name: 'Chat Attachment',
      label: 'Chat Attachment',
      allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'docx', 'xlsx', 'txt', 'csv'],
      isSystem: true,
    },
  ]);

  // ── P0-6: Seed one starter report definition per BI platform ─────────────
  // These give admins an out-of-the-box report they can open in each BI tool
  // without building from scratch.  They use the system report subjects
  // seeded above (work_orders, assets, service_requests).
  const [woSubject] = await db.select().from(reportSubjects).where(
    eq(reportSubjects.name, 'work_orders'),
  ).limit(1);
  const [assetSubject] = await db.select().from(reportSubjects).where(
    eq(reportSubjects.name, 'assets'),
  ).limit(1);

  if (woSubject) {
    await db.insert(reportDefinitions).values([
      {
        tenantId: tenant!.id,
        name: 'Open Work Orders — Starter (Power BI)',
        subjectId: woSubject.id,
        definition: {
          fields: ['wo_num', 'status', 'priority', 'description', 'target_finish_date', 'site_num'],
          filters: [{ field: 'status', operator: 'NOT_EQUALS', value: 'CLOSE' }],
          groupBy: [],
          orderBy: [{ field: 'target_finish_date', direction: 'ASC' }],
          chartType: 'bar',
          biNote: 'Import into Power BI via Direct Query or push dataset.',
        },
        isPublic: true,
        createdBy: null,
        version: 1,
      },
      {
        tenantId: tenant!.id,
        name: 'Open Work Orders — Starter (Qlik)',
        subjectId: woSubject.id,
        definition: {
          fields: ['wo_num', 'status', 'priority', 'site_num', 'assigned_to_user_id'],
          filters: [{ field: 'status', operator: 'NOT_EQUALS', value: 'CLOSE' }],
          groupBy: ['status'],
          orderBy: [{ field: 'status', direction: 'ASC' }],
          chartType: 'bar',
          biNote: 'Export as QVD CSV via POST /admin/reporting/bi/qlik/export/:subjectId.',
        },
        isPublic: true,
        createdBy: null,
        version: 1,
      },
      {
        tenantId: tenant!.id,
        name: 'Work Order Backlog — Starter (Tableau)',
        subjectId: woSubject.id,
        definition: {
          fields: ['wo_num', 'status', 'priority', 'description', 'site_num'],
          filters: [{ field: 'status', operator: 'IN', value: ['WAPPR', 'APPR', 'INPRG'] }],
          groupBy: [],
          orderBy: [{ field: 'priority', direction: 'DESC' }],
          chartType: 'table',
          biNote: 'Use Tableau WDC endpoint at GET /reporting/tableau-wdc/wos.',
        },
        isPublic: true,
        createdBy: null,
        version: 1,
      },
      {
        tenantId: tenant!.id,
        name: 'WO Cost Summary — Starter (Cognos)',
        subjectId: woSubject.id,
        definition: {
          fields: ['wo_num', 'status', 'labor_cost', 'material_cost', 'total_cost'],
          filters: [],
          groupBy: ['status'],
          orderBy: [{ field: 'total_cost', direction: 'DESC' }],
          chartType: 'table',
          biNote: 'Import JDBC config from GET /admin/reporting/bi/cognos/connection-info.',
        },
        isPublic: true,
        createdBy: null,
        version: 1,
      },
    ]).onConflictDoNothing();
  }

  if (assetSubject) {
    await db.insert(reportDefinitions).values([
      {
        tenantId: tenant!.id,
        name: 'Asset Register — Starter (BIRT)',
        subjectId: assetSubject.id,
        definition: {
          fields: ['asset_num', 'criticality', 'manufacturer', 'model', 'install_date', 'site_num'],
          filters: [],
          groupBy: [],
          orderBy: [{ field: 'asset_num', direction: 'ASC' }],
          chartType: 'table',
          biNote: 'Upload rptdesign XML via POST /admin/reporting/birt/upload then run via GET /admin/reporting/birt/:designId/run.',
        },
        isPublic: true,
        createdBy: null,
        version: 1,
      },
    ]).onConflictDoNothing();
  }

  const [woTemplate] = await db
    .insert(notificationTemplates)
    .values({
      tenantId: tenant!.id,
      name: 'WO Assigned',
      subjectTemplate: 'Work Order {{wo_num}} assigned',
      htmlTemplate:
        '<p>Hello {{assignee.name}}, WO {{wo_num}} on {{asset.description}} has been assigned to you.</p>',
      textTemplate: 'WO {{wo_num}} assigned to {{assignee.name}}',
      isSystem: true,
    })
    .returning();

  const [srTemplate] = await db
    .insert(notificationTemplates)
    .values({
      tenantId: tenant!.id,
      name: 'SR Acknowledged',
      subjectTemplate: 'Service Request {{sr_num}} received',
      htmlTemplate:
        '<p>Hello {{requester.name}}, your service request {{sr_num}} has been received and is being reviewed.</p>',
      textTemplate: 'SR {{sr_num}} received and under review.',
      isSystem: true,
    })
    .returning();

  const [slaTemplate] = await db
    .insert(notificationTemplates)
    .values({
      tenantId: tenant!.id,
      name: 'SLA Breach',
      subjectTemplate: 'SLA Breached — Service Request {{sr_num}}',
      htmlTemplate:
        '<p>Service Request {{sr_num}} (Priority: {{priority}}) has breached its SLA target of {{sla_target_hours}} hours.</p>',
      textTemplate: 'SLA breached for SR {{sr_num}}.',
      isSystem: true,
    })
    .returning();

  const [permitTemplate] = await db
    .insert(notificationTemplates)
    .values({
      tenantId: tenant!.id,
      name: 'Permit Expiring',
      subjectTemplate: 'Permit {{permit_num}} expiring soon',
      htmlTemplate:
        '<p>Permit {{permit_num}} ({{type}}) for WO {{wo_num}} expires at {{valid_to}}.</p>',
      textTemplate: 'Permit {{permit_num}} expires at {{valid_to}}.',
      isSystem: true,
    })
    .returning();

  const [pmTemplate] = await db
    .insert(notificationTemplates)
    .values({
      tenantId: tenant!.id,
      name: 'PM Work Order Generated',
      subjectTemplate: 'PM Work Order {{wo_num}} generated',
      htmlTemplate:
        '<p>A PM work order {{wo_num}} has been automatically generated for {{asset_description}}. Due: {{target_finish_date}}.</p>',
      textTemplate: 'PM WO {{wo_num}} generated for {{asset_description}}.',
      isSystem: true,
    })
    .returning();

  await db.insert(notificationTriggers).values([
    {
      tenantId: tenant!.id,
      eventType: 'WO_ASSIGNED',
      entityType: 'WorkOrder',
      templateId: woTemplate!.id,
      distributionConfig: { rules: [{ type: 'FIELD', value: 'assignedToUserId' }] },
      isActive: true,
    },
    {
      tenantId: tenant!.id,
      eventType: 'WO_STATUS_CHANGED',
      entityType: 'WorkOrder',
      templateId: woTemplate!.id,
      conditionExpression: "status == 'COMP'",
      distributionConfig: { rules: [{ type: 'FIELD', value: 'assignedToUserId' }] },
      isActive: true,
    },
    {
      tenantId: tenant!.id,
      eventType: 'WF_TASK_ASSIGNED',
      templateId: woTemplate!.id,
      distributionConfig: { rules: [{ type: 'FIELD', value: 'assigneeUserId' }] },
      isActive: true,
    },
    {
      tenantId: tenant!.id,
      eventType: 'SR_CREATED',
      entityType: 'ServiceRequest',
      templateId: srTemplate!.id,
      distributionConfig: { rules: [{ type: 'FIELD', value: 'requesterId' }] },
      isActive: true,
    },
    {
      tenantId: tenant!.id,
      eventType: 'SR_SLA_BREACHED',
      entityType: 'ServiceRequest',
      templateId: slaTemplate!.id,
      distributionConfig: { rules: [{ type: 'ROLE', value: 'supervisor' }] },
      isActive: true,
    },
    {
      tenantId: tenant!.id,
      eventType: 'PERMIT_EXPIRING',
      entityType: 'Permit',
      templateId: permitTemplate!.id,
      distributionConfig: { rules: [{ type: 'FIELD', value: 'requestedByUserId' }] },
      isActive: true,
    },
    {
      tenantId: tenant!.id,
      eventType: 'PM_WO_GENERATED',
      entityType: 'WorkOrder',
      templateId: pmTemplate!.id,
      distributionConfig: { rules: [{ type: 'ROLE', value: 'planner' }] },
      isActive: true,
    },
  ]);

  await seedPhase1Data(db, tenant!.id);
  await ensureAdminSetup(db, tenant!.id);

  return { tenantId: tenant!.id, adminUserId: '' };
}

/** Seeds Phase 1 reference data: org/site/location hierarchy, status sets, failure codes, crafts, asset classifications. */
async function seedPhase1Data(db: Database, tenantId: string): Promise<void> {
  // Idempotency guard: skip if org already exists
  const existingOrg = await db
    .select()
    .from(organisations)
    .where(eq(organisations.tenantId, tenantId))
    .limit(1);
  if (existingOrg.length > 0) return;

  // ── Organisation / Site / Location hierarchy ────────────────────────────────
  const [org] = await db
    .insert(organisations)
    .values({
      tenantId,
      name: 'Default Organisation',
      code: 'DEFAULT',
      description: 'Default organisation seeded at setup',
      glAccount: '1000',
      costCenter: 'CC001',
    })
    .returning();

  const [site] = await db
    .insert(sites)
    .values({
      tenantId,
      orgId: org!.id,
      name: 'Main Site',
      siteNum: 'SITE001',
      description: 'Primary operating site',
      timezone: 'UTC',
      glAccount: '1100',
      costCenter: 'CC001',
    })
    .returning();

  const [rootLocation] = await db
    .insert(locations)
    .values({
      tenantId,
      siteId: site!.id,
      orgId: org!.id,
      code: 'LOC001',
      name: 'Main Building',
      description: 'Main building — root location',
      type: 'FUNCTIONAL',
    })
    .returning();

  // Sub-locations
  await db.insert(locations).values([
    {
      tenantId,
      siteId: site!.id,
      orgId: org!.id,
      parentId: rootLocation!.id,
      code: 'LOC001-FL1',
      name: 'Floor 1',
      type: 'OPERATING',
    },
    {
      tenantId,
      siteId: site!.id,
      orgId: org!.id,
      parentId: rootLocation!.id,
      code: 'LOC001-UTIL',
      name: 'Utilities Room',
      type: 'OPERATING',
    },
  ]);

  // ── Status sets ─────────────────────────────────────────────────────────────
  const [srSet] = await db
    .insert(statusSets)
    .values({
      tenantId,
      name: 'SR_DEFAULT',
      label: 'Service Request Statuses',
      entityType: 'ServiceRequest',
      description: 'Default status flow for service requests',
      isSystem: true,
    })
    .returning();

  await db.insert(statusTransitions).values([
    { statusSetId: srSet!.id, fromStatus: 'NEW', toStatus: 'QUEUED', label: 'Queue' },
    { statusSetId: srSet!.id, fromStatus: 'QUEUED', toStatus: 'IN_PROGRESS', label: 'Start Work' },
    { statusSetId: srSet!.id, fromStatus: 'IN_PROGRESS', toStatus: 'RESOLVED', label: 'Resolve', requiresComment: true },
    { statusSetId: srSet!.id, fromStatus: 'IN_PROGRESS', toStatus: 'CLOSED', label: 'Close', requiresComment: true },
    { statusSetId: srSet!.id, fromStatus: 'IN_PROGRESS', toStatus: 'CONVERTED', label: 'Convert to WO' },
    { statusSetId: srSet!.id, fromStatus: 'QUEUED', toStatus: 'CANCELLED', label: 'Cancel', requiresComment: true },
    { statusSetId: srSet!.id, fromStatus: 'NEW', toStatus: 'CANCELLED', label: 'Cancel', requiresComment: true },
  ]);

  const [woSet] = await db
    .insert(statusSets)
    .values({
      tenantId,
      name: 'WO_DEFAULT',
      label: 'Work Order Statuses',
      entityType: 'WorkOrder',
      description: 'Default Maximo-aligned status flow for work orders',
      isSystem: true,
    })
    .returning();

  await db.insert(statusTransitions).values([
    { statusSetId: woSet!.id, fromStatus: 'WAPPR', toStatus: 'APPR', label: 'Approve', requiredRole: 'supervisor' },
    { statusSetId: woSet!.id, fromStatus: 'WAPPR', toStatus: 'CAN', label: 'Cancel', requiresComment: true },
    { statusSetId: woSet!.id, fromStatus: 'APPR', toStatus: 'INPRG', label: 'Start Work' },
    { statusSetId: woSet!.id, fromStatus: 'APPR', toStatus: 'HOLD', label: 'Put on Hold', requiresComment: true },
    { statusSetId: woSet!.id, fromStatus: 'APPR', toStatus: 'CAN', label: 'Cancel', requiresComment: true },
    { statusSetId: woSet!.id, fromStatus: 'INPRG', toStatus: 'COMP', label: 'Complete' },
    { statusSetId: woSet!.id, fromStatus: 'INPRG', toStatus: 'HOLD', label: 'Put on Hold', requiresComment: true },
    { statusSetId: woSet!.id, fromStatus: 'COMP', toStatus: 'CLOSE', label: 'Close', requiredRole: 'supervisor' },
    { statusSetId: woSet!.id, fromStatus: 'COMP', toStatus: 'INPRG', label: 'Reopen' },
    { statusSetId: woSet!.id, fromStatus: 'HOLD', toStatus: 'APPR', label: 'Resume' },
  ]);

  const [permitSet] = await db
    .insert(statusSets)
    .values({
      tenantId,
      name: 'PERMIT_DEFAULT',
      label: 'Permit to Work Statuses',
      entityType: 'Permit',
      description: 'Default status flow for permits',
      isSystem: true,
    })
    .returning();

  await db.insert(statusTransitions).values([
    { statusSetId: permitSet!.id, fromStatus: 'DRAFT', toStatus: 'PENDING_APPROVAL', label: 'Submit for Approval' },
    { statusSetId: permitSet!.id, fromStatus: 'PENDING_APPROVAL', toStatus: 'ACTIVE', label: 'Approve', requiredRole: 'safety_officer' },
    { statusSetId: permitSet!.id, fromStatus: 'PENDING_APPROVAL', toStatus: 'REJECTED', label: 'Reject', requiresComment: true },
    { statusSetId: permitSet!.id, fromStatus: 'ACTIVE', toStatus: 'SUSPENDED', label: 'Suspend', requiresComment: true },
    { statusSetId: permitSet!.id, fromStatus: 'ACTIVE', toStatus: 'CLOSED', label: 'Close Work' },
    { statusSetId: permitSet!.id, fromStatus: 'SUSPENDED', toStatus: 'ACTIVE', label: 'Reactivate' },
  ]);

  // ── Failure Codes ────────────────────────────────────────────────────────────
  const problemCodes = [
    { code: 'P-LEAK', description: 'Fluid Leak' },
    { code: 'P-NOISE', description: 'Abnormal Noise' },
    { code: 'P-OVERHEAT', description: 'Overheating' },
    { code: 'P-VIBRATION', description: 'Excessive Vibration' },
    { code: 'P-FAIL', description: 'Complete Failure' },
    { code: 'P-PERF', description: 'Performance Degradation' },
    { code: 'P-CORROSION', description: 'Corrosion / Rust' },
    { code: 'P-BLOCKAGE', description: 'Blockage / Clogging' },
  ];
  const causeCodes = [
    { code: 'C-WEAR', description: 'Normal Wear and Tear' },
    { code: 'C-MISUSE', description: 'Operator Error / Misuse' },
    { code: 'C-LACK_PM', description: 'Lack of Preventive Maintenance' },
    { code: 'C-OVERLOAD', description: 'Overload Condition' },
    { code: 'C-INSTALL', description: 'Improper Installation' },
    { code: 'C-DESIGN', description: 'Design Deficiency' },
    { code: 'C-CONTAMINATION', description: 'Contamination' },
  ];
  const remedyCodes = [
    { code: 'R-REPLACE', description: 'Replace Component' },
    { code: 'R-REPAIR', description: 'Repair in Place' },
    { code: 'R-ADJUST', description: 'Adjust / Calibrate' },
    { code: 'R-CLEAN', description: 'Clean / Flush' },
    { code: 'R-LUBRICATE', description: 'Lubricate' },
    { code: 'R-INSPECT', description: 'Inspect and Monitor' },
    { code: 'R-RETIGHTEN', description: 'Re-tighten / Re-torque' },
  ];

  for (const c of problemCodes) {
    await db.insert(failureCodes).values({ tenantId, type: 'PROBLEM', code: c.code, description: c.description });
  }
  for (const c of causeCodes) {
    await db.insert(failureCodes).values({ tenantId, type: 'CAUSE', code: c.code, description: c.description });
  }
  for (const c of remedyCodes) {
    await db.insert(failureCodes).values({ tenantId, type: 'REMEDY', code: c.code, description: c.description });
  }

  // ── Labour Crafts ────────────────────────────────────────────────────────────
  const crafts = [
    { craftCode: 'MECH', description: 'Mechanical Technician', defaultRate: '45.00' },
    { craftCode: 'ELEC', description: 'Electrical Technician', defaultRate: '50.00' },
    { craftCode: 'INST', description: 'Instrumentation Technician', defaultRate: '55.00' },
    { craftCode: 'CIVIL', description: 'Civil / Structural Technician', defaultRate: '40.00' },
    { craftCode: 'IT', description: 'IT / Controls Technician', defaultRate: '60.00' },
    { craftCode: 'GEN', description: 'General Labour', defaultRate: '30.00' },
  ];
  for (const c of crafts) {
    await db.insert(labourCrafts).values({ tenantId, ...c });
  }

  // ── Asset Classifications ────────────────────────────────────────────────────
  const [mechClass] = await db
    .insert(assetClassifications)
    .values({ tenantId, classCode: 'MECH', description: 'Mechanical Equipment' })
    .returning();

  await db.insert(assetClassifications).values([
    { tenantId, classCode: 'PUMP', description: 'Pumps', parentId: mechClass!.id },
    { tenantId, classCode: 'COMPRESSOR', description: 'Compressors', parentId: mechClass!.id },
    { tenantId, classCode: 'HVAC', description: 'HVAC Equipment', parentId: mechClass!.id },
    { tenantId, classCode: 'CONVEYOR', description: 'Conveyors', parentId: mechClass!.id },
  ]);

  const [elecClass] = await db
    .insert(assetClassifications)
    .values({ tenantId, classCode: 'ELEC', description: 'Electrical Equipment' })
    .returning();

  await db.insert(assetClassifications).values([
    { tenantId, classCode: 'MOTOR', description: 'Electric Motors', parentId: elecClass!.id },
    { tenantId, classCode: 'SWITCHGEAR', description: 'Switchgear / Panels', parentId: elecClass!.id },
    { tenantId, classCode: 'TRANSFORMER', description: 'Transformers', parentId: elecClass!.id },
    { tenantId, classCode: 'UPS', description: 'UPS Systems', parentId: elecClass!.id },
  ]);

  await db.insert(assetClassifications).values([
    { tenantId, classCode: 'VEHICLE', description: 'Fleet / Vehicles' },
    { tenantId, classCode: 'BUILDING', description: 'Buildings & Infrastructure' },
    { tenantId, classCode: 'IT_ASSET', description: 'IT Assets' },
  ]);
}

/** Adds any permissions missing from an existing DB (safe to run on every startup). */
async function ensureMissingPermissions(db: Database, _tenantId: string): Promise<void> {
  const existing = await db.select().from(permissions);
  const existingKeys = new Set(existing.map((p: { resource: string; action: string }) => `${p.resource}:${p.action}`));
  const missing = DEFAULT_PERMISSIONS.filter(
    (p) => !existingKeys.has(`${p.resource}:${p.action}`),
  );
  if (missing.length > 0) {
    await db.insert(permissions).values(missing);
  }
}

/** Removes legacy demo roles so admins create roles through the UI (P0-1 AC-1.2). */
export async function removeLegacyDemoRoles(db: Database): Promise<void> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, 'default')).limit(1);
  if (!tenant) return;

  const legacyNames = ['Supervisor', 'Technician'];
  for (const name of legacyNames) {
    await db.delete(roles).where(and(eq(roles.tenantId, tenant.id), eq(roles.name, name)));
  }
}

/**
 * Ensures:
 * 1. A "System Admin" role exists with ALL permissions
 * 2. A "All Users" group exists (new users auto-joined on register)
 * 3. An "All Users" role exists with basic read permissions
 * 4. admin@eam.local gets the System Admin role via the Admins group
 */
async function ensureAdminSetup(db: Database, tenantId: string): Promise<void> {
  // ── 1. Get all permission IDs ────────────────────────────────────────────
  const allPerms = await db.select().from(permissions);
  if (allPerms.length === 0) return;

  // ── 2. Create System Admin role ──────────────────────────────────────────
  let [adminRole] = await db.select().from(roles)
    .where(and(eq(roles.tenantId, tenantId), eq(roles.name, 'system_admin'))).limit(1);

  if (!adminRole) {
    const [inserted] = await db.insert(roles).values({
      tenantId,
      name: 'system_admin',
      description: 'Full access to all EAM modules and administration',
      isSystem: true,
    }).returning();
    adminRole = inserted!;
  }

  // Assign ALL permissions to System Admin role
  for (const perm of allPerms) {
    await db.insert(rolePermissions)
      .values({ roleId: adminRole.id, permissionId: perm.id })
      .onConflictDoNothing();
  }

  // ── 3. Create All Users group (basic group every new user joins) ──────────
  let [allUsersGroup] = await db.select().from(groups)
    .where(and(eq(groups.tenantId, tenantId), eq(groups.name, 'All Users'))).limit(1);

  if (!allUsersGroup) {
    const [inserted] = await db.insert(groups).values({
      tenantId,
      name: 'All Users',
      description: 'Every registered user is automatically a member of this group',
    }).returning();
    allUsersGroup = inserted!;
  }

  // ── 4. Create basic "EAM User" role with read-only access ────────────────
  let [basicRole] = await db.select().from(roles)
    .where(and(eq(roles.tenantId, tenantId), eq(roles.name, 'eam_user'))).limit(1);

  if (!basicRole) {
    const [inserted] = await db.insert(roles).values({
      tenantId,
      name: 'eam_user',
      description: 'Basic read access — can view work orders, assets, and service requests',
      isSystem: true,
    }).returning();
    basicRole = inserted!;
  }

  // Give basic role read permissions for core entities
  const basicPermNames = [
    'assets:read', 'work_orders:read', 'service_requests:read',
    'pm:read', 'permits:read', 'inventory:read', 'labour:read', 'reports:read',
  ];
  const basicPerms = allPerms.filter((p) =>
    basicPermNames.includes(`${p.resource}:${p.action}`)
  );
  for (const perm of basicPerms) {
    await db.insert(rolePermissions)
      .values({ roleId: basicRole.id, permissionId: perm.id })
      .onConflictDoNothing();
  }

  // Assign basic role to All Users group (so every new user gets read access)
  await db.insert(groupRoles)
    .values({ groupId: allUsersGroup.id, roleId: basicRole.id })
    .onConflictDoNothing();

  // ── 5. Create Admins group ────────────────────────────────────────────────
  let [adminsGroup] = await db.select().from(groups)
    .where(and(eq(groups.tenantId, tenantId), eq(groups.name, 'Admins'))).limit(1);

  if (!adminsGroup) {
    const [inserted] = await db.insert(groups).values({
      tenantId,
      name: 'Admins',
      description: 'System administrators with full access',
    }).returning();
    adminsGroup = inserted!;
  }

  // Assign System Admin role to Admins group
  await db.insert(groupRoles)
    .values({ groupId: adminsGroup.id, roleId: adminRole.id })
    .onConflictDoNothing();

  // ── 6. Add admin@eam.local to Admins group ────────────────────────────────
  const [adminUser] = await db.select().from(users)
    .where(eq(users.email, 'admin@eam.local')).limit(1);

  if (adminUser) {
    await db.insert(userGroups)
      .values({ userId: adminUser.id, groupId: adminsGroup.id })
      .onConflictDoNothing();
    // Also add to All Users group
    await db.insert(userGroups)
      .values({ userId: adminUser.id, groupId: allUsersGroup.id })
      .onConflictDoNothing();
  }

  // ── 7. Dev MailHog SMTP (localhost:1025) when none configured ─────────────
  const [existingSmtp] = await db
    .select({ id: smtpConfigurations.id })
    .from(smtpConfigurations)
    .where(eq(smtpConfigurations.tenantId, tenantId))
    .limit(1);

  const tenantSmtp = await db
    .select({ id: smtpConfigurations.id, isActive: smtpConfigurations.isActive })
    .from(smtpConfigurations)
    .where(eq(smtpConfigurations.tenantId, tenantId));

  if (tenantSmtp.length === 0) {
    await db.insert(smtpConfigurations).values({
      tenantId,
      host: 'localhost',
      port: 1025,
      secure: false,
      fromEmail: 'noreply@eam.local',
      fromName: 'EAM Platform',
      isActive: true,
    });
  } else {
    const active = tenantSmtp.filter((row) => row.isActive);
    if (active.length !== 1) {
      await db
        .update(smtpConfigurations)
        .set({ isActive: false })
        .where(eq(smtpConfigurations.tenantId, tenantId));
      const keepId = active[0]?.id ?? tenantSmtp[tenantSmtp.length - 1]!.id;
      await db
        .update(smtpConfigurations)
        .set({ isActive: true })
        .where(eq(smtpConfigurations.id, keepId));
    }
  }
}

