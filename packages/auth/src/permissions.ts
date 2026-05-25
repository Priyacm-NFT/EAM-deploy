import { eq, inArray } from 'drizzle-orm';
import type { Database } from '@eam/db';
import {
  userRoles,
  userGroups,
  groupRoles,
  roles,
  rolePermissions,
  permissions,
} from '@eam/db';

export async function getEffectivePermissions(
  db: Database,
  userId: string,
): Promise<{ roles: string[]; permissions: string[] }> {
  const directRoles = await db
    .select({ name: roles.name, requireMfa: roles.requireMfa })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));

  const groupRoleRows = await db
    .select({ name: roles.name, requireMfa: roles.requireMfa })
    .from(userGroups)
    .innerJoin(groupRoles, eq(userGroups.groupId, groupRoles.groupId))
    .innerJoin(roles, eq(groupRoles.roleId, roles.id))
    .where(eq(userGroups.userId, userId));

  const roleNames = [...new Set([...directRoles, ...groupRoleRows].map((r) => r.name))];
  const roleIds = await db
    .select({ id: roles.id })
    .from(roles)
    .where(inArray(roles.name, roleNames));

  const permRows =
    roleIds.length === 0
      ? []
      : await db
          .select({ resource: permissions.resource, action: permissions.action })
          .from(rolePermissions)
          .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
          .where(
            inArray(
              rolePermissions.roleId,
              roleIds.map((r) => r.id),
            ),
          );

  const permissionStrings = [
    ...new Set(permRows.map((p) => `${p.resource}:${p.action}`)),
  ];

  return { roles: roleNames, permissions: permissionStrings };
}

export function hasPermission(userPermissions: string[], required: string): boolean {
  return userPermissions.includes(required);
}

export async function userRequiresMfa(db: Database, userId: string): Promise<boolean> {
  const { roles: roleNames } = await getEffectivePermissions(db, userId);
  if (roleNames.length === 0) return false;
  const roleRows = await db.select().from(roles).where(inArray(roles.name, roleNames));
  return roleRows.some((r) => r.requireMfa);
}
