import React, { ReactNode } from 'react';
import { Empty } from './ui';

type Column<T> = { key: string; header: string; render?: (row:T)=>ReactNode; className?: string };
export function DataTable<T extends Record<string, any>>({ columns, rows, keyField='id' }: { columns: Column<T>[]; rows: T[]; keyField?: string }) {
  if (!rows.length) return <Empty/>;
  return <div className="table-wrap"><table className="data-table"><thead><tr>{columns.map(c=><th key={c.key}>{c.header}</th>)}</tr></thead><tbody>
    {rows.map((r,i)=><tr className={r.__isTotal ? 'data-table-total-row' : undefined} key={r[keyField] ?? i}>{columns.map(c=><td className={c.className} key={c.key}>{c.render ? c.render(r) : String(r[c.key] ?? '')}</td>)}</tr>)}
  </tbody></table></div>;
}
