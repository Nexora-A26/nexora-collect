import { createClient } from '@supabase/supabase-js';
import type { VercelRequest } from '@vercel/node';

export function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Supabase server environment variables are missing.');
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function requireActor(req: VercelRequest, page = 'users', action = 'view') {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw Object.assign(new Error('غير مصرح.'), { statusCode: 401 });
  const admin = getAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) throw Object.assign(new Error('الجلسة غير صالحة.'), { statusCode: 401 });
  const { data: profile, error } = await admin.from('profiles').select('*').eq('auth_user_id', userData.user.id).single();
  if (error || !profile || !profile.active) throw Object.assign(new Error('الحساب غير فعال.'), { statusCode: 403 });
  const allowed = profile.role === 'admin' || Boolean(profile.permissions?.[page]?.[action]);
  if (!allowed) throw Object.assign(new Error('ليس لديك صلاحية لتنفيذ هذه العملية.'), { statusCode: 403 });
  return { admin, authUser: userData.user, profile };
}

export function sendError(res: any, error: any) {
  const status = Number(error?.statusCode || 500);
  const message = error?.message || 'حدث خطأ غير متوقع.';
  res.status(status).json({ error: message });
}
