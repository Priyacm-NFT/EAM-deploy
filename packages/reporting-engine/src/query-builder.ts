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

const ALLOWED_FIELDS = new Set([
  'wo_num',
  'status',
  'sr_num',
  'asset_num',
  'site_num',
  'tenant_id',
  'description',
  'priority',
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
    if (!ALLOWED_TABLES.has(baseTable)) {
      throw new Error(`Invalid base table: ${baseTable}`);
    }

    const selectFields =
      options.fields?.length &&
      options.fields.every((f) => ALLOWED_FIELDS.has(f))
        ? options.fields.join(', ')
        : '*';

    const params: unknown[] = [tenantId];
    let sql = `SELECT ${selectFields} FROM ${baseTable} WHERE tenant_id = $1`;
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
      sql += sql.includes(' ORDER BY ') ? `, ${order.field} ${dir}` : ` ORDER BY ${order.field} ${dir}`;
    }

    return { sql, params };
  }
}
