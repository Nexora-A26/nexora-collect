import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminClient, sendError } from '../server/supabase-admin';
import { normalizePermissions, usernameToEmail } from '../server/permissions';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const admin = getAdminClient();
    const { count, error: countError } = await admin.from('profiles').select('id', { count: 'exact', head: true });
    if (countError) throw countError;
    if (Number(count || 0) > 0) return res.status(409).json({ error: 'تم إعداد مدير النظام مسبقاً.' });
    const { username, fullName, password } = req.body || {};
    if (String(username || '').trim().length < 3) return res.status(400).json({ error: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل.' });
    if (!String(fullName || '').trim()) return res.status(400).json({ error: 'الاسم الكامل مطلوب.' });
    if (String(password || '').length < 6) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.' });
    const email = usernameToEmail(username);
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: String(password),
      email_confirm: true,
      user_metadata: { username: String(username).trim(), full_name: String(fullName).trim() },
    });
    if (error || !data.user) throw error || new Error('تعذر إنشاء مستخدم المصادقة.');
    const profile = {
      auth_user_id: data.user.id,
      username: String(username).trim().toLowerCase(),
      full_name: String(fullName).trim(),
      role: 'admin',
      permissions: normalizePermissions('admin', {}),
      active: true,
    };
    const { data: created, error: profileError } = await admin.from('profiles').insert(profile).select('*').single();
    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
      throw profileError;
    }
    res.status(201).json({ profile: created });
  } catch (error) { sendError(res, error); }
}
