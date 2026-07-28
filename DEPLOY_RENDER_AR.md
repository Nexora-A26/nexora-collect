# نشر Nexora Collect على Render مع Supabase

يستخدم هذا الإصدار خدمة Web Service واحدة على Render:

- Vite/React يتم بناؤه إلى `dist`.
- Express يقدم ملفات الواجهة وواجهات `/api` من نفس الرابط.
- Supabase يبقى مسؤولاً عن قاعدة البيانات والمصادقة.

## 1. إعداد Supabase

أنشئ مشروعاً في Supabase، ثم افتح SQL Editor وشغّل الملف:

```text
supabase/migrations/001_nexora_collect.sql
```

لا تضف بيانات تجريبية.

## 2. رفع المشروع إلى GitHub

```bash
git init
git add .
git commit -m "Nexora Collect Render v1.2.0"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/nexora-collect.git
git push -u origin main
```

## 3. إنشاء الخدمة في Render

الطريقة الأسهل:

1. افتح Render Dashboard.
2. اختر New ثم Blueprint.
3. اربط مستودع GitHub.
4. سيقرأ Render ملف `render.yaml` تلقائياً.
5. أدخل قيم المتغيرات السرية عندما يطلبها Render.

أو أنشئ Web Service يدوياً بالقيم التالية:

```text
Runtime: Node
Build Command: ./render-build.sh
Start Command: npm start
Health Check Path: /health
```

## 4. متغيرات البيئة المطلوبة

أضفها من Render Dashboard > Environment:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
VITE_AUTH_DOMAIN=users.nexora.app
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
NEXORA_AUTH_DOMAIN=users.nexora.app
```

يجب أن تكون قيمتا `VITE_AUTH_DOMAIN` و`NEXORA_AUTH_DOMAIN` متطابقتين.

مهم جداً: لا تضع `SUPABASE_SERVICE_ROLE_KEY` في GitHub أو في أي متغير يبدأ بـ `VITE_`.

## 5. أول تشغيل

بعد اكتمال النشر افتح رابط Render. سيظهر إعداد مدير النظام إذا كانت قاعدة البيانات فارغة. أنشئ حساب المدير، ثم استخدم شاشة تسجيل الدخول العادية.

## 6. فحص الخدمة

افتح:

```text
https://YOUR-SERVICE.onrender.com/health
```

يجب أن ترى JSON يحتوي على `status: ok`.

## ملاحظة الخطة المجانية

قد تدخل خدمة Render المجانية في وضع السكون عند عدم الاستخدام، لذلك قد يستغرق أول فتح بعد فترة قصيرة وقتاً أطول. استخدم خطة مدفوعة إذا كان العملاء يحتاجون فتحاً فورياً دائماً.
