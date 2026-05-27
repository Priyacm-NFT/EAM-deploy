import { eq, and } from 'drizzle-orm';
import { hashPassword } from '@eam/auth';
import {
  db,
  tenants,
  users,
  groups,
  userGroups,
  groupRoles,
  roles,
  permissions,
  rolePermissions,
} from '@eam/db';

const DEV_ADMIN_EMAIL = 'admin@eam.local';
const DEV_ADMIN_PASSWORD = 'AdminPass1!';

async function syncRolePermissions(roleId: string): Promise<void> {
  const allPerms = await db.select().from(permissions);
  if (allPerms.length === 0) return;

  const existing = await db
    .select({ permissionId: rolePermissions.permissionId })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, roleId));
  const existingIds = new Set(existing.map((r) => r.permissionId));
  const missing = allPerms.filter((p) => !existingIds.has(p.id));
  if (missing.length > 0) {
    await db.insert(rolePermissions).values(
      missing.map((p) => ({ roleId, permissionId: p.id })),
    );
  }
}

/** Dev-only bootstrap: admin role, group, and login user (not pre-seeded for production). */
export async function ensureDevAdminUser(): Promise<void> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, 'default')).limit(1);
  if (!tenant) return;

  let [adminRole] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.tenantId, tenant.id), eq(roles.name, 'System Administrator')))
    .limit(1);

  if (!adminRole) {
    [adminRole] = await db
      .insert(roles)
      .values({
        tenantId: tenant.id,
        name: 'System Administrator',
        description: 'Dev bootstrap — full system access',
        isSystem: true,
      })
      .returning();
    console.log('[dev-seed] Created System Administrator role (dev bootstrap only)');
  }

  await syncRolePermissions(adminRole.id);

  let [adminGroup] = await db
    .select()
    .from(groups)
    .where(and(eq(groups.tenantId, tenant.id), eq(groups.name, 'Administrators')))
    .limit(1);

  if (!adminGroup) {
    [adminGroup] = await db
      .insert(groups)
      .values({ tenantId: tenant.id, name: 'Administrators', source: 'LOCAL' })
      .returning();
  }

  await db
    .insert(groupRoles)
    .values({ groupId: adminGroup.id, roleId: adminRole.id })
    .onConflictDoNothing();

  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenant.id), eq(users.email, DEV_ADMIN_EMAIL)))
    .limit(1);

  let adminUser = existing;
  if (!adminUser) {
    const passwordHash = await hashPassword(DEV_ADMIN_PASSWORD);
    [adminUser] = await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: DEV_ADMIN_EMAIL,
        username: 'admin',
        displayName: 'System Administrator',
        passwordHash,
        authSource: 'LOCAL',
        passwordChangedAt: new Date(),
      })
      .returning();
    console.log(`[dev-seed] Created admin user ${DEV_ADMIN_EMAIL} / ${DEV_ADMIN_PASSWORD}`);
  }

  if (adminGroup && adminUser) {
    await db
      .insert(userGroups)
      .values({ userId: adminUser.id, groupId: adminGroup.id })
      .onConflictDoNothing();
  }
}

export { DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD };
