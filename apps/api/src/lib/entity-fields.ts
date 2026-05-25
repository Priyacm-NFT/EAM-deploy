import { eq, and, inArray } from 'drizzle-orm';
import { db, fieldDefinitions, roles } from '@eam/db';
import { FieldRulesService } from '@eam/config-engine';
import type { AuthUser } from '@eam/auth';

export async function getUserRoleIds(user: AuthUser): Promise<string[]> {
  if (user.roles.length === 0) return [];
  const roleRows = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.tenantId, user.tenantId), inArray(roles.name, user.roles)));
  return roleRows.map((r) => r.id);
}

export async function applyFieldLevelAccess(
  tenantId: string,
  entityId: string,
  data: Record<string, unknown>,
  user: AuthUser,
  status?: string,
): Promise<Record<string, unknown>> {
  const service = new FieldRulesService(db);
  const rules = await service.loadRules(tenantId, entityId, status);
  const roleIds = await getUserRoleIds(user);
  const states = service.resolveFieldStates(rules, data, roleIds, user.roles);
  return service.filterResponseData(data, states);
}

export async function validateEntityWrite(
  tenantId: string,
  entityId: string,
  data: Record<string, unknown>,
  user: AuthUser,
  status?: string,
) {
  const fields = await db
    .select()
    .from(fieldDefinitions)
    .where(and(eq(fieldDefinitions.tenantId, tenantId), eq(fieldDefinitions.entityId, entityId)));

  const fieldDefs = fields.map((f) => ({
    fieldKey: f.fieldKey,
    isRequiredGlobal: f.isRequiredGlobal,
    fieldType: f.fieldType,
    validationRules: f.validationRules ?? undefined,
  }));

  const service = new FieldRulesService(db);
  const rules = await service.loadRules(tenantId, entityId, status);
  const roleIds = await getUserRoleIds(user);
  return service.validateWrite(fieldDefs, rules, data, roleIds, user.roles);
}
