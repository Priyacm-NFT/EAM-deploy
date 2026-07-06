import { eq, inArray } from 'drizzle-orm';
import type { Database } from '@eam/db';
import { userGroups, groups, groupPermissions, permissions, groupRoles, roles } from '@eam/db';

// FIX: rebuilt to resolve permissions/scope/MFA directly from the user's
// Security Groups, matching IBM Maximo's model: "A security group grants
// access to members of the group to start centers, applications, Work
// Centers, and object structures." There is no role hop anymore — Role
// (groupRoles/roles) is only used elsewhere for display purposes (a job
// title next to the user's name), never consulted here.
//
// Maximo's group-combination rule for multiple memberships: independent
// groups "add together but do not combine... you get the highest
// privileges available from each independent group." We mirror that as a
// straight union — permissions from every group the user belongs to are
// all granted (OR'd), never intersected.
export interface EffectiveScope {
  unrestricted: boolean;
  organisationIds: string[];
  siteIds: string[];
  locationIds: string[];
}

export async function getEffectivePermissions(
  db: Database,
  userId: string,
): Promise<{ groupNames: string[]; permissions: string[]; scope: EffectiveScope }> {
  const userGroupRows = await db
    .select({
      groupId: groups.id,
      name: groups.name,
      scopeType: groups.scopeType,
      scopeIds: groups.scopeIds,
    })
    .from(userGroups)
    .innerJoin(groups, eq(userGroups.groupId, groups.id))
    .where(eq(userGroups.userId, userId));

  const groupNames = [...new Set(userGroupRows.map((g) => g.name))];
  const groupIds = [...new Set(userGroupRows.map((g) => g.groupId))];

  const permRows =
    groupIds.length === 0
      ? []
      : await db
          .select({ groupId: groupPermissions.groupId, resource: permissions.resource, action: permissions.action })
          .from(groupPermissions)
          .innerJoin(permissions, eq(groupPermissions.permissionId, permissions.id))
          .where(inArray(groupPermissions.groupId, groupIds));

  const permissionStrings = [
    ...new Set(permRows.map((p) => `${p.resource}:${p.action}`)),
  ];

  // FIX: a group with zero direct permission grants must NOT be allowed
  // to contribute to the scope union — and in particular must not be
  // allowed to flip the whole user "unrestricted" just because its own
  // scopeType happens to default to ALL. Only a group that actually
  // grants at least one permission gets a say in the scope union.
  const groupIdsWithPermissions = new Set(permRows.map((p) => p.groupId));
  const scopeRelevantRows = userGroupRows.filter((g) => groupIdsWithPermissions.has(g.groupId));

  const scope = computeEffectiveScope(scopeRelevantRows);

  return { groupNames, permissions: permissionStrings, scope };
}

function computeEffectiveScope(
  rows: { scopeType: 'ALL' | 'ORGANISATION' | 'SITE' | 'LOCATION'; scopeIds: string[] | null }[],
): EffectiveScope {
  // FIX: no permission-granting group at all (e.g. a brand-new user only
  // in "All Users") means no data access scope to speak of — fully
  // restricted is the safe default, matching "no permissions" already
  // meaning "can't read anything" upstream of this.
  if (rows.length === 0) {
    return { unrestricted: false, organisationIds: [], siteIds: [], locationIds: [] };
  }
  // Same union rule as permissions — one unrestricted ("Authorize Group
  // for All Sites?") group membership makes the whole user unrestricted,
  // matching Maximo's "independent groups add together; you get the
  // highest privileges available from each." This now only considers
  // groups that actually grant permissions (filtered above), so a
  // permission-less ALL-scoped group can no longer trigger this branch.
  if (rows.some((r) => r.scopeType === 'ALL')) {
    return { unrestricted: true, organisationIds: [], siteIds: [], locationIds: [] };
  }
  const organisationIds = new Set<string>();
  const siteIds = new Set<string>();
  const locationIds = new Set<string>();
  for (const r of rows) {
    for (const id of r.scopeIds ?? []) {
      if (r.scopeType === 'ORGANISATION') organisationIds.add(id);
      else if (r.scopeType === 'SITE') siteIds.add(id);
      else if (r.scopeType === 'LOCATION') locationIds.add(id);
    }
  }
  return {
    unrestricted: false,
    organisationIds: [...organisationIds],
    siteIds: [...siteIds],
    locationIds: [...locationIds],
  };
}

export function hasPermission(userPermissions: string[], required: string): boolean {
  return userPermissions.includes(required);
}

// FIX: MFA requirement now comes straight off the user's groups, not via
// a role join — matches Maximo's "stricter login requirement" living on
// the Security Group itself.
export async function userRequiresMfa(db: Database, userId: string): Promise<boolean> {
  const rows = await db
    .select({ requireMfa: groups.requireMfa })
    .from(userGroups)
    .innerJoin(groups, eq(userGroups.groupId, groups.id))
    .where(eq(userGroups.userId, userId));

  return rows.some((r) => r.requireMfa);
}

// FIX: kept as a separate, optional lookup for UI display only — "what
// job titles does this user hold" (e.g. shown as a badge on their
// profile). This intentionally does NOT feed into permissions or scope
// anywhere; it's the Maximo-style descriptive Role, not a security
// concept. A user's roles come from the role labels attached to their
// groups (groupRoles), unioned the same way group memberships are.
export async function getDisplayRoles(db: Database, userId: string): Promise<string[]> {
  const rows = await db
    .select({ name: roles.name })
    .from(userGroups)
    .innerJoin(groupRoles, eq(userGroups.groupId, groupRoles.groupId))
    .innerJoin(roles, eq(groupRoles.roleId, roles.id))
    .where(eq(userGroups.userId, userId));

  return [...new Set(rows.map((r) => r.name))];
}
