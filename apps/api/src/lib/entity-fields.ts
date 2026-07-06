import { eq, and, inArray } from 'drizzle-orm';
import { db, fieldDefinitions, entityDefinitions, roles } from '@eam/db';
import { FieldRulesService, type FieldDef } from '@eam/config-engine';
import type { AuthUser } from '@eam/auth';

type FieldDefinitionRow = typeof fieldDefinitions.$inferSelect;

export function toFieldDefs(fields: FieldDefinitionRow[]): FieldDef[] {
  return fields.map((f) => ({
    fieldKey: f.fieldKey,
    isRequiredGlobal: f.isRequiredGlobal,
    fieldType: f.fieldType,
    validationRules: f.validationRules ?? undefined,
  }));
}

export async function validateCustomFields(
  tenantId: string,
  entityName: string,
  data: Record<string, unknown>,
  userRoleNames: string[],
  currentStatus?: string,
): Promise<{ valid: boolean; errors: Array<{ field_key: string; message: string }> }> {
  const [entity] = await db
    .select()
    .from(entityDefinitions)
    .where(and(eq(entityDefinitions.tenantId, tenantId), eq(entityDefinitions.name, entityName)))
    .limit(1);
  if (!entity) return { valid: true, errors: [] };

  const fields = await db
    .select()
    .from(fieldDefinitions)
    .where(
      and(
        eq(fieldDefinitions.entityId, entity.id),
        eq(fieldDefinitions.tenantId, tenantId),
        eq(fieldDefinitions.isActive, true),
      ),
    );

  const service = new FieldRulesService(db);
  const rules = await service.loadRules(tenantId, entity.id, currentStatus);
  return service.validateWrite(toFieldDefs(fields), rules, data, userRoleNames);
}

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

  const fieldDefs = toFieldDefs(fields);

  const service = new FieldRulesService(db);
  const rules = await service.loadRules(tenantId, entityId, status);
  const roleIds = await getUserRoleIds(user);
  return service.validateWrite(fieldDefs, rules, data, roleIds, user.roles);
}
