import type { FilterOperator, ReportFilter } from '@eam/reporting-engine';

const FILTER_OPERATORS: readonly FilterOperator[] = [
  'EQUALS',
  'NOT_EQUALS',
  'CONTAINS',
  'STARTS_WITH',
  'IN',
  'BETWEEN',
  'IS_NULL',
];

function isFilterOperator(operator: string): operator is FilterOperator {
  return (FILTER_OPERATORS as readonly string[]).includes(operator);
}

export function parseReportFilters(
  filters: Array<{ field: string; operator: string; value?: unknown }> | undefined,
): ReportFilter[] {
  if (!filters?.length) return [];

  const parsed: ReportFilter[] = [];
  for (const filter of filters) {
    if (!isFilterOperator(filter.operator)) {
      throw new Error(`Unsupported filter operator: ${filter.operator}`);
    }
    parsed.push({
      field: filter.field,
      operator: filter.operator,
      value: filter.value,
    });
  }
  return parsed;
}
