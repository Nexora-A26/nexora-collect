import React, { useState } from 'react';
import { LockKeyhole, UserRound } from 'lucide-react';
import { Button, ErrorBox, Form, Input } from '../components/ui';

export default function AuthPage({ needsSetup, onAuthenticated }: { needsSetup: boolean; onAuthenticated(user: AppUser): void }) {
  const [values, setValues] = useState({ username: '', fullName: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const set = (key: string, value: string) => setValues((v)=>({ ...v, [key]: value }));

  const submit = async () => {
    setError('');
    if (needsSetup && values.password !== values.confirmPassword) { setError('كلمتا المرور غير متطابقتين.'); return; }
    setLoading(true);
    try {
      const user = needsSetup
        ? await window.nexora.auth.setupAdmin({ username: values.username, fullName: values.fullName, password: values.password })
        : await window.nexora.auth.login({ username: values.username, password: values.password });
      onAuthenticated(user);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return <main className="auth-shell">
    <section className="auth-brand">
      <img className="auth-brand-logo" src="./brand-logo.png" alt="Nexora Collect - نكسورا للتحصيل"/>
      <h1>نكسورا للتحصيل</h1>
      <p>نظام متكامل لإدارة المندوبين والعملاء والمبالغ والتحصيلات والعمولات</p>
      <ul><li>قاعدة بيانات سحابية آمنة ومحمية</li><li>صلاحيات تفصيلية لكل مستخدم</li><li>تقارير PDF وExcel</li></ul>
    </section>
    <section className="auth-card">
      <div className="auth-icon">{needsSetup ? <UserRound/> : <LockKeyhole/>}</div>
      <h2>{needsSetup ? 'إعداد مدير النظام' : 'تسجيل الدخول'}</h2>
      <p>{needsSetup ? 'هذه أول مرة يتم فيها إعداد النظام. أنشئ حساب المدير الرئيسي.' : 'أدخل بيانات حسابك للوصول إلى النظام.'}</p>
      {error && <ErrorBox message={error}/>} 
      <Form onSubmit={submit}>
        <div className="form-stack">
          {needsSetup && <Input label="الاسم الكامل" value={values.fullName} onChange={(e)=>set('fullName',e.target.value)} autoFocus required/>}
          <Input label="اسم المستخدم" value={values.username} onChange={(e)=>set('username',e.target.value)} autoFocus={!needsSetup} required/>
          <Input label="كلمة المرور" type="password" value={values.password} onChange={(e)=>set('password',e.target.value)} required/>
          {needsSetup && <Input label="تأكيد كلمة المرور" type="password" value={values.confirmPassword} onChange={(e)=>set('confirmPassword',e.target.value)} required/>}
          <Button type="submit" loading={loading}>{needsSetup ? 'إنشاء المدير وبدء الاستخدام' : 'دخول'}</Button>
        </div>
      </Form>
    </section>
  </main>;
}
