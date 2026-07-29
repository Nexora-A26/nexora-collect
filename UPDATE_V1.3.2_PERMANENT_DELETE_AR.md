# تحديث Nexora Collect v1.3.2 — الحذف النهائي لعملية القبض

## السلوك الجديد

عند الضغط على زر الحذف في صفحة عمليات القبض تظهر رسالة تأكيد واضحة. بعد التأكيد:

- تُحذف عملية القبض نهائياً من جدول `collections`.
- تختفي فوراً من صفحة عمليات القبض.
- تُعاد حسابات العميل والمندوب والأرصدة والتقارير تلقائياً.
- لا يمكن استرجاع العملية من واجهة النظام.
- يبقى أثر الحذف فقط في سجل العمليات لأغراض الرقابة، ولا يبقى سجل قبض تشغيلي.

## تحديث Supabase الحالي

شغّل الملف التالي مرة واحدة في Supabase SQL Editor:

```text
supabase/migrations/004_permanent_delete_collection.sql
```

الملف يحافظ على توافق النسخ القديمة: حتى استدعاء `cancel_collection` القديم أصبح يحذف العملية نهائياً.

## تحديث GitHub وRender

انسخ ملفات الإصدار فوق مجلد GitHub الحالي ثم نفّذ:

```powershell
git add -A
git commit -m "Nexora Collect v1.3.2 permanent collection deletion"
git push origin main
```

بعدها في Render استخدم `Clear build cache & deploy` وانتظر حتى تصبح الحالة `Live`.
