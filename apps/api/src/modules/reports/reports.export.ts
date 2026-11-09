import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { ReportColumn, ReportResult } from './reports.service';

const isDate = (value: unknown): value is Date => value instanceof Date;

function formatDate(value: Date): string {
  return value.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function displayValue(column: ReportColumn, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (column.type === 'date' && isDate(value)) return formatDate(value);
  if (column.type === 'date') return formatDate(new Date(String(value)));
  if (column.type === 'money') return Number(value).toFixed(2);
  if (column.type === 'qty') return String(Math.round(Number(value) * 1000) / 1000);
  if (column.type === 'percent') return `${Number(value)}%`;
  return String(value);
}

function numericValue(column: ReportColumn, value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (column.type === 'money' || column.type === 'qty' || column.type === 'int' || column.type === 'percent') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function reportToExcel(report: ReportResult, storeName: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Provision Store';
  workbook.created = new Date();
  const sheetName = report.title.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31);
  const sheet = workbook.addWorksheet(sheetName);

  sheet.mergeCells(1, 1, 1, Math.max(report.columns.length, 2));
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `${storeName} — ${report.title}`;
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF111827' } };

  const rangeText = report.range.from
    ? `Period: ${formatDate(new Date(report.range.from))} to ${formatDate(new Date(report.range.to!))}`
    : `Generated: ${new Date().toLocaleString('en-IN')}`;
  sheet.mergeCells(2, 1, 2, Math.max(report.columns.length, 2));
  sheet.getCell(2, 1).value = rangeText;
  sheet.getCell(2, 1).font = { size: 9, color: { argb: 'FF6B7280' } };

  const headerRow = sheet.getRow(4);
  report.columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.label;
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.alignment = { horizontal: column.align ?? 'left', vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
  });
  headerRow.height = 20;
  sheet.views = [{ state: 'frozen', ySplit: 4 }];

  let rowIndex = 5;
  for (const row of report.rows) {
    const excelRow = sheet.getRow(rowIndex);
    report.columns.forEach((column, index) => {
      const cell = excelRow.getCell(index + 1);
      const numeric = numericValue(column, row[column.key]);
      if (column.type === 'date') {
        const raw = row[column.key];
        cell.value = isDate(raw) ? raw : raw ? new Date(String(raw)) : null;
        cell.numFmt = 'dd mmm yyyy';
      } else {
        cell.value = numeric ?? (row[column.key] === null || row[column.key] === undefined ? '' : String(row[column.key]));
        if (column.type === 'money') cell.numFmt = '#,##0.00';
        if (column.type === 'qty') cell.numFmt = '#,##0.###';
        if (column.type === 'percent') cell.numFmt = '0.00"%"';
      }
      cell.alignment = { horizontal: column.align ?? 'left' };
      cell.font = { size: 9 };
      if (rowIndex % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
    });
    rowIndex += 1;
  }

  if (report.totals) {
    const totalRow = sheet.getRow(rowIndex + 1);
    const first = totalRow.getCell(1);
    first.value = 'TOTAL';
    first.font = { bold: true, size: 10 };
    report.columns.forEach((column, index) => {
      const cell = totalRow.getCell(index + 1);
      cell.font = { bold: true, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.alignment = { horizontal: column.align ?? 'left' };
      if (index === 0) return;
      const raw = report.totals?.[column.key];
      if (raw === undefined) return;
      const numeric = numericValue(column, raw);
      cell.value = numeric ?? String(raw);
      if (column.type === 'money') cell.numFmt = '#,##0.00';
      if (column.type === 'qty') cell.numFmt = '#,##0.###';
    });
    rowIndex += 2;
  }

  if (report.summary?.length) {
    rowIndex += 1;
    for (const item of report.summary) {
      const row = sheet.getRow(rowIndex);
      row.getCell(1).value = item.label;
      row.getCell(1).font = { bold: true, size: 10 };
      row.getCell(2).value = typeof item.value === 'number' ? item.value : String(item.value);
      if (typeof item.value === 'number') row.getCell(2).numFmt = '#,##0.00';
      rowIndex += 1;
    }
  }

  report.columns.forEach((column, index) => {
    const lengths = [
      column.label.length,
      ...report.rows.slice(0, 300).map((row) => displayValue(column, row[column.key]).length),
    ];
    sheet.getColumn(index + 1).width = Math.min(42, Math.max(10, Math.max(...lengths) + 2));
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function reportToPdf(report: ReportResult, storeName: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const left = 30;
      const right = pageWidth - 30;
      const usable = right - left;

      doc.font('Helvetica-Bold').fontSize(14).fillColor('#111827').text(`${storeName} — ${report.title}`, left, 30);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#6b7280')
        .text(
          report.range.from
            ? `Period: ${formatDate(new Date(report.range.from))} to ${formatDate(new Date(report.range.to!))}  •  Generated: ${new Date().toLocaleString('en-IN')}`
            : `Generated: ${new Date().toLocaleString('en-IN')}`,
          left,
          46,
        );

      const columns = report.columns;
      const widths = columns.map((column) => {
        if (column.type === 'money' || column.type === 'qty' || column.type === 'int') return 52;
        if (column.type === 'percent') return 40;
        if (column.type === 'date') return 62;
        if (column.key === 'product' || column.key === 'customer' || column.key === 'category') return 110;
        return 74;
      });
      const scale = usable / widths.reduce((a, b) => a + b, 0);
      const finalWidths = widths.map((w) => Math.floor(w * scale));

      const drawHead = (y: number) => {
        doc.rect(left, y, usable, 15).fill('#e2e8f0');
        doc.fillColor('#111827').font('Helvetica-Bold').fontSize(7);
        let x = left;
        columns.forEach((column, index) => {
          doc.text(column.label, x + 3, y + 4.5, {
            width: finalWidths[index]! - 6,
            align: column.align ?? 'left',
            lineBreak: false,
          });
          x += finalWidths[index]!;
        });
        return y + 15;
      };

      let y = drawHead(64);
      doc.font('Helvetica').fontSize(7).fillColor('#111827');

      for (const row of report.rows) {
        if (y > doc.page.height - 55) {
          doc.addPage();
          y = drawHead(30);
          doc.font('Helvetica').fontSize(7).fillColor('#111827');
        }
        let x = left;
        columns.forEach((column, index) => {
          doc.text(displayValue(column, row[column.key]), x + 3, y + 3, {
            width: finalWidths[index]! - 6,
            align: column.align ?? 'left',
            lineBreak: false,
            ellipsis: true,
          });
          x += finalWidths[index]!;
        });
        doc
          .moveTo(left, y + 13)
          .lineTo(right, y + 13)
          .strokeColor('#e5e7eb')
          .lineWidth(0.4)
          .stroke();
        y += 13;
      }

      if (report.totals) {
        if (y > doc.page.height - 55) {
          doc.addPage();
          y = 30;
        }
        doc.rect(left, y, usable, 16).fill('#f1f5f9');
        let x = left;
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#111827');
        columns.forEach((column, index) => {
          const raw = index === 0 ? 'TOTAL' : report.totals?.[column.key];
          const value = index === 0 ? 'TOTAL' : displayValue(column, raw);
          doc.text(value, x + 3, y + 4.5, {
            width: finalWidths[index]! - 6,
            align: column.align ?? 'left',
            lineBreak: false,
          });
          x += finalWidths[index]!;
        });
        y += 22;
      }

      if (report.summary?.length) {
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#111827').text('Summary', left, y);
        y += 12;
        for (const item of report.summary) {
          if (y > doc.page.height - 55) {
            doc.addPage();
            y = 30;
          }
          doc.font('Helvetica').fontSize(8).fillColor('#374151');
          doc.text(item.label, left, y, { width: 160 });
          doc.text(typeof item.value === 'number' ? item.value.toFixed(2) : String(item.value), left + 160, y, {
            width: 100,
            align: 'right',
          });
          y += 12;
        }
      }

      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i += 1) {
        doc.switchToPage(pages.start + i);
        doc
          .font('Helvetica')
          .fontSize(7)
          .fillColor('#9ca3af')
          .text(`Page ${i + 1} of ${pages.count}`, left, doc.page.height - 24, {
            width: usable,
            align: 'right',
            lineBreak: false,
          });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
