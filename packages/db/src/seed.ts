import { eq, and } from 'drizzle-orm';
import type { Database } from './client.js';
import {
  tenants,
  permissions,
  roles,
  users,
} from './schema/identity.js';
import { entityDefinitions } from './schema/config.js';
import { reportSubjects } from './schema/reporting.js';
import { documentTypes } from './schema/attachments.js';
import { notificationTemplates, notificationTriggers } from './schema/notifications.js';

const DEFAULT_PERMISSIONS = [
  { resource: 'admin', action: 'users:manage', description: 'Manage users and identity' },
  { resource: 'admin', action: 'config:manage', description: 'Manage application configuration' },
  { resource: 'admin', action: 'workflows:manage', description: 'Manage workflows and schema migrations' },
  { resource: 'admin', action: 'integrations:manage', description: 'Manage integrations' },
  { resource: 'admin', action: 'attachments:manage', description: 'Manage attachments and document types' },
  { resource: 'admin', action: 'reporting:manage', description: 'Manage reports' },
  { resource: 'admin', action: 'notifications:manage', description: 'Manage notifications' },
];

export async function seedDatabase(db: Database): Promise<{ tenantId: string; adminUserId: string }> {
  const existing = await db.select().from(tenants).where(eq(tenants.slug, 'default')).limit(1);
  if (existing.length > 0) {
    await removeLegacyDemoRoles(db);
    await ensureMissingPermissions(db, existing[0]!.id);
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

  await db.insert(documentTypes).values({
    tenantId: tenant!.id,
    name: 'Safety Document',
    label: 'Safety Document',
    allowedExtensions: ['pdf', 'jpg', 'png'],
    isSystem: true,
  });

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

  await db.insert(notificationTriggers).values([
    {
      tenantId: tenant!.id,
      eventType: 'WO_ASSIGNED',
      entityType: 'WorkOrder',
      templateId: woTemplate!.id,
      distributionConfig: {
        rules: [{ type: 'FIELD', value: 'assigneeUserId' }],
      },
      isActive: true,
    },
    {
      tenantId: tenant!.id,
      eventType: 'WF_TASK_ASSIGNED',
      templateId: woTemplate!.id,
      distributionConfig: {
        rules: [{ type: 'FIELD', value: 'assigneeUserId' }],
      },
      isActive: true,
    },
  ]);

  return { tenantId: tenant!.id, adminUserId: '' };
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