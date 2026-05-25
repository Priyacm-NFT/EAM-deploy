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

const ALLOWED_FIELDS = new Set([
  'wo_num',
  'status',
  'sr_num',
  'asset_num',
  'site_num',
  'tenant_id',
]);

export interface SafeQuery {
  sql: string;
  params: unknown[];
}

export class ReportQueryBuilder {
  buildQuery(
    baseTable: string,
    tenantId: string,
    filters: ReportFilter[] = [],
  ): SafeQuery {
    const params: unknown[] = [tenantId];
    let sql = `SELECT * FROM ${baseTable} WHERE tenant_id = $1`;
    let paramIndex = 2;

    for (const filter of filters) {
      if (!ALLOWED_FIELDS.has(filter.field)) {
        throw new Error(`Invalid filter field: ${filter.field}`);
      }
      if (typeof filter.value === 'string' && /[;'"]|--/i.test(filter.value)) {
        throw new Error('Invalid filter value');
      }
      switch (filter.operator) {
        case 'EQUALS':
          sql += ` AND ${filter.field} = $${paramIndex}`;
          params.push(filter.value);
          paramIndex++;
          break;
        case 'CONTAINS':
          sql += ` AND ${filter.field} ILIKE $${paramIndex}`;
          params.push(`%${filter.value}%`);
          paramIndex++;
          break;
        default:
          break;
      }
    }

    return { sql, params };
  }
}
