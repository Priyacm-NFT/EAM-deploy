import { and, eq } from 'drizzle-orm';
import type { Database } from '@eam/db';
import { users, roles, groups, userGroups, groupRoles } from '@eam/db';
import { deduplicateRecipients, type DistributionRule } from './recipients.js';

export async function resolveDistributionRecipients(
  db: Database,
  tenantId: string,
  rules: DistributionRule[],
  payload: Record<string, unknown>,
): Promise<Array<{ userId?: string; email: string }>> {
  const recipients: Array<{ userId?: string; email?: string }> = [];

  for (const rule of rules) {
    switch (rule.type) {
      case 'STATIC_USER': {
        const [u] = await db
          .select({ userId: users.id, email: users.email })
          .from(users)
          .where(and(eq(users.id, rule.value), eq(users.tenantId, tenantId), eq(users.isActive, true)))
          .limit(1);
        if (u) recipients.push(u);
        break;
      }
      case 'STATIC_EMAIL':
      // CC / BCC are static email addresses — resolve identically to STATIC_EMAIL
      // The role (cc/bcc) is communicated via the rule.type in splitRecipientsByRole()
      case 'CC':
      case 'BCC':
        recipients.push({ email: rule.value });
        break;

      case 'ROLE': {
        const rows = await db
          .select({ userId: users.id, email: users.email })
          .from(userGroups)
          .innerJoin(users, eq(userGroups.userId, users.id))
          .innerJoin(groups, eq(userGroups.groupId, groups.id))
          .innerJoin(groupRoles, eq(userGroups.groupId, groupRoles.groupId))
          .innerJoin(roles, eq(groupRoles.roleId, roles.id))
          .where(
            and(
              eq(roles.tenantId, tenantId),
              eq(roles.name, rule.value),
              eq(users.isActive, true),
            ),
          );
        recipients.push(...rows);
        break;
      }
      case 'GROUP': {
        const rows = await db
          .select({ userId: users.id, email: users.email })
          .from(userGroups)
          .innerJoin(users, eq(userGroups.userId, users.id))
          .innerJoin(groups, eq(userGroups.groupId, groups.id))
          .where(
            and(
              eq(groups.tenantId, tenantId),
              eq(groups.name, rule.value),
              eq(users.isActive, true),
            ),
          );
        recipients.push(...rows);
        break;
      }

      // ── P0-8: AD/LDAP group distribution ──────────────────────────────────────
      // Resolves members of an Active Directory / LDAP group by matching the
      // group name against EAM groups whose name starts with 'AD:' or 'LDAP:'.
      // This lets AD-synced groups (e.g. "AD:Maintenance-Supervisors") be used
      // as notification distribution targets without a separate resolver.
      case 'AD_GROUP': {
        // Try exact match on group name first, then strip the AD:/LDAP: prefix
        const groupName = rule.value.replace(/^(AD:|LDAP:)/i, '');
        const rows = await db
          .select({ userId: users.id, email: users.email })
          .from(userGroups)
          .innerJoin(users, eq(userGroups.userId, users.id))
          .innerJoin(groups, eq(userGroups.groupId, groups.id))
          .where(
            and(
              eq(groups.tenantId, tenantId),
              eq(groups.name, groupName),
              eq(users.isActive, true),
            ),
          );
        // If no exact match, try with the prefix intact
        if (rows.length === 0) {
          const rowsWithPrefix = await db
            .select({ userId: users.id, email: users.email })
            .from(userGroups)
            .innerJoin(users, eq(userGroups.userId, users.id))
            .innerJoin(groups, eq(userGroups.groupId, groups.id))
            .where(
              and(
                eq(groups.tenantId, tenantId),
                eq(groups.name, rule.value),
                eq(users.isActive, true),
              ),
            );
          recipients.push(...rowsWithPrefix);
        } else {
          recipients.push(...rows);
        }
        break;
      }

      case 'FIELD': {
        const ctx = payload.context as Record<string, unknown> | undefined;
        const fieldValue = payload[rule.value] ?? ctx?.[rule.value];
        if (typeof fieldValue === 'string') {
          const [u] = await db
            .select({ userId: users.id, email: users.email })
            .from(users)
            .where(and(eq(users.id, fieldValue), eq(users.tenantId, tenantId)))
            .limit(1);
          if (u) recipients.push(u);
        }
        break;
      }
    }
  }

  // Return all recipients that have at least an email.
  // userId is optional — STATIC_EMAIL, CC, and BCC don't have a userId.
  return deduplicateRecipients(recipients).filter(
    (r): r is { userId?: string; email: string } => Boolean(r.email),
  );
}
