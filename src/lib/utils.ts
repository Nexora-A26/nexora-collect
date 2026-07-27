export const today = () => new Date().toISOString().slice(0, 10);

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function number(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export const paymentLabels: Record<string, string> = {
  cash: 'نقداً',
  bank: 'تحويل مصرفي',
  card: 'بطاقة',
  cheque: 'شيك',
  other: 'أخرى',
};

export const statusLabels: Record<string, string> = {
  active: 'فعال',
  inactive: 'متوقف',
  unpaid: 'غير مدفوع',
  partial: 'مدفوع جزئياً',
  paid: 'مدفوع بالكامل',
  overdue: 'متأخر',
  cancelled: 'ملغى',
};

export const actionLabels: Record<string, string> = {
  create: 'إضافة', update: 'تعديل', delete: 'حذف', deactivate: 'تعطيل', cancel: 'إلغاء',
  transfer: 'نقل عميل', login: 'تسجيل دخول', logout: 'تسجيل خروج', setup_admin: 'إنشاء مدير',
  update_settings: 'تعديل الإعدادات', backup: 'نسخة احتياطية',
};

export const entityLabels: Record<string, string> = {
  representative: 'مندوب', customer: 'عميل', receivable: 'مبلغ مستحق', collection: 'قبض',
  settlement: 'تسليم', user: 'مستخدم', settings: 'إعدادات', session: 'جلسة', database: 'قاعدة البيانات',
};
