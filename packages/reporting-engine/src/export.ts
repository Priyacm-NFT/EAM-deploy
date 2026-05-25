import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

function escapeCsvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(rows: Record<string, unknown>[], reportName?: string): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]!);
  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(',')),
  ];
  if (reportName) lines.unshift(`# ${reportName}`);
  return lines.join('\n');
}

export async function rowsToXlsx(
  rows: Record<string, unknown>[],
  reportName?: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(reportName?.slice(0, 31) ?? 'Report');
  if (rows.length === 0) {
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
  const headers = Object.keys(rows[0]!);
  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true };
  for (const row of rows) {
    sheet.addRow(headers.map((h) => row[h]));
  }
  sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + headers.length)}${rows.length + 1}` };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function rowsToPdf(
  rows: Record<string, unknown>[],
  reportName: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const date = new Date().toISOString().slice(0, 10);
    doc.fontSize(14).text(reportName, { align: 'center' });
    doc.fontSize(9).text(`Generated ${date}`, { align: 'center' });
    doc.moveDown();

    if (rows.length === 0) {
      doc.fontSize(10).text('No data');
      doc.end();
      return;
    }

    const headers = Object.keys(rows[0]!);
    const colWidth = Math.min(120, (doc.page.width - 80) / headers.length);
    let y = doc.y;

    const drawRow = (cells: string[], bold = false) => {
      let x = 40;
      if (bold) doc.font('Helvetica-Bold');
      else doc.font('Helvetica');
      for (const cell of cells) {
        doc.fontSize(8).text(cell.slice(0, 40), x, y, { width: colWidth, lineBreak: false });
        x += colWidth;
      }
      y += 14;
      if (y > doc.page.height - 60) {
        doc.addPage();
        y = 40;
      }
    };

    drawRow(headers, true);
    for (const row of rows) {
      drawRow(headers.map((h) => String(row[h] ?? '')));
    }

    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).text(
        `${reportName} — Page ${i + 1} of ${pages.count}`,
        40,
        doc.page.height - 30,
        { align: 'center', width: doc.page.width - 80 },
      );
    }

    doc.end();
  });
}

export async function formatReportOutput(
  rows: Record<string, unknown>[],
  format: ExportFormat,
  reportName: string,
): Promise<{ contentType: string; body: Buffer | string; extension: string }> {
  switch (format) {
    case 'csv':
      return {
        contentType: 'text/csv; charset=utf-8',
        body: rowsToCsv(rows, reportName),
        extension: 'csv',
      };
    case 'xlsx':
      return {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: await rowsToXlsx(rows, reportName),
        extension: 'xlsx',
      };
    case 'pdf':
      return {
        contentType: 'application/pdf',
        body: await rowsToPdf(rows, reportName),
        extension: 'pdf',
      };
    default:
      throw new Error(`Unsupported format: ${format satisfies never}`);
  }
}

export function outputFormatToExport(format: string): ExportFormat {
  const f = format.toUpperCase();
  if (f === 'PDF') return 'pdf';
  if (f === 'XLSX') return 'xlsx';
  if (f === 'CSV') return 'csv';
  throw new Error(`Unsupported output format: ${format}`);
}
