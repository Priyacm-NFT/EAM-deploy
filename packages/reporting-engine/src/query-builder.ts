export type FilterOperator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'CONTAINS'
  | 'STARTS_WITH'
  | 'IN'
  | 'BETWEEN'
  | 'IS_NULL';

export interface ReportFilter {
  field: string;
  operator: FilterOperator;
  value?: unknown;
}

export const ALLOWED_TABLES = new Set(['work_orders', 'service_requests', 'assets']);

// Friendly name aliases → real table names
const TABLE_ALIASES: Record<string, string> = {
  wo_backlog:       'work_orders',
  wo_cost_summary:  'work_orders',
  overdue_pms:      'work_orders',
  asset_availability: 'assets',
  wos:              'work_orders',
  srs:              'service_requests',
};

const ALLOWED_FIELDS = new Set([
  // shared
  'tenant_id', 'site_num', 'org_id', 'site_id',
  // work orders
  'wo_num', 'status', 'priority', 'description', 'type',
  'assigned_to_user_id', 'asset_id', 'location_id', 'sr_id', 'pm_id',
  'target_start_date', 'target_finish_date', 'actual_start_date', 'actual_finish_date',
  'labor_cost', 'material_cost', 'service_cost', 'tool_cost', 'total_cost',
  'downtime_hours', 'failure_problem_id', 'failure_cause_id', 'failure_remedy_id',
  'created_at', 'updated_at',
  // service requests
  'sr_num', 'category', 'requester_id', 'channel',
  'sla_target_hours', 'sla_due_at', 'sla_breached', 'closed_at', 'resolved_at',
  // assets
  'asset_num', 'criticality', 'manufacturer', 'model', 'serial_num',
  'install_date', 'warranty_expiry', 'purchase_cost', 'replacement_cost',
  'class_id', 'parent_asset_id',
]);

export interface SafeQuery {
  sql: string;
  params: unknown[];
}

export interface BuildQueryOptions {
  fields?: string[];
  filters?: ReportFilter[];
  groupBy?: string[];
  orderBy?: { field: string; direction: 'ASC' | 'DESC' }[];
}

function assertSafeField(field: string): void {
  if (!ALLOWED_FIELDS.has(field)) {
    throw new Error(`Invalid filter field: ${field}`);
  }
}

function assertSafeValue(value: unknown): void {
  if (typeof value === 'string' && /[;'"]|--/i.test(value)) {
    throw new Error('Invalid filter value');
  }
}

export class ReportQueryBuilder {
  buildQuery(
    baseTable: string,
    tenantId: string,
    options: BuildQueryOptions = {},
  ): SafeQuery {
    // Resolve alias (e.g. wo_backlog → work_orders)
    const resolvedTable = TABLE_ALIASES[baseTable] ?? baseTable;

    if (!ALLOWED_TABLES.has(resolvedTable)) {
      throw new Error(`Invalid base table: ${baseTable}`);
    }

    const selectFields =
      options.fields?.length &&
      options.fields.every((f) => ALLOWED_FIELDS.has(f))
        ? options.fields.join(', ')
        : '*';

    const params: unknown[] = [tenantId];
    let sql = `SELECT ${selectFields} FROM ${resolvedTable} WHERE tenant_id = $1`;
    let paramIndex = 2;

    for (const filter of options.filters ?? []) {
      assertSafeField(filter.field);
      if (filter.value !== undefined && filter.value !== null) {
        assertSafeValue(filter.value);
      }

      switch (filter.operator) {
        case 'EQUALS':
          sql += ` AND ${filter.field} = $${paramIndex}`;
          params.push(filter.value);
          paramIndex++;
          break;
        case 'NOT_EQUALS':
          sql += ` AND ${filter.field} <> $${paramIndex}`;
          params.push(filter.value);
          paramIndex++;
          break;
        case 'CONTAINS':
          sql += ` AND ${filter.field} ILIKE $${paramIndex}`;
          params.push(`%${filter.value}%`);
          paramIndex++;
          break;
        case 'STARTS_WITH':
          sql += ` AND ${filter.field} ILIKE $${paramIndex}`;
          params.push(`${filter.value}%`);
          paramIndex++;
          break;
        case 'IN': {
          const values = Array.isArray(filter.value) ? filter.value : [filter.value];
          if (values.length === 0) throw new Error('IN filter requires values');
          for (const v of values) assertSafeValue(v);
          const placeholders = values.map((_, i) => `$${paramIndex + i}`).join(', ');
          sql += ` AND ${filter.field} IN (${placeholders})`;
          params.push(...values);
          paramIndex += values.length;
          break;
        }
        case 'BETWEEN': {
          const range = filter.value as { from?: unknown; to?: unknown };
          if (range?.from !== undefined) {
            sql += ` AND ${filter.field} >= $${paramIndex}`;
            params.push(range.from);
            paramIndex++;
          }
          if (range?.to !== undefined) {
            sql += ` AND ${filter.field} <= $${paramIndex}`;
            params.push(range.to);
            paramIndex++;
          }
          break;
        }
        case 'IS_NULL':
          sql += ` AND ${filter.field} IS NULL`;
          break;
        default:
          break;
      }
    }

    if (options.groupBy?.length) {
      for (const field of options.groupBy) assertSafeField(field);
      sql += ` GROUP BY ${options.groupBy.join(', ')}`;
    }

    for (const order of options.orderBy ?? []) {
      assertSafeField(order.field);
      const dir = order.direction === 'DESC' ? 'DESC' : 'ASC';
      sql += sql.includes(' ORDER BY ')
        ? `, ${order.field} ${dir}`
        : ` ORDER BY ${order.field} ${dir}`;
    }

    return { sql, params };
  }
}