import { eq, inArray } from 'drizzle-orm';
import type { Database } from '@eam/db';
import { userGroups, groupRoles, roles, rolePermissions, permissions } from '@eam/db';

export async function getEffectivePermissions(
  db: Database,
  userId: string,
): Promise<{ roles: string[]; permissions: string[] }> {
  const groupRoleRows = await db
    .select({ name: roles.name, roleId: roles.id })
    .from(userGroups)
    .innerJoin(groupRoles, eq(userGroups.groupId, groupRoles.groupId))
    .innerJoin(roles, eq(groupRoles.roleId, roles.id))
    .where(eq(userGroups.userId, userId));

  const roleNames = [...new Set(groupRoleRows.map((r) => r.name))];
  const roleIds = [...new Set(groupRoleRows.map((r) => r.roleId))];

  const permRows =
    roleIds.length === 0
      ? []
      : await db
          .select({ resource: permissions.resource, action: permissions.action })
          .from(rolePermissions)
          .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
          .where(inArray(rolePermissions.roleId, roleIds));

  const permissionStrings = [
    ...new Set(permRows.map((p) => `${p.resource}:${p.action}`)),
  ];

  return { roles: roleNames, permissions: permissionStrings };
}

export function hasPermission(userPermissions: string[], required: string): boolean {
  return userPermissions.includes(required);
}

export async function userRequiresMfa(db: Database, userId: string): Promise<boolean> {
  const rows = await db
    .select({ requireMfa: roles.requireMfa })
    .from(userGroups)
    .innerJoin(groupRoles, eq(userGroups.groupId, groupRoles.groupId))
    .innerJoin(roles, eq(groupRoles.roleId, roles.id))
    .where(eq(userGroups.userId, userId));

  return rows.some((r) => r.requireMfa);
}
