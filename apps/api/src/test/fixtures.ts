import { hashPassword, signAccessToken } from '@eam/auth';
import { createHash, randomBytes } from 'node:crypto';
import {
  createDb,
  tenants,
  users,
  serviceRequests,
  workOrders,
  organisations,
  sites,
  locations,
  statusSets,
  statusTransitions,
  labourCrafts,
} from '@eam/db';
import type { Database } from '@eam/db';
import { storePasswordResetToken } from '../lib/auth-state.js';

/** Permissions for Phase 1 EAM Core MVP API routes (PRD §9.1–9.6, 9.9–9.10). */
export const PHASE1_PERMISSIONS = [
  'assets:read',
  'assets:write',
  'service_requests:read',
  'service_requests:write',
  'work_orders:read',
  'work_orders:write',
  'work_orders:approve',
  'pm:read',
  'pm:write',
  'permits:read',
  'permits:write',
  'permits:approve',
  'inventory:read',
  'inventory:write',
  'labour:read',
  'labour:write',
  'reports:read',
  'admin:config:manage',
] as const;

export async function createPhase1AccessToken(
  db: Database,
  tenantId: string,
  email = 'phase1@test.com',
  displayName = 'Phase 1 Tester',
) {
  const user = await createTestUser(db, tenantId, email, displayName);
  const token = await signAccessToken({
    sub: user.id,
    tenantId,
    email: user.email,
    roles: [],
    permissions: [...PHASE1_PERMISSIONS],
    mfa_verified: true,
  });
  return { user, token };
}

/** Seeds org/site/location hierarchy, SR/WO status sets, and a labour craft for integration tests. */
export async function seedPhase1ReferenceData(db: Database, tenantId: string) {
  const [org] = await db
    .insert(organisations)
    .values({
      tenantId,
      name: 'Test Organisation',
      code: 'TESTORG',
      description: 'Phase 1 test org',
    })
    .returning();

  const [site] = await db
    .insert(sites)
    .values({
      tenantId,
      orgId: org!.id,
      name: 'Test Site',
      siteNum: 'SITE-TEST',
      timezone: 'UTC',
    })
    .returning();

  const [location] = await db
    .insert(locations)
    .values({
      tenantId,
      siteId: site!.id,
      orgId: org!.id,
      code: 'LOC-TEST',
      name: 'Test Location',
      type: 'FUNCTIONAL',
    })
    .returning();

  const [srSet] = await db
    .insert(statusSets)
    .values({
      tenantId,
      name: 'SR_TEST',
      label: 'SR Test Statuses',
      entityType: 'ServiceRequest',
      isSystem: true,
    })
    .returning();

  await db.insert(statusTransitions).values([
    { statusSetId: srSet!.id, fromStatus: 'NEW', toStatus: 'QUEUED', label: 'Queue' },
    { statusSetId: srSet!.id, fromStatus: 'QUEUED', toStatus: 'IN_PROGRESS', label: 'Start Work' },
    { statusSetId: srSet!.id, fromStatus: 'IN_PROGRESS', toStatus: 'RESOLVED', label: 'Resolve', requiresComment: true },
    { statusSetId: srSet!.id, fromStatus: 'IN_PROGRESS', toStatus: 'CONVERTED', label: 'Convert to WO' },
  ]);

  const [woSet] = await db
    .insert(statusSets)
    .values({
      tenantId,
      name: 'WO_TEST',
      label: 'WO Test Statuses',
      entityType: 'WorkOrder',
      isSystem: true,
    })
    .returning();

  await db.insert(statusTransitions).values([
    { statusSetId: woSet!.id, fromStatus: 'WAPPR', toStatus: 'APPR', label: 'Approve' },
    { statusSetId: woSet!.id, fromStatus: 'APPR', toStatus: 'INPRG', label: 'Start Work' },
    { statusSetId: woSet!.id, fromStatus: 'INPRG', toStatus: 'COMP', label: 'Complete' },
    { statusSetId: woSet!.id, fromStatus: 'COMP', toStatus: 'CLOSE', label: 'Close' },
  ]);

  const [craft] = await db
    .insert(labourCrafts)
    .values({
      tenantId,
      craftCode: 'MECH',
      description: 'Mechanical Technician',
      defaultRate: '45.00',
    })
    .returning();

  return { org: org!, site: site!, location: location!, craft: craft! };
}

export async function createAuthTestTenant(db: Database) {
  const slug = `auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: 'Auth Test Tenant',
      slug,
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
  return { tenant: tenant!, slug };
}

export async function createPasswordResetToken(userId: string): Promise<string> {
  const raw = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(raw).digest('hex');
  await storePasswordResetToken(tokenHash, userId, 3600);
  return raw;
}

export async function createTestTenant(db: Database) {
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: 'P0-7 Test Tenant',
      slug: `p07-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    })
    .returning();
  return tenant!;
}

export async function createTestUser(
  db: Database,
  tenantId: string,
  email: string,
  displayName: string,
) {
  const passwordHash = await hashPassword('TestPass123!');
  const [user] = await db
    .insert(users)
    .values({
      tenantId,
      email,
      username: email.split('@')[0]!,
      passwordHash,
      displayName,
      authSource: 'LOCAL',
    })
    .returning();
  return user!;
}

export async function seedOpenEntities(
  db: Database,
  tenantId: string,
  requesterId: string,
  assigneeId: string,
) {
  await db.insert(serviceRequests).values({
    tenantId,
    srNum: 'SR-TEST-001',
    description: 'Test open SR',
    status: 'NEW',
    requesterId,
  });
  await db.insert(workOrders).values([
    {
      tenantId,
      woNum: 'WO-TEST-001',
      description: 'Assigned open WO',
      status: 'WAPPR',
      assignedToUserId: assigneeId,
    },
    {
      tenantId,
      woNum: 'WO-TEST-002',
      description: 'Recent open WO',
      status: 'INPRG',
    },
  ]);
}

export function testDb(): Database {
  return createDb(process.env.DATABASE_URL);
}
