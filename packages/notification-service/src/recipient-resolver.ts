import { and, eq } from 'drizzle-orm';
import type { Database } from '@eam/db';
import { users, roles, userRoles, groups, userGroups } from '@eam/db';
import { deduplicateRecipients, type DistributionRule } from './recipients.js';

export async function resolveDistributionRecipients(
  db: Database,
  tenantId: string,
  rules: DistributionRule[],
  payload: Record<string, unknown>,
): Promise<Array<{ userId: string; email: string }>> {
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
        recipients.push({ email: rule.value });
        break;
      case 'ROLE': {
        const rows = await db
          .select({ userId: users.id, email: users.email })
          .from(userRoles)
          .innerJoin(users, eq(userRoles.userId, users.id))
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
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

  return deduplicateRecipients(recipients).filter(
    (r): r is { userId: string; email: string } => Boolean(r.userId && r.email),
  );
}
