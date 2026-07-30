import ExcelJS from 'exceljs';
import { escapeHtml } from './utils';

function safeCellValue(value: unknown) {
  if (value === null || value === undefined) return '';
  return value;
}

async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('تعذر قراءة صورة الشعار.'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function isNumericColumn(rows: Record<string, any>[], key: string) {
  return rows.some((row) => typeof row[key] === 'number' && Number.isFinite(row[key]));
}

export async function exportExcel(filename: string, rows: Record<string, any>[], headers: Record<string,string>) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Nexora Collect';
  workbook.company = 'Nexora';
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet('التقرير', {
    views: [{ rightToLeft: true, showGridLines: false, state: 'frozen', ySplit: 7 }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.15, footer: 0.15 },
    },
  });

  const entries = Object.entries(headers);
  const columnCount = Math.max(entries.length, 1);

  worksheet.mergeCells(1, 1, 3, columnCount);
  worksheet.getRow(1).height = 42;
  worksheet.getRow(2).height = 42;
  worksheet.getRow(3).height = 42;

  const logoUrl = window.location.protocol === 'file:'
    ? new URL('./brand-logo.png', window.location.href).toString()
    : `${window.location.origin}/brand-logo.png`;
  const logoDataUrl = await loadImageDataUrl(logoUrl);
  if (logoDataUrl) {
    const logoId = workbook.addImage({ base64: logoDataUrl, extension: 'png' });
    worksheet.addImage(logoId, {
      tl: { col: Math.max((columnCount - 3.2) / 2, 0), row: 0.1 },
      ext: { width: 290, height: 126 },
      editAs: 'oneCell',
    });
  } else {
    const brandCell = worksheet.getCell(1, 1);
    brandCell.value = 'NEXORA COLLECT | نكسورا للتحصيل';
    brandCell.font = { bold: true, size: 20, color: { argb: 'FF0F766E' } };
    brandCell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' };
  }

  worksheet.mergeCells(5, 1, 5, columnCount);
  const titleCell = worksheet.getCell(5, 1);
  titleCell.value = filename;
  titleCell.font = { bold: true, size: 18, color: { argb: 'FF0F172A' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' };
  worksheet.getRow(5).height = 30;

  worksheet.mergeCells(6, 1, 6, columnCount);
  const metaCell = worksheet.getCell(6, 1);
  metaCell.value = `تاريخ التصدير: ${new Date().toLocaleString('ar-IQ')}   |   عدد السجلات: ${rows.filter((row) => !row.__isTotal).length}`;
  metaCell.font = { size: 10, color: { argb: 'FF64748B' } };
  metaCell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' };

  const headerRowNumber = 7;
  const headerRow = worksheet.getRow(headerRowNumber);
  headerRow.values = entries.map(([, label]) => label);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl', wrapText: true };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF0B5F59' } },
    };
  });

  rows.forEach((sourceRow) => {
    const row = worksheet.addRow(entries.map(([key]) => safeCellValue(sourceRow[key])));
    row.height = sourceRow.__isTotal ? 26 : 22;
    row.eachCell((cell, columnNumber) => {
      const key = entries[columnNumber - 1]?.[0];
      cell.alignment = {
        horizontal: typeof cell.value === 'number' ? 'center' : 'right',
        vertical: 'middle',
        readingOrder: 'rtl',
        wrapText: true,
      };
      if (typeof cell.value === 'number' && Number.isFinite(cell.value)) {
        cell.numFmt = Number.isInteger(cell.value) ? '#,##0;[Red](#,##0);-' : '#,##0.00;[Red](#,##0.00);-';
      }
      if (!sourceRow.__isTotal && key && isNumericColumn(rows, key)) {
        cell.font = { color: { argb: 'FF008000' } };
      }
      if (sourceRow.__isTotal) {
        cell.font = { bold: true, color: { argb: 'FF0F766E' }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFEFF' } };
        cell.border = { top: { style: 'medium', color: { argb: 'FF14B8A6' } } };
      } else if (row.number % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
    });
  });

  worksheet.columns = entries.map(([key, label]) => {
    const maxLength = Math.max(
      String(label).length,
      ...rows.map((row) => String(safeCellValue(row[key])).length),
    );
    return { key, width: Math.min(Math.max(maxLength + 4, 14), 38) };
  });

  const normalRowCount = rows.filter((row) => !row.__isTotal).length;
  if (normalRowCount > 0) {
    worksheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: headerRowNumber + normalRowCount, column: columnCount },
    };
  }

  const lastRow = worksheet.lastRow?.number || headerRowNumber;
  worksheet.pageSetup.printArea = `A1:${worksheet.getColumn(columnCount).letter}${lastRow}`;
  worksheet.headerFooter.oddFooter = `&C${filename} - &P / &N`;

  const output = await workbook.xlsx.writeBuffer();
  const base64 = arrayBufferToBase64(output as ArrayBuffer);
  return window.nexora.export.excel(filename, base64);
}

export function tableHtml(title: string, rows: Record<string, any>[], headers: Record<string,string>, footer = '') {
  const headerKeys = Object.keys(headers);
  const head = Object.values(headers).map((header) => `<th>${escapeHtml(header)}</th>`).join('');
  const regularRows = rows.filter((row) => !row.__isTotal);
  const totalRows = rows.filter((row) => row.__isTotal);
  const renderRow = (row: Record<string, any>, className = '') =>
    `<tr${className ? ` class="${className}"` : ''}>${headerKeys.map((key) => `<td>${escapeHtml(row[key] ?? '')}</td>`).join('')}</tr>`;
  const body = regularRows.map((row) => renderRow(row)).join('');
  const totals = totalRows.length
    ? `<tfoot>${totalRows.map((row) => renderRow(row, 'report-total-row')).join('')}</tfoot>`
    : '';

  return `<h1>${escapeHtml(title)}</h1><div class="meta"><span>تاريخ الإصدار: ${new Date().toLocaleString('ar-IQ')}</span><span>عدد السجلات: ${regularRows.length}</span></div><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${totals}</table>${footer}`;
}
