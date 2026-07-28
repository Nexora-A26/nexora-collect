# رفع Nexora Collect إلى GitHub ثم نشره على Vercel

يُستخدم GitHub لحفظ الكود وربطه مع Vercel، وليس لتشغيل النظام عبر GitHub Pages.

## رفع المشروع

```bash
git init
git add .
git commit -m "Nexora Collect online v1.1.0"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/nexora-collect.git
git push -u origin main
```

## نشر نسخة الويب

بعد الرفع:

1. نفّذ ملف قاعدة البيانات داخل Supabase: `supabase/migrations/001_nexora_collect.sql`.
2. من Vercel اختر **Add New → Project** واربط مستودع GitHub.
3. أضف متغيرات البيئة الموجودة في `.env.example`.
4. اضغط **Deploy**.
5. استخدم رابط Vercel الناتج للدخول إلى النظام أونلاين.

التعليمات الكاملة موجودة في `DEPLOY_SUPABASE_VERCEL_AR.md`.

## بناء برنامج Windows

يبقى workflow باسم `Build Windows Installer` داخل GitHub Actions لبناء Setup وPortable من نفس المشروع.
