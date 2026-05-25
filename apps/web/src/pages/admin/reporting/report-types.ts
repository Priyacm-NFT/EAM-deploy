export interface ReportSubject {
  id: string;
  name: string;
  label: string;
  availableFields: { key: string; label: string; type: string; filterable?: boolean }[];
}

export interface ReportDefinitionRow {
  id: string;
  name: string;
  subjectId: string;
  definition: {
    fields?: string[];
    filters?: { field: string; operator: string; value?: unknown }[];
    chartType?: string;
  };
  isPublic: boolean;
}

export interface ReportScheduleRow {
  id: string;
  reportId: string;
  cronExpr: string;
  outputFormat: string;
  distribution: { emails?: string[] };
  skipIfEmpty: boolean;
  isActive: boolean;
  lastRunAt?: string;
}

export interface ReportRunRow {
  id: string;
  reportId: string;
  status: string;
  rowCount?: number;
  outputKey?: string;
  error?: string;
  startedAt: string;
}

export interface BiConnectionRow {
  id: string;
  adapterType: string;
  name: string;
  config: Record<string, unknown>;
  isActive: boolean;
  lastTestStatus?: string;
}
