import ExcelJS from 'exceljs';
import { eq } from 'drizzle-orm';
import type { Database } from '@eam/db';
import { assets, serviceRequests, workOrders } from '@eam/db';

export type ExportFormat = 'csv' | 'json' | 'xlsx';
export type ExportEntityType = 'assets' | 'service_requests' | 'work_orders';

const ENTITY_TABLES = {
  assets,
  service_requests: serviceRequests,
  work_orders: workOrders,
} as const;

export async function fetchExportRows(
  db: Database,
  tenantId: string,
  entityType: ExportEntityType,
  limit = 10_000,
): Promise<Record<string, unknown>[]> {
  const table = ENTITY_TABLES[entityType];
  const rows = await db.select().from(table).where(eq(table.tenantId, tenantId)).limit(limit);
  return rows as Record<string, unknown>[];
}

function escapeCsvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]!);
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(',')),
  ];
  return lines.join('\n');
}

export function rowsToJson(rows: Record<string, unknown>[]): string {
  return JSON.stringify(rows, null, 2);
}

export async function rowsToXlsx(rows: Record<string, unknown>[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('export');
  if (rows.length === 0) {
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
  const headers = Object.keys(rows[0]!);
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(headers.map((h) => row[h]));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function formatBulkExport(
  rows: Record<string, unknown>[],
  format: ExportFormat,
): Promise<{ contentType: string; body: string | Buffer; filename: string }> {
  switch (format) {
    case 'csv':
      return {
        contentType: 'text/csv; charset=utf-8',
        body: rowsToCsv(rows),
        filename: 'export.csv',
      };
    case 'json':
      return {
        contentType: 'application/json',
        body: rowsToJson(rows),
        filename: 'export.json',
      };
    case 'xlsx':
      return {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: await rowsToXlsx(rows),
        filename: 'export.xlsx',
      };
    default:
      throw new Error(`Unsupported export format: ${format satisfies never}`);
  }
}
