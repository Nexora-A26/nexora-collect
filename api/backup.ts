import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireActor, sendError } from '../server/supabase-admin';

const TABLES = ['settings','representatives','customers','customer_assignments','receivables','collections','settlements','audit_logs'] as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const { admin } = await requireActor(req, 'settings', 'export');
      const data: Record<string, any[]> = {};
      for (const table of TABLES) {
        const result = await admin.from(table).select('*').order('id', { ascending: true });
        if (result.error) throw result.error;
        data[table] = result.data || [];
      }
      return res.status(200).json({ version: 1, createdAt: new Date().toISOString(), data });
    }
    if (req.method === 'POST') {
      const { admin, profile } = await requireActor(req, 'settings', 'edit');
      const backup = req.body;
      if (!backup || backup.version !== 1 || !backup.data) return res.status(400).json({ error: 'ملف النسخة الاحتياطية غير صالح.' });
      for (const table of ['collections','settlements','receivables','customer_assignments','customers','representatives','audit_logs']) {
        const result = await admin.from(table).delete().neq('id', 0);
        if (result.error) throw result.error;
      }
      for (const table of ['settings','representatives','customers','customer_assignments','receivables','collections','settlements','audit_logs']) {
        const rows = Array.isArray(backup.data[table]) ? backup.data[table] : [];
        if (rows.length) {
          const result = await admin.from(table).upsert(rows, { onConflict: 'id' });
          if (result.error) throw result.error;
        }
      }
      await admin.rpc('reset_nexora_sequences');
      await admin.from('audit_logs').insert({ user_id: profile.id, username: profile.username, action: 'restore', entity_type: 'database', new_values: { createdAt: backup.createdAt || null } });
      return res.status(200).json({ success: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) { sendError(res, error); }
}
