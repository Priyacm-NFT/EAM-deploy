import { hashPassword } from '@eam/auth';
import { createHash, randomBytes } from 'node:crypto';
import { createDb, tenants, users, serviceRequests, workOrders } from '@eam/db';
import type { Database } from '@eam/db';
import { storePasswordResetToken } from '../lib/auth-state.js';

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
