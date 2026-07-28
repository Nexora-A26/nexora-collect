import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireActor, sendError } from '../server/supabase-admin';
import { normalizePermissions, usernameToEmail, type Role } from '../server/permissions';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const { admin } = await requireActor(req, 'users', 'view');
      const { data, error } = await admin.from('profiles').select('id,auth_user_id,username,full_name,role,permissions,active,representative_id,created_at,updated_at').order('id', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ users: data || [] });
    }

    if (req.method === 'POST') {
      const { admin, profile: actor } = await requireActor(req, 'users', 'create');
      const values = req.body || {};
      const role = String(values.role || 'user') as Role;
      if (!['admin','user','viewer'].includes(role)) return res.status(400).json({ error: 'الدور غير صالح.' });
      if (String(values.username || '').trim().length < 3) return res.status(400).json({ error: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل.' });
      if (!String(values.full_name || '').trim()) return res.status(400).json({ error: 'الاسم الكامل مطلوب.' });
      if (String(values.password || '').length < 6) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.' });
      const email = usernameToEmail(values.username);
      const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email,
        password: String(values.password),
        email_confirm: true,
        user_metadata: { username: String(values.username).trim(), full_name: String(values.full_name).trim() },
      });
      if (authError || !authData.user) throw authError || new Error('تعذر إنشاء المستخدم.');
      const payload = {
        auth_user_id: authData.user.id,
        username: String(values.username).trim().toLowerCase(),
        full_name: String(values.full_name).trim(),
        role,
        permissions: normalizePermissions(role, values.permissions),
        active: values.active !== false,
        representative_id: values.representative_id || null,
      };
      const { data, error } = await admin.from('profiles').insert(payload).select('*').single();
      if (error) {
        await admin.auth.admin.deleteUser(authData.user.id).catch(() => undefined);
        throw error;
      }
      await admin.from('audit_logs').insert({ user_id: actor.id, username: actor.username, action: 'create', entity_type: 'user', entity_id: String(data.id), new_values: data });
      return res.status(201).json({ user: data });
    }

    if (req.method === 'PATCH') {
      const { admin, authUser, profile: actor } = await requireActor(req, 'users', 'edit');
      const { id, values = {} } = req.body || {};
      const { data: old, error: oldError } = await admin.from('profiles').select('*').eq('id', id).single();
      if (oldError || !old) throw oldError || new Error('المستخدم غير موجود.');
      if (old.auth_user_id === authUser.id && values.active === false) return res.status(400).json({ error: 'لا يمكنك تعطيل حسابك الحالي.' });
      const role = String(values.role ?? old.role) as Role;
      const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('active', true);
      if (old.role === 'admin' && role !== 'admin' && Number(count || 0) <= 1) return res.status(400).json({ error: 'لا يمكن تغيير دور آخر مدير فعال.' });
      const username = String(values.username ?? old.username).trim().toLowerCase();
      const fullName = String(values.full_name ?? old.full_name).trim();
      const authUpdates: Record<string, any> = { user_metadata: { username, full_name: fullName } };
      if (username !== old.username) authUpdates.email = usernameToEmail(username);
      if (values.password) {
        if (String(values.password).length < 6) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.' });
        authUpdates.password = String(values.password);
      }
      const { error: authError } = await admin.auth.admin.updateUserById(old.auth_user_id, authUpdates);
      if (authError) throw authError;
      const payload = {
        username,
        full_name: fullName,
        role,
        permissions: normalizePermissions(role, values.permissions ?? old.permissions),
        active: values.active === undefined ? old.active : Boolean(values.active),
        representative_id: values.representative_id === undefined ? old.representative_id : (values.representative_id || null),
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await admin.from('profiles').update(payload).eq('id', id).select('*').single();
      if (error) throw error;
      await admin.from('audit_logs').insert({ user_id: actor.id, username: actor.username, action: 'update', entity_type: 'user', entity_id: String(id), old_values: old, new_values: data });
      return res.status(200).json({ user: data });
    }

    if (req.method === 'DELETE') {
      const { admin, authUser, profile: actor } = await requireActor(req, 'users', 'delete');
      const id = Number(req.query.id || req.body?.id);
      const { data: old, error } = await admin.from('profiles').select('*').eq('id', id).single();
      if (error || !old) throw error || new Error('المستخدم غير موجود.');
      if (old.auth_user_id === authUser.id) return res.status(400).json({ error: 'لا يمكنك تعطيل حسابك الحالي.' });
      const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('active', true);
      if (old.role === 'admin' && Number(count || 0) <= 1) return res.status(400).json({ error: 'لا يمكن حذف آخر مدير فعال.' });
      const { error: updateError } = await admin.from('profiles').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id);
      if (updateError) throw updateError;
      await admin.from('audit_logs').insert({ user_id: actor.id, username: actor.username, action: 'deactivate', entity_type: 'user', entity_id: String(id), old_values: old, new_values: { active: false } });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) { sendError(res, error); }
}
