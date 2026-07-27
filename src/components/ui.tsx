import React, { FormEvent, ReactNode } from 'react';
import { AlertTriangle, Loader2, Search, X } from 'lucide-react';
import { cx } from '../lib/utils';

export function Button({ children, variant = 'primary', size = 'md', loading, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary'|'secondary'|'danger'|'ghost'|'success'; size?: 'sm'|'md'; loading?: boolean }) {
  return <button className={cx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className)} disabled={loading || props.disabled} {...props}>
    {loading && <Loader2 size={16} className="spin" />}{children}
  </button>;
}

export function Input({ label, error, hint, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string; hint?: string }) {
  return <label className="field">
    {label && <span className="field-label">{label}</span>}
    <input className={cx('input', error && 'input-error')} {...props} />
    {hint && <small className="field-hint">{hint}</small>}
    {error && <small className="field-error">{error}</small>}
  </label>;
}

export function Select({ label, children, error, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string }) {
  return <label className="field">
    {label && <span className="field-label">{label}</span>}
    <select className={cx('input', error && 'input-error')} {...props}>{children}</select>
    {error && <small className="field-error">{error}</small>}
  </label>;
}

export function Textarea({ label, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return <label className="field">
    {label && <span className="field-label">{label}</span>}
    <textarea className="input textarea" {...props} />
  </label>;
}

export function Modal({ open, title, children, onClose, width = 720 }: { open: boolean; title: string; children: ReactNode; onClose(): void; width?: number }) {
  if (!open) return null;
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <section className="modal" style={{ maxWidth: width }}>
      <header className="modal-header"><h2>{title}</h2><button className="icon-btn" onClick={onClose}><X size={20}/></button></header>
      <div className="modal-body">{children}</div>
    </section>
  </div>;
}

export function Confirm({ open, title, message, danger, onCancel, onConfirm, loading }: { open: boolean; title: string; message: string; danger?: boolean; onCancel(): void; onConfirm(): void; loading?: boolean }) {
  return <Modal open={open} title={title} onClose={onCancel} width={470}>
    <div className="confirm-body"><AlertTriangle size={40}/><p>{message}</p></div>
    <div className="modal-actions"><Button variant="secondary" onClick={onCancel}>إلغاء</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>تأكيد</Button></div>
  </Modal>;
}

export function SearchInput({ value, onChange, placeholder = 'بحث...' }: { value: string; onChange(value: string): void; placeholder?: string }) {
  return <div className="search-box"><Search size={18}/><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}/></div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return <div className="page-header"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div><div className="page-actions">{actions}</div></div>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('card', className)}>{children}</section>;
}

export function Empty({ title = 'لا توجد بيانات', message = 'لم تتم إضافة أي سجلات بعد.' }: { title?: string; message?: string }) {
  return <div className="empty"><div className="empty-icon">∅</div><strong>{title}</strong><span>{message}</span></div>;
}

export function Loading() {
  return <div className="loading"><Loader2 className="spin" size={28}/><span>جاري التحميل...</span></div>;
}

export function ErrorBox({ message }: { message: string }) { return <div className="error-box">{message}</div>; }

export function Form({ onSubmit, children }: { onSubmit(): Promise<void> | void; children: ReactNode }) {
  return <form onSubmit={(e: FormEvent) => { e.preventDefault(); void onSubmit(); }}>{children}</form>;
}

export function StatusBadge({ status }: { status: string }) {
  const labels: Record<string,string> = { active:'فعال',inactive:'متوقف',unpaid:'غير مدفوع',partial:'جزئي',paid:'مدفوع',overdue:'متأخر',cancelled:'ملغى' };
  return <span className={cx('badge', `badge-${status}`)}>{labels[status] || status}</span>;
}
