# إصلاح خطأ إنشاء عملية القبض — v1.3.1

الخطأ:

```text
record "new" has no field "code"
```

## السبب
كانت دالة Trigger واحدة مشتركة بين عدة جداول، وتحاول قراءة `NEW.code` حتى عند الإدخال في جدول `collections` الذي يحتوي على `receipt_number` بدلاً من `code`.

## التطبيق على Supabase
1. افتح **Supabase → SQL Editor → New query**.
2. افتح الملف `supabase/migrations/003_fix_collection_code_trigger.sql`.
3. انسخ محتواه بالكامل واضغط **Run** مرة واحدة.
4. ارجع إلى الموقع وجرّب إنشاء عملية قبض جديدة.

لا تحتاج إلى حذف البيانات أو إعادة تشغيل migration 001.
