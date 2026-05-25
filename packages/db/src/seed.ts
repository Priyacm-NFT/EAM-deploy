import { eq } from 'drizzle-orm';
import type { Database } from './client.js';
import {
  tenants,
  permissions,
  roles,
  rolePermissions,
  users,
  groups,
  groupRoles,
} from './schema/identity.js';
import { entityDefinitions } from './schema/config.js';
import { reportSubjects } from './schema/reporting.js';
import { documentTypes } from './schema/attachments.js';
import { notificationTemplates, notificationTriggers } from './schema/notifications.js';

const DEFAULT_PERMISSIONS = [
  { resource: 'admin', action: 'users:manage', description: 'Manage users and identity' },
  { resource: 'admin', action: 'config:manage', description: 'Manage application configuration' },
  { resource: 'admin', action: 'integrations:manage', description: 'Manage integrations' },
  { resource: 'admin', action: 'reporting:manage', description: 'Manage reports' },
  { resource: 'admin', action: 'notifications:manage', description: 'Manage notifications' },
];

export async function seedDatabase(db: Database): Promise<{ tenantId: string; adminUserId: string }> {
  const existing = await db.select().from(tenants).where(eq(tenants.slug, 'default')).limit(1);
  if (existing.length > 0) {
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

  const permRows = await db.insert(permissions).values(DEFAULT_PERMISSIONS).returning();

  const [adminRole] = await db
    .insert(roles)
    .values({
      tenantId: tenant!.id,
      name: 'System Administrator',
      description: 'Full system access',
      isSystem: true,
      requireMfa: false,
    })
    .returning();

  await db.insert(rolePermissions).values(
    permRows.map((p) => ({ roleId: adminRole!.id, permissionId: p.id })),
  );

  await db.insert(roles).values({
    tenantId: tenant!.id,
    name: 'Supervisor',
    description: 'Maintenance supervisor',
    isSystem: true,
  });

  await db.insert(roles).values({
    tenantId: tenant!.id,
    name: 'Technician',
    description: 'Field technician',
    isSystem: true,
  });

  const [adminGroup] = await db
    .insert(groups)
    .values({ tenantId: tenant!.id, name: 'Administrators', source: 'LOCAL' })
    .returning();

  await db.insert(groupRoles).values({ groupId: adminGroup!.id, roleId: adminRole!.id });

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
    {
      tenantId: tenant!.id,
      eventType: 'SR_STATUS_CHANGED',
      entityType: 'PurchaseRequisition',
      conditionExpression: 'totalcost > 100000',
      templateId: woTemplate!.id,
      distributionConfig: {
        rules: [{ type: 'ROLE', value: 'Supervisor' }],
      },
      isActive: true,
    },
  ]);

  return { tenantId: tenant!.id, adminUserId: '' };
}
