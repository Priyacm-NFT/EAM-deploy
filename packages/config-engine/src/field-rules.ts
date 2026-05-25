import { eq, and } from 'drizzle-orm';
import type { Database } from '@eam/db';
import { fieldRules } from '@eam/db';
import {
  applyFieldRules,
  validateRecord,
  type FieldDef,
  type FieldRule,
  type FieldRuleState,
} from './validator.js';

export class FieldRulesService {
  constructor(private readonly db: Database) {}

  async loadRules(
    tenantId: string,
    entityId: string,
    status?: string,
  ): Promise<FieldRule[]> {
    const rows = await this.db
      .select()
      .from(fieldRules)
      .where(and(eq(fieldRules.tenantId, tenantId), eq(fieldRules.entityId, entityId)));

    return rows
      .filter((r) => !r.statusCondition || r.statusCondition === status)
      .map((r) => ({
        fieldKey: r.fieldKey,
        ruleType: r.ruleType,
        conditionExpression: r.conditionExpression,
        roleId: r.roleId,
        statusCondition: r.statusCondition,
      }));
  }

  resolveFieldStates(
    rules: FieldRule[],
    data: Record<string, unknown>,
    userRoleIds: string[],
    userRoleNames?: string[],
  ): Record<string, FieldRuleState> {
    return applyFieldRules(rules, data, userRoleIds, userRoleNames);
  }

  filterResponseData(
    data: Record<string, unknown>,
    states: Record<string, FieldRuleState>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      const state = states[key];
      if (state && !state.visible) continue;
      out[key] = value;
    }
    return out;
  }

  validateWrite(
    fields: FieldDef[],
    rules: FieldRule[],
    data: Record<string, unknown>,
    userRoleIds: string[],
    userRoleNames?: string[],
  ) {
    return validateRecord(fields, rules, data, userRoleIds, userRoleNames);
  }
}

export function enforceFieldRulesOnRecord(
  fields: FieldDef[],
  rules: FieldRule[],
  data: Record<string, unknown>,
  userRoleIds: string[],
  roleIdByName?: Map<string, string>,
): ReturnType<typeof validateRecord> {
  const roleNames = roleIdByName ? [...roleIdByName.keys()] : undefined;
  return validateRecord(fields, rules, data, userRoleIds, roleNames);
}
