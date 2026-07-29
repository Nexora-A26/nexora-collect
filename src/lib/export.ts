import * as XLSX from 'xlsx';
import { escapeHtml } from './utils';

function safeCellValue(value: unknown) {
  if (value === null || value === undefined) return '';
  return value;
}

export async function exportExcel(filename: string, rows: Record<string, any>[], headers: Record<string,string>) {
  const headerEntries = Object.entries(headers);
  const aoa: unknown[][] = [
    headerEntries.map(([, label]) => label),
    ...rows.map((row) => headerEntries.map(([key]) => safeCellValue(row[key]))),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!dir'] = 'rtl';

  // Keep real numbers as numbers in Excel and apply a readable thousands format.
  for (let rowIndex = 1; rowIndex < aoa.length; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < headerEntries.length; columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = ws[address];
      if (cell && typeof cell.v === 'number' && Number.isFinite(cell.v)) {
        cell.z = Number.isInteger(cell.v) ? '#,##0' : '#,##0.00';
      }
    }
  }

  // Make columns wide enough for Arabic labels and exported values.
  ws['!cols'] = headerEntries.map(([, label], columnIndex) => {
    const maxLength = Math.max(
      String(label).length,
      ...rows.map((row) => String(safeCellValue(row[headerEntries[columnIndex][0]])).length),
    );
    return { wch: Math.min(Math.max(maxLength + 3, 12), 35) };
  });

  // Filter data rows only. The final total row remains visible at the bottom.
  const normalRowCount = rows.filter((row) => !row.__isTotal).length;
  if (normalRowCount > 0) {
    ws['!autofilter'] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: normalRowCount, c: headerEntries.length - 1 } }),
    };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'التقرير');
  const base64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
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
