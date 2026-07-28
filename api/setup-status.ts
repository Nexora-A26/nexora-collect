import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAdminClient, sendError } from '../server/supabase-admin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const admin = getAdminClient();
    const { count, error } = await admin.from('profiles').select('id', { count: 'exact', head: true });
    if (error) throw error;
    res.status(200).json({ needsSetup: Number(count || 0) === 0 });
  } catch (error) { sendError(res, error); }
}
