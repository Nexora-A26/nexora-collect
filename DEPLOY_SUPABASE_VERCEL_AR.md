# نشر Nexora Collect أونلاين باستخدام Supabase وVercel

هذه النسخة تعمل بطريقتين من المشروع نفسه:

- **Electron + SQLite** عند تشغيلها كتطبيق سطح مكتب.
- **Vercel + Supabase** عند فتحها كتطبيق ويب.

لا توجد بيانات تجريبية.

## 1. إنشاء مشروع Supabase

1. افتح Supabase وأنشئ مشروعاً جديداً.
2. من **SQL Editor** افتح الملف:

   `supabase/migrations/001_nexora_collect.sql`

3. انسخ محتواه كاملاً وشغّله مرة واحدة.
4. من **Project Settings → API** انسخ:
   - Project URL
   - Publishable key أو anon key
   - Service role key

**مهم:** مفتاح `service_role` سري ويُضاف في Vercel فقط. لا تضعه في متغير يبدأ بـ `VITE_` ولا ترفعه إلى GitHub.

## 2. رفع المشروع إلى GitHub

من داخل مجلد المشروع:

```bash
git init
git add .
git commit -m "Nexora Collect online v1.1.0"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/nexora-collect.git
git push -u origin main
```

## 3. ربط Vercel

1. افتح Vercel واضغط **Add New → Project**.
2. اختر مستودع GitHub.
3. سيكتشف Vite تلقائياً. القيم الموجودة في `vercel.json` هي:
   - Build Command: `npm run build:web`
   - Output Directory: `dist`
4. قبل النشر أضف متغيرات البيئة التالية في **Project Settings → Environment Variables**:

| الاسم | القيمة |
|---|---|
| `VITE_SUPABASE_URL` | رابط مشروع Supabase |
| `VITE_SUPABASE_ANON_KEY` | المفتاح العام Publishable/anon |
| `VITE_AUTH_DOMAIN` | `users.nexora.app` |
| `SUPABASE_URL` | رابط مشروع Supabase نفسه |
| `SUPABASE_SERVICE_ROLE_KEY` | مفتاح Service Role السري |
| `NEXORA_AUTH_DOMAIN` | `users.nexora.app` |

أضف المتغيرات إلى Production وPreview وDevelopment، ثم اضغط **Deploy**.

## 4. أول تشغيل

عند فتح رابط Vercel لأول مرة سيظهر نموذج **إعداد مدير النظام** لأن جدول المستخدمين فارغ.

أنشئ المدير فوراً. بعد إنشاء أول مدير، يتوقف مسار الإعداد ولا يمكن استخدامه مجدداً.

## 5. تشغيل محلي للويب

انسخ `.env.example` إلى `.env.local` وأدخل القيم، ثم:

```bash
npm install
npm run dev:vercel
```

استخدام `vercel dev` مهم لأنه يشغّل واجهة Vite ومسارات `/api` معاً.

## 6. ملاحظات الأمان

- قاعدة البيانات محمية بسياسات Row Level Security.
- صلاحيات العرض والإضافة والتعديل والحذف والتصدير محفوظة لكل مستخدم.
- إنشاء المستخدمين وتغيير كلمات المرور يتم من Vercel Functions باستخدام مفتاح الخدمة السري على الخادم فقط.
- لا تضع `SUPABASE_SERVICE_ROLE_KEY` في GitHub أو داخل كود المتصفح.
- نسخة JSON الاحتياطية تشمل البيانات التشغيلية، ولا تشمل كلمات مرور Supabase Auth.

## 7. الدومين

بعد نجاح النشر يعطيك Vercel رابطاً مثل:

`https://nexora-collect.vercel.app`

يمكنك ربط دومين خاص من **Vercel → Settings → Domains**.
