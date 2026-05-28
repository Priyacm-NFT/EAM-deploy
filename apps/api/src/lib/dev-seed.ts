import { eq, and, notInArray } from 'drizzle-orm';
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

const DEV_ADMIN_EMAIL = process.env.DEV_ADMIN_EMAIL ?? 'admin@eam.local';
const DEV_ADMIN_PASSWORD = process.env.DEV_ADMIN_PASSWORD ?? 'AdminPass1!';

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

/** Dev-only bootstrap: creates roles, groups, and the admin user.
 *  Also creates an "All Users" group so every registered user gets
 *  the full sidebar automatically.
 *
 *  ALSO: backfills any existing users who were registered before the
 *  "All Users" group existed — so old accounts get sidebar access too.
 */
export async function ensureDevAdminUser(): Promise<void> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, 'default')).limit(1);
  if (!tenant) return;

  // ── System Administrator role (for admin@eam.local only) ──────────────
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
    console.log('[dev-seed] Created System Administrator role');
  }

  await syncRolePermissions(adminRole!.id);

  // ── Administrators group (only admin@eam.local is in here) ────────────
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
    .values({ groupId: adminGroup!.id, roleId: adminRole!.id })
    .onConflictDoNothing();

  // ── "All Users" role — every registered user gets this ────────────────
  let [allUsersRole] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.tenantId, tenant.id), eq(roles.name, 'All Users')))
    .limit(1);

  if (!allUsersRole) {
    [allUsersRole] = await db
      .insert(roles)
      .values({
        tenantId: tenant.id,
        name: 'All Users',
        description: 'Default role — assigned to every registered user',
        isSystem: true,
      })
      .returning();
    console.log('[dev-seed] Created All Users role');
  }

  await syncRolePermissions(allUsersRole!.id);

  // ── "All Users" group — every registered user is auto-added here ──────
  let [allUsersGroup] = await db
    .select()
    .from(groups)
    .where(and(eq(groups.tenantId, tenant.id), eq(groups.name, 'All Users')))
    .limit(1);

  if (!allUsersGroup) {
    [allUsersGroup] = await db
      .insert(groups)
      .values({ tenantId: tenant.id, name: 'All Users', source: 'LOCAL' })
      .returning();
    console.log('[dev-seed] Created All Users group');
  }

  await db
    .insert(groupRoles)
    .values({ groupId: allUsersGroup!.id, roleId: allUsersRole!.id })
    .onConflictDoNothing();

  // ── BACKFILL: add every existing user who isn't already in "All Users" ─
  // This fixes accounts that were registered before this group existed.
  const alreadyInGroup = await db
    .select({ userId: userGroups.userId })
    .from(userGroups)
    .where(eq(userGroups.groupId, allUsersGroup!.id));

  const alreadyInGroupIds = alreadyInGroup.map((r) => r.userId);

  const usersToBackfill = alreadyInGroupIds.length > 0
    ? await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.tenantId, tenant.id),
            notInArray(users.id, alreadyInGroupIds),
          ),
        )
    : await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.tenantId, tenant.id));

  if (usersToBackfill.length > 0) {
    await db
      .insert(userGroups)
      .values(usersToBackfill.map((u) => ({ userId: u.id, groupId: allUsersGroup!.id })))
      .onConflictDoNothing();
    console.log(`[dev-seed] Backfilled ${usersToBackfill.length} existing user(s) into "All Users" group`);
  }

  // ── admin@eam.local user ──────────────────────────────────────────────
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
    console.log(`[dev-seed] Created admin user ${DEV_ADMIN_EMAIL}`);
  }

  // Admin goes into both groups
  if (adminGroup && adminUser) {
    await db
      .insert(userGroups)
      .values({ userId: adminUser.id, groupId: adminGroup.id })
      .onConflictDoNothing();
  }
  if (allUsersGroup && adminUser) {
    await db
      .insert(userGroups)
      .values({ userId: adminUser.id, groupId: allUsersGroup.id })
      .onConflictDoNothing();
  }
}

export { DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD };

