import * as XLSX from 'xlsx';
import { escapeHtml } from './utils';

export async function exportExcel(filename: string, rows: Record<string, any>[], headers: Record<string,string>) {
  const normalized = rows.map((row) => Object.fromEntries(Object.entries(headers).map(([key,label]) => [label, row[key] ?? ''])));
  const ws = XLSX.utils.json_to_sheet(normalized);
  ws['!dir'] = 'rtl';
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'التقرير');
  const base64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
  return window.nexora.export.excel(filename, base64);
}

export function tableHtml(title: string, rows: Record<string, any>[], headers: Record<string,string>, footer = '') {
  const head = Object.values(headers).map((h)=>`<th>${escapeHtml(h)}</th>`).join('');
  const body = rows.map((r)=>`<tr>${Object.keys(headers).map((k)=>`<td>${escapeHtml(r[k] ?? '')}</td>`).join('')}</tr>`).join('');
  return `<h1>${escapeHtml(title)}</h1><div class="meta"><span>تاريخ الإصدار: ${new Date().toLocaleString('ar-IQ')}</span><span>عدد السجلات: ${rows.length}</span></div><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${footer}`;
}
