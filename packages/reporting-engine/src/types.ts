import type { ReportFilter } from './query-builder.js';

export type ReportOutputFormat = 'PDF' | 'XLSX' | 'CSV';

export interface ReportDefinitionBody {
  fields?: string[];
  filters?: ReportFilter[];
  groupBy?: string[];
  orderBy?: { field: string; direction: 'ASC' | 'DESC' }[];
  chartType?: string;
  chartConfig?: Record<string, unknown>;
}

export interface ReportSubjectField {
  key: string;
  label: string;
  type: string;
  aggregatable?: boolean;
  filterable?: boolean;
}

export interface ReportSubjectLike {
  name: string;
  baseQuery?: string;
  availableFields?: ReportSubjectField[];
}

export interface ReportDistribution {
  userIds?: string[];
  roleIds?: string[];
  emails?: string[];
}

export type BiAdapterType = 'POWERBI' | 'QLIK' | 'TABLEAU' | 'COGNOS' | 'BIRT';

export interface ReportRunResult {
  runLogId: string;
  status: 'COMPLETED' | 'SKIPPED' | 'FAILED';
  rowCount: number;
  outputKey?: string;
  downloadUrl?: string;
  error?: string;
}
