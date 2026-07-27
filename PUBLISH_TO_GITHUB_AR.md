# رفع Nexora Collect إلى GitHub

المشروع مجهّز لنوعين من الروابط:

1. **رابط المعاينة للعميل** عبر GitHub Pages.
2. **رابط تنزيل Setup.exe** عبر GitHub Releases.

> نسخة المعاينة داخل `docs` مستقلة وببيانات افتراضية للعرض فقط. برنامج سطح المكتب نفسه يبدأ بدون أي بيانات تجريبية.

## الطريقة الأسهل: GitHub Desktop

1. ثبّت GitHub Desktop وسجّل الدخول.
2. فك ضغط المشروع.
3. من GitHub Desktop اختر **File > Add local repository** وحدد مجلد `nexora-collect`.
4. إذا طلب إنشاء Git repository، وافق.
5. اكتب أول Commit ثم اضغط **Publish repository**.
6. اجعل المستودع Public إذا كنت تريد أن يرى العميل المعاينة، أو Private إذا كان المطلوب مشاركة الكود مع أشخاص محددين فقط.

## تفعيل رابط المعاينة

1. افتح المستودع على GitHub.
2. ادخل إلى **Settings > Pages**.
3. تحت Build and deployment اختر **GitHub Actions**.
4. افتح تبويب **Actions** وشغّل workflow باسم `Deploy Customer Preview` إذا لم يبدأ تلقائياً.
5. بعد نجاحه سيظهر الرابط داخل صفحة الـ workflow وفي Settings > Pages.

الرابط عادة يكون بهذا الشكل:

`https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`

## إنشاء Setup.exe داخل GitHub

1. افتح تبويب **Actions**.
2. اختر `Build Windows Installer`.
3. اضغط **Run workflow**.
4. بعد نجاح البناء ستجد ملفات Setup وPortable داخل Artifacts.

## نشر إصدار للعملاء في Releases

من PowerShell داخل مجلد المشروع:

```powershell
git add .
git commit -m "Release Nexora Collect v1.0.2"
git push
git tag v1.0.2
git push origin v1.0.2
```

عند رفع tag يبدأ GitHub Actions تلقائياً، ثم ينشئ صفحة Release تحتوي على:

- `Nexora-Collect-Setup-1.0.2-x64.exe`
- `Nexora-Collect-Portable-1.0.2-x64.exe`

شارك مع العميل رابط **Releases** لتنزيل البرنامج، وشارك رابط **Pages** لمعاينة التصميم داخل المتصفح.

## تنبيه الأمان

النسخة غير موقعة رقمياً، لذلك قد يظهر Windows SmartScreen. هذا لا يعني أن الملف تالف؛ لإزالة التحذير بشكل احترافي يلزم شراء شهادة Code Signing وإضافتها إلى GitHub Secrets.
