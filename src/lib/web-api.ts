import { requireSupabase } from './supabase';

const PAGE_KEYS: PageKey[] = ['dashboard','representatives','customers','collections','settlements','balances','reports','users','audit','settings'];
const ACTION_KEYS: PermissionAction[] = ['view','create','edit','delete','export'];

function blankPermissions(): PermissionMap {
  return Object.fromEntries(PAGE_KEYS.map((page) => [page, Object.fromEntries(ACTION_KEYS.map((action) => [action, false]))])) as PermissionMap;
}

function normalizePermissions(role: AppUser['role'], input: any): PermissionMap {
  const result = blankPermissions();
  for (const page of PAGE_KEYS) {
    for (const action of ACTION_KEYS) {
      if (role === 'admin') result[page][action] = true;
      else if (role === 'viewer' && !['view','export'].includes(action)) result[page][action] = false;
      else result[page][action] = Boolean(input?.[page]?.[action]);
    }
  }
  return result;
}

function profileToUser(profile: any): AppUser {
  return {
    id: Number(profile.id),
    username: String(profile.username),
    fullName: String(profile.full_name),
    role: profile.role,
    permissions: normalizePermissions(profile.role, profile.permissions),
  };
}

function friendlyError(error: any): Error {
  const message = String(error?.message || error || 'حدث خطأ غير متوقع.');
  if (message.includes('duplicate key') || message.includes('unique constraint')) return new Error('القيمة أو الرقم مستخدم مسبقاً. غيّر الكود أو الرقم ثم حاول مجدداً.');
  if (message.includes('row-level security')) return new Error('ليس لديك صلاحية لتنفيذ هذه العملية.');
  if (message.includes('Invalid login credentials')) return new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
  if (message.includes('Failed to fetch')) return new Error('تعذر الاتصال بالخادم. تحقق من الإنترنت وإعدادات Supabase.');
  return new Error(message);
}

async function unwrap<T>(promise: PromiseLike<{ data: T | null; error: any }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw friendlyError(error);
  return data as T;
}

function safeSearch(value: unknown) {
  return String(value || '').trim().replace(/[,%()]/g, ' ');
}

function usernameToEmail(username: string) {
  const domain = (import.meta.env.VITE_AUTH_DOMAIN as string | undefined) || 'users.nexora.app';
  const normalized = String(username || '').trim().toLowerCase();
  let hash = 14695981039346656037n;
  for (const character of normalized) {
    hash ^= BigInt(character.codePointAt(0) || 0);
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return `u-${hash.toString(16).padStart(16, '0')}@${domain}`;
}

async function sessionToken() {
  const supabase = requireSupabase();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.');
  return token;
}

async function apiFetch<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', 'application/json');
  if (auth) headers.set('Authorization', `Bearer ${await sessionToken()}`);
  const response = await fetch(path, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body as T;
}

async function getCurrentProfile() {
  const supabase = requireSupabase();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('auth_user_id', authData.user.id).maybeSingle();
  if (error) throw friendlyError(error);
  if (!data?.active) {
    await supabase.auth.signOut();
    return null;
  }
  return data;
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function base64ToBlob(base64: string, type: string) {
  const bytes = atob(base64);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += 65536) {
    const part = bytes.slice(i, i + 65536);
    const array = new Uint8Array(part.length);
    for (let j = 0; j < part.length; j++) array[j] = part.charCodeAt(j);
    chunks.push(array);
  }
  return new Blob(chunks, { type });
}

async function chooseJsonFile(): Promise<any | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try { resolve(JSON.parse(await file.text())); }
      catch { reject(new Error('ملف النسخة الاحتياطية غير صالح.')); }
    };
    input.click();
  });
}

async function refreshStatuses() {
  const supabase = requireSupabase();
  const { error } = await supabase.rpc('refresh_overdue_receivables');
  if (error && !String(error.message).includes('permission')) throw friendlyError(error);
}

export function createSupabaseApi(): NexoraApi {
  const supabase = requireSupabase();

  const api: NexoraApi = {
    invoke: async <T = any>() => { throw new Error('القناة غير مدعومة في نسخة الويب.'); return undefined as T; },
    app: { openExternal: async (url: string) => { window.open(url, '_blank', 'noopener,noreferrer'); return true; } },
    auth: {
      status: async () => {
        const setup = await apiFetch<{ needsSetup: boolean }>('/api/setup-status', {}, false);
        if (setup.needsSetup) return { needsSetup: true, user: null };
        const profile = await getCurrentProfile();
        return { needsSetup: false, user: profile ? profileToUser(profile) : null };
      },
      setupAdmin: async (values) => {
        await apiFetch('/api/setup-admin', { method: 'POST', body: JSON.stringify(values) }, false);
        return api.auth.login(values);
      },
      login: async (values) => {
        const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(values.username), password: String(values.password || '') });
        if (error) throw friendlyError(error);
        const profile = await getCurrentProfile();
        if (!profile) throw new Error('الحساب غير موجود أو غير فعال.');
        return profileToUser(profile);
      },
      logout: async () => { const { error } = await supabase.auth.signOut(); if (error) throw friendlyError(error); return true; },
    },
    dashboard: {
      get: async () => unwrap<any>(supabase.rpc('dashboard_data')),
    },
    settings: {
      get: async () => unwrap<any>(supabase.from('settings').select('*').eq('id', 1).single()),
      update: async (values) => unwrap<any>(supabase.from('settings').update({ ...values, id: undefined, updated_at: new Date().toISOString() }).eq('id', 1).select('*').single()),
    },
    representatives: {
      list: async (filters = {}) => {
        let query = supabase.from('representative_summaries').select('*').order('id', { ascending: false });
        const search = safeSearch(filters.search);
        if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,phone.ilike.%${search}%`);
        if (filters.status) query = query.eq('status', filters.status);
        return unwrap<any[]>(query);
      },
      get: async (id) => {
        const [rep, customers, collections, settlements] = await Promise.all([
          unwrap<any>(supabase.from('representatives').select('*').eq('id', id).single()),
          unwrap<any[]>(supabase.from('customer_summaries').select('*').eq('representative_id', id).order('name')),
          unwrap<any[]>(supabase.from('collections').select('amount,commission_amount,net_amount,status').eq('representative_id', id).eq('status', 'active')),
          unwrap<any[]>(supabase.from('settlements').select('amount').eq('representative_id', id)),
        ]);
        const sum = (rows: any[], key: string) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
        const summary = {
          operations: collections.length,
          collected: sum(collections, 'amount'), commissions: sum(collections, 'commission_amount'),
          net: sum(collections, 'net_amount'), delivered: sum(settlements, 'amount'),
        } as any;
        summary.outstanding = summary.net - summary.delivered;
        return { rep, customers, summary };
      },
      create: async (values) => unwrap<any>(supabase.from('representatives').insert({
        code: String(values.code || ''), name: String(values.name || '').trim(), phone: values.phone || '', address: values.address || '',
        email: values.email || '', default_commission: Number(values.default_commission || 0), status: values.status || 'active', notes: values.notes || '',
      }).select('*').single()),
      update: async (id, values) => unwrap<any>(supabase.from('representatives').update({
        code: values.code, name: values.name, phone: values.phone, address: values.address, email: values.email,
        default_commission: Number(values.default_commission || 0), status: values.status, notes: values.notes,
      }).eq('id', id).select('*').single()),
      remove: async (id) => unwrap<any>(supabase.rpc('remove_representative', { p_id: id })),
    },
    customers: {
      list: async (filters = {}) => {
        let query = supabase.from('customer_summaries').select('*').order('id', { ascending: false });
        const search = safeSearch(filters.search);
        if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,phone.ilike.%${search}%,area.ilike.%${search}%`);
        if (filters.representativeId) query = query.eq('representative_id', Number(filters.representativeId));
        if (filters.status) query = query.eq('status', filters.status);
        return unwrap<any[]>(query);
      },
      get: async (id) => {
        const [customer, collections, assignments] = await Promise.all([
          unwrap<any>(supabase.from('customer_summaries').select('*').eq('id', id).single()),
          unwrap<any[]>(supabase.from('collection_details').select('*').eq('customer_id', id).order('collection_date', { ascending: false })),
          unwrap<any[]>(supabase.from('customer_assignment_details').select('*').eq('customer_id', id).order('started_at', { ascending: false })),
        ]);
        const active = collections.filter((row) => row.status === 'active');
        const sum = (key: string) => active.reduce((total, row) => total + Number(row[key] || 0), 0);
        return { customer, collections, assignments, summary: { operations: active.length, collected: sum('amount'), commissions: sum('commission_amount'), net: sum('net_amount') } };
      },
      create: async (values) => {
        const row = await unwrap<any>(supabase.from('customers').insert({
          code: String(values.code || ''), name: String(values.name || '').trim(), phone: values.phone || '', address: values.address || '', area: values.area || '',
          representative_id: values.representative_id || null, commission_percentage: values.commission_percentage === '' || values.commission_percentage == null ? null : Number(values.commission_percentage),
          status: values.status || 'active', notes: values.notes || '',
        }).select('*').single());
        await supabase.from('customer_assignments').insert({ customer_id: row.id, representative_id: row.representative_id, changed_by: (await getCurrentProfile())?.id || null, notes: 'التعيين الأول' });
        return row;
      },
      update: async (id, values) => unwrap<any>(supabase.from('customers').update({
        code: values.code, name: values.name, phone: values.phone, address: values.address, area: values.area,
        commission_percentage: values.commission_percentage === '' || values.commission_percentage == null ? null : Number(values.commission_percentage),
        status: values.status, notes: values.notes,
      }).eq('id', id).select('*').single()),
      transfer: async (id, representativeId, notes = '') => unwrap<any>(supabase.rpc('transfer_customer', { p_customer_id: id, p_representative_id: representativeId, p_notes: notes })),
      remove: async (id) => unwrap<any>(supabase.rpc('remove_customer', { p_id: id })),
    },
    receivables: {
      list: async (filters = {}) => {
        await refreshStatuses();
        let query = supabase.from('receivable_details').select('*').order('issue_date', { ascending: false }).order('id', { ascending: false });
        const search = safeSearch(filters.search);
        if (search) query = query.or(`number.ilike.%${search}%,description.ilike.%${search}%,customer_name.ilike.%${search}%`);
        if (filters.status) query = query.eq('status', filters.status);
        if (filters.customerId) query = query.eq('customer_id', Number(filters.customerId));
        if (filters.representativeId) query = query.eq('representative_id', Number(filters.representativeId));
        return unwrap<any[]>(query);
      },
      create: async (values) => {
        const customer = await unwrap<any>(supabase.from('customers').select('representative_id,commission_percentage').eq('id', values.customer_id).single());
        let commission = customer.commission_percentage;
        if (commission == null && customer.representative_id) {
          const rep = await unwrap<any>(supabase.from('representatives').select('default_commission').eq('id', customer.representative_id).single());
          commission = rep.default_commission;
        }
        const amount = Number(values.original_amount || 0);
        return unwrap<any>(supabase.from('receivables').insert({
          number: String(values.number || ''), customer_id: Number(values.customer_id), representative_id: customer.representative_id,
          description: values.description, original_amount: amount, paid_amount: 0, remaining_amount: amount,
          commission_percentage: Number(values.commission_percentage ?? commission ?? 0), issue_date: values.issue_date,
          due_date: values.due_date || null, status: 'unpaid', notes: values.notes || '',
        }).select('*').single());
      },
      update: async (id, values) => {
        const current = await unwrap<any>(supabase.from('receivables').select('*').eq('id', id).single());
        const amount = Number(values.original_amount ?? current.original_amount);
        if (Number(current.paid_amount || 0) > amount) throw new Error('لا يمكن جعل أصل المبلغ أقل من المبلغ المقبوض.');
        const updated = await unwrap<any>(supabase.from('receivables').update({
          number: values.number, description: values.description, original_amount: amount,
          commission_percentage: Number(values.commission_percentage ?? current.commission_percentage), issue_date: values.issue_date,
          due_date: values.due_date || null, notes: values.notes,
        }).eq('id', id).select('*').single());
        await refreshStatuses();
        return updated;
      },
      remove: async (id) => unwrap<any>(supabase.rpc('remove_receivable', { p_id: id })),
    },
    collections: {
      list: async (filters = {}) => {
        let query = supabase.from('collection_details').select('*').order('collection_date', { ascending: false }).order('id', { ascending: false });
        const search = safeSearch(filters.search);
        if (search) query = query.or(`receipt_number.ilike.%${search}%,customer_name.ilike.%${search}%,representative_name.ilike.%${search}%`);
        if (filters.dateFrom) query = query.gte('collection_date', filters.dateFrom);
        if (filters.dateTo) query = query.lte('collection_date', filters.dateTo);
        if (filters.representativeId) query = query.eq('representative_id', Number(filters.representativeId));
        if (filters.customerId) query = query.eq('customer_id', Number(filters.customerId));
        if (filters.status) query = query.eq('status', filters.status);
        return unwrap<any[]>(query);
      },
      create: async (values) => unwrap<any>(supabase.rpc('create_collection', { p_values: values })),
      update: async (id, values) => unwrap<any>(supabase.rpc('update_collection', { p_id: id, p_values: values })),
      cancel: async (id, reason = '') => unwrap<boolean>(supabase.rpc('cancel_collection', { p_id: id, p_reason: reason })),
      receipt: async (id) => {
        const [receipt, settings] = await Promise.all([
          unwrap<any>(supabase.from('collection_details').select('*').eq('id', id).single()),
          api.settings.get(),
        ]);
        return { receipt, settings };
      },
    },
    settlements: {
      list: async (filters = {}) => {
        let query = supabase.from('settlement_details').select('*').order('settlement_date', { ascending: false }).order('id', { ascending: false });
        if (filters.representativeId) query = query.eq('representative_id', Number(filters.representativeId));
        if (filters.dateFrom) query = query.gte('settlement_date', filters.dateFrom);
        if (filters.dateTo) query = query.lte('settlement_date', filters.dateTo);
        return unwrap<any[]>(query);
      },
      balance: async (representativeId) => {
        const [collections, settlements] = await Promise.all([
          unwrap<any[]>(supabase.from('collections').select('net_amount').eq('representative_id', representativeId).eq('status', 'active')),
          unwrap<any[]>(supabase.from('settlements').select('amount').eq('representative_id', representativeId)),
        ]);
        const due = collections.reduce((s, row) => s + Number(row.net_amount || 0), 0);
        const delivered = settlements.reduce((s, row) => s + Number(row.amount || 0), 0);
        return { due, delivered, outstanding: due - delivered };
      },
      create: async (values) => unwrap<any>(supabase.rpc('create_settlement', { p_values: values })),
      remove: async (id) => { const { error } = await supabase.from('settlements').delete().eq('id', id); if (error) throw friendlyError(error); return true; },
    },
    balances: {
      list: async () => {
        const [representatives, customers] = await Promise.all([
          unwrap<any[]>(supabase.from('representative_summaries').select('*').order('name')),
          unwrap<any[]>(supabase.from('customer_summaries').select('*').order('collected', { ascending: false })),
        ]);
        return {
          representatives: representatives.map((r) => ({ ...r, due_to_admin: Number(r.net || 0), delivered: Number(r.settlements || 0), outstanding: Number(r.net || 0) - Number(r.settlements || 0) })),
          customers: customers.map((c) => ({ ...c, collections_count: Number(c.collections_count || 0), collected: Number(c.collected || 0), commissions: Number(c.commissions || 0), net: Number(c.net || 0) })),
        };
      },
    },
    users: {
      list: async () => (await apiFetch<{ users: any[] }>('/api/users')).users.map((u) => ({ ...u, permissions: normalizePermissions(u.role, u.permissions) })),
      create: async (values) => (await apiFetch<{ user: any }>('/api/users', { method: 'POST', body: JSON.stringify(values) })).user,
      update: async (id, values) => (await apiFetch<{ user: any }>('/api/users', { method: 'PATCH', body: JSON.stringify({ id, values }) })).user,
      remove: async (id) => { await apiFetch(`/api/users?id=${id}`, { method: 'DELETE' }); return true; },
    },
    audit: {
      list: async (filters = {}) => {
        let query = supabase.from('audit_logs').select('*').order('id', { ascending: false }).limit(1000);
        const search = safeSearch(filters.search);
        if (search) query = query.or(`username.ilike.%${search}%,entity_type.ilike.%${search}%,entity_id.ilike.%${search}%`);
        if (filters.entityType) query = query.eq('entity_type', filters.entityType);
        if (filters.action) query = query.eq('action', filters.action);
        if (filters.dateFrom) query = query.gte('created_at', `${filters.dateFrom}T00:00:00`);
        if (filters.dateTo) query = query.lte('created_at', `${filters.dateTo}T23:59:59`);
        const rows = await unwrap<any[]>(query);
        return rows.map((row) => ({ ...row, old_values: row.old_values ? JSON.stringify(row.old_values) : '', new_values: row.new_values ? JSON.stringify(row.new_values) : '' }));
      },
    },
    reports: {
      run: async (type, filters = {}) => {
        if (type === 'representatives') {
          const rows = await unwrap<any[]>(supabase.from('representative_summaries').select('*').order('name'));
          return rows.map((r) => ({ code: r.code, name: r.name, customers: r.customer_count, operations: r.collections_count, collected: r.collected, commissions: r.commissions, net: r.net, delivered: r.settlements }));
        }
        if (type === 'customers') {
          let query = supabase.from('customer_summaries').select('*').order('name');
          if (filters.representativeId) query = query.eq('representative_id', Number(filters.representativeId));
          if (filters.area) query = query.eq('area', filters.area);
          const rows = await unwrap<any[]>(query);
          return rows.map((c) => ({ code: c.code, name: c.name, representative_name: c.representative_name, area: c.area, operations: c.collections_count, collected: c.collected, commissions: c.commissions, net: c.net }));
        }
        if (type === 'collections' || type === 'commissions') {
          let query = supabase.from('collection_details').select('*').order('collection_date', { ascending: false }).order('id', { ascending: false });
          if (filters.dateFrom) query = query.gte('collection_date', filters.dateFrom);
          if (filters.dateTo) query = query.lte('collection_date', filters.dateTo);
          if (filters.representativeId) query = query.eq('representative_id', Number(filters.representativeId));
          if (filters.customerId) query = query.eq('customer_id', Number(filters.customerId));
          if (filters.paymentMethod) query = query.eq('payment_method', filters.paymentMethod);
          return unwrap<any[]>(query);
        }
        if (type === 'settlements') {
          let query = supabase.from('settlement_details').select('*').order('settlement_date', { ascending: false });
          if (filters.dateFrom) query = query.gte('settlement_date', filters.dateFrom);
          if (filters.dateTo) query = query.lte('settlement_date', filters.dateTo);
          if (filters.representativeId) query = query.eq('representative_id', Number(filters.representativeId));
          return unwrap<any[]>(query);
        }
        throw new Error('نوع التقرير غير معروف.');
      },
    },
    backup: {
      create: async () => {
        const data = await apiFetch<any>('/api/backup');
        downloadBlob(`Nexora-Collect-Backup-${new Date().toISOString().slice(0,10)}.json`, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        return { canceled: false };
      },
      restore: async () => {
        const file = await chooseJsonFile();
        if (!file) return { canceled: true };
        await apiFetch('/api/backup', { method: 'POST', body: JSON.stringify(file) });
        return { canceled: false, restartRequired: true };
      },
    },
    export: {
      excel: async (title, base64) => {
        downloadBlob(`${String(title || 'report').replace(/[\\/:*?"<>|]/g, '-')}.xlsx`, base64ToBlob(base64, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
        return { canceled: false };
      },
      pdf: async (title, html) => {
        const printWindow = window.open('', '_blank', 'width=1100,height=800');
        if (!printWindow) throw new Error('تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة لهذا الموقع.');
        const generatedAt = new Date().toLocaleString('ar-IQ');
        printWindow.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${title}</title><style>
          @page{size:A4;margin:38mm 12mm 18mm}
          *{box-sizing:border-box}html,body{margin:0;padding:0}body{font-family:Arial,Tahoma,sans-serif;color:#111827;direction:rtl;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          .pdf-header{position:fixed;top:-34mm;left:0;right:0;height:30mm;display:flex;align-items:center;justify-content:center;border-bottom:1px solid #111827;background:white}
          .pdf-header img{width:100%;max-height:27mm;object-fit:contain}
          footer{position:fixed;bottom:-13mm;left:0;right:0;text-align:center;font-size:9px;color:#6b7280}
          h1,h2{text-align:center;margin:0 0 12px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #cbd5e1;padding:7px;text-align:right;vertical-align:top}th{background:#f1f5f9;font-weight:700}.meta{display:flex;justify-content:space-between;margin:10px 0 16px;font-size:11px}
        </style></head><body><div class="pdf-header"><img src="${location.origin}/altakamul-pdf-header.png" alt="رأس التقرير"></div><footer>${generatedAt} — ${title}</footer>${html}<script>window.onload=()=>setTimeout(()=>window.print(),500)<\/script></body></html>`);
        printWindow.document.close();
        return { canceled: false };
      },
    },
  };
  return api;
}

export function installWebApi() {
  if ((window as any).nexora) return;
  try {
    (window as any).nexora = createSupabaseApi();
  } catch (error: any) {
    const message = error?.message || 'لم يتم إعداد Supabase.';
    const fail = async () => { throw new Error(message); };
    const section = new Proxy({}, { get: () => fail });
    (window as any).nexora = {
      invoke: fail,
      app: { openExternal: async (url: string) => { window.open(url, '_blank', 'noopener,noreferrer'); return true; } },
      auth: { status: fail, setupAdmin: fail, login: fail, logout: fail },
      dashboard: section, settings: section, representatives: section, customers: section, receivables: section,
      collections: section, settlements: section, balances: section, users: section, audit: section, reports: section,
      backup: section, export: section,
    } as unknown as NexoraApi;
  }
}
