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
    biNote?: string;
  };
  isPublic: boolean;
  version?: number;
  updatedAt?: string;
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

export interface ReportVersionRow {
  id: string;
  reportId: string;
  version: number;
  definition: Record<string, unknown>;
  changedBy: string | null;
  changeNote: string | null;
  createdAt: string;
}

export interface ReportFavouriteRow {
  id: string;
  reportId: string;
  userId: string;
  pinned: boolean;
  createdAt: string;
}

export interface BiPermissionMappingRow {
  id: string;
  connectionId: string;
  eamRole: string;
  biGroup: string;
  biWorkspaceId: string | null;
  createdAt: string;
}
