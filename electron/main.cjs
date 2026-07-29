const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const { PDFDocument } = require('pdf-lib');

let mainWindow;
let db;
let dbPath;
let currentUser = null;

const PAGE_KEYS = [
  'dashboard', 'representatives', 'customers', 'collections',
  'settlements', 'balances', 'reports', 'users', 'audit', 'settings'
];
const ACTION_KEYS = ['view', 'create', 'edit', 'delete', 'export'];

const adminPermissions = () => Object.fromEntries(
  PAGE_KEYS.map((page) => [page, Object.fromEntries(ACTION_KEYS.map((a) => [a, true]))])
);

function nowIso() {
  return new Date().toISOString();
}

function getWasmPath() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'sql-wasm.wasm');
  return require.resolve('sql.js/dist/sql-wasm.wasm');
}

function persistDb() {
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function rows(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const result = [];
  while (stmt.step()) result.push(stmt.getAsObject());
  stmt.free();
  return result;
}

function row(sql, params = []) {
  return rows(sql, params)[0] || null;
}

function run(sql, params = []) {
  db.run(sql, params);
  const idRow = row('SELECT last_insert_rowid() AS id');
  return Number(idRow?.id || 0);
}

function transaction(fn) {
  db.run('BEGIN IMMEDIATE TRANSACTION');
  try {
    const result = fn();
    db.run('COMMIT');
    persistDb();
    return result;
  } catch (error) {
    try { db.run('ROLLBACK'); } catch (_) {}
    throw error;
  }
}

function json(value, fallback = {}) {
  try { return JSON.parse(value || ''); } catch (_) { return fallback; }
}

function normalizePermissions(role, permissions) {
  if (role === 'admin') return adminPermissions();
  const incoming = typeof permissions === 'string' ? json(permissions, {}) : (permissions || {});
  const normalized = {};
  for (const page of PAGE_KEYS) {
    normalized[page] = {};
    for (const action of ACTION_KEYS) {
      normalized[page][action] = Boolean(incoming?.[page]?.[action]);
    }
  }
  if (role === 'viewer') {
    for (const page of PAGE_KEYS) {
      normalized[page].create = false;
      normalized[page].edit = false;
      normalized[page].delete = false;
    }
  }
  return normalized;
}

function requireAuth() {
  if (!currentUser) throw new Error('يجب تسجيل الدخول أولاً.');
}

function hasPermission(page, action = 'view') {
  if (!currentUser) return false;
  if (currentUser.role === 'admin') return true;
  const permissions = currentUser.permissions || {};
  return Boolean(permissions?.[page]?.[action]);
}

function requirePermission(page, action = 'view') {
  requireAuth();
  if (!hasPermission(page, action)) throw new Error('ليس لديك صلاحية لتنفيذ هذه العملية.');
}

function requireAnyPermission(checks = []) {
  requireAuth();
  if (!checks.some(([page, action = 'view']) => hasPermission(page, action))) {
    throw new Error('ليس لديك صلاحية لتنفيذ هذه العملية.');
  }
}

function audit(action, entityType, entityId, oldValues = null, newValues = null) {
  run(`INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, old_values, new_values, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
    currentUser?.id || null,
    currentUser?.username || 'system',
    action,
    entityType,
    entityId ? String(entityId) : null,
    oldValues ? JSON.stringify(oldValues) : null,
    newValues ? JSON.stringify(newValues) : null,
    nowIso(),
  ]);
}

function nextCode(table, prefix, column = 'code') {
  const r = row(`SELECT ${column} AS code FROM ${table} WHERE ${column} LIKE ? ORDER BY id DESC LIMIT 1`, [`${prefix}-%`]);
  const last = r?.code ? Number(String(r.code).split('-').pop()) || 0 : 0;
  return `${prefix}-${String(last + 1).padStart(4, '0')}`;
}

function getSettings() {
  const data = row('SELECT * FROM settings WHERE id = 1');
  if (!data) return null;
  return {
    ...data,
    decimal_places: Number(data.decimal_places),
  };
}

function refreshDueStatuses() {
  db.run(`UPDATE receivables
          SET status='overdue', updated_at=?
          WHERE status IN ('unpaid','partial')
            AND remaining_amount>0
            AND due_date IS NOT NULL
            AND due_date<>''
            AND due_date < date('now','localtime')`, [nowIso()]);
  const changedToOverdue = db.getRowsModified();
  db.run(`UPDATE receivables
          SET status=CASE WHEN paid_amount>0 THEN 'partial' ELSE 'unpaid' END, updated_at=?
          WHERE status='overdue'
            AND remaining_amount>0
            AND (due_date IS NULL OR due_date='' OR due_date >= date('now','localtime'))`, [nowIso()]);
  if (changedToOverdue + db.getRowsModified() > 0) persistDb();
}

function recalcReceivable(receivableId) {
  const rec = row('SELECT * FROM receivables WHERE id = ?', [receivableId]);
  if (!rec) return;
  const paid = row(`SELECT COALESCE(SUM(amount),0) AS total FROM collections WHERE receivable_id = ? AND status = 'active'`, [receivableId]);
  const paidAmount = Number(paid?.total || 0);
  const remaining = Math.max(0, Number(rec.original_amount) - paidAmount);
  let status = 'unpaid';
  if (rec.status === 'cancelled') status = 'cancelled';
  else if (remaining <= 0) status = 'paid';
  else if (paidAmount > 0) status = 'partial';
  else if (rec.due_date && new Date(`${rec.due_date}T23:59:59`) < new Date()) status = 'overdue';
  db.run('UPDATE receivables SET paid_amount = ?, remaining_amount = ?, status = ?, updated_at = ? WHERE id = ?', [
    paidAmount, remaining, status, nowIso(), receivableId,
  ]);
}

async function initializeDatabase() {
  const SQL = await initSqlJs({ locateFile: () => getWasmPath() });
  const dataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  dbPath = path.join(dataDir, 'nexora-collect.sqlite');
  if (db) { try { db.close(); } catch (_) {} }
  db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();

  db.run(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','user','viewer')),
      permissions TEXT NOT NULL DEFAULT '{}',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      organization_name TEXT NOT NULL DEFAULT 'نكسورا للتحصيل',
      organization_phone TEXT DEFAULT '',
      organization_address TEXT DEFAULT '',
      organization_email TEXT DEFAULT '',
      tax_number TEXT DEFAULT '',
      logo_data TEXT DEFAULT '',
      currency_name TEXT NOT NULL DEFAULT 'الدينار العراقي',
      currency_code TEXT NOT NULL DEFAULT 'IQD',
      currency_symbol TEXT NOT NULL DEFAULT 'د.ع',
      symbol_position TEXT NOT NULL DEFAULT 'after' CHECK(symbol_position IN ('before','after')),
      decimal_places INTEGER NOT NULL DEFAULT 0,
      thousands_separator TEXT NOT NULL DEFAULT ',',
      decimal_separator TEXT NOT NULL DEFAULT '.',
      date_format TEXT NOT NULL DEFAULT 'yyyy-MM-dd',
      receipt_prefix TEXT NOT NULL DEFAULT 'REC',
      settlement_prefix TEXT NOT NULL DEFAULT 'SET',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS representatives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      email TEXT DEFAULT '',
      default_commission REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      area TEXT DEFAULT '',
      representative_id INTEGER,
      commission_percentage REAL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(representative_id) REFERENCES representatives(id)
    );
    CREATE TABLE IF NOT EXISTS customer_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      representative_id INTEGER,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      changed_by INTEGER,
      notes TEXT DEFAULT '',
      FOREIGN KEY(customer_id) REFERENCES customers(id),
      FOREIGN KEY(representative_id) REFERENCES representatives(id),
      FOREIGN KEY(changed_by) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS receivables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      representative_id INTEGER,
      description TEXT NOT NULL,
      original_amount REAL NOT NULL CHECK(original_amount >= 0),
      paid_amount REAL NOT NULL DEFAULT 0,
      remaining_amount REAL NOT NULL DEFAULT 0,
      commission_percentage REAL NOT NULL DEFAULT 0,
      issue_date TEXT NOT NULL,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'unpaid' CHECK(status IN ('unpaid','partial','paid','overdue','cancelled')),
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(customer_id) REFERENCES customers(id),
      FOREIGN KEY(representative_id) REFERENCES representatives(id)
    );
    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_token TEXT UNIQUE,
      receipt_number TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      receivable_id INTEGER,
      representative_id INTEGER,
      amount REAL NOT NULL CHECK(amount > 0),
      commission_percentage REAL NOT NULL CHECK(commission_percentage >= 0 AND commission_percentage <= 100),
      commission_amount REAL NOT NULL,
      net_amount REAL NOT NULL,
      collection_date TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      notes TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
      cancelled_at TEXT,
      cancelled_by INTEGER,
      created_by INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(customer_id) REFERENCES customers(id),
      FOREIGN KEY(receivable_id) REFERENCES receivables(id),
      FOREIGN KEY(representative_id) REFERENCES representatives(id),
      FOREIGN KEY(created_by) REFERENCES users(id),
      FOREIGN KEY(cancelled_by) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL UNIQUE,
      representative_id INTEGER NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      settlement_date TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      reference_number TEXT DEFAULT '',
      received_by TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_by INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(representative_id) REFERENCES representatives(id),
      FOREIGN KEY(created_by) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      old_values TEXT,
      new_values TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_customers_rep ON customers(representative_id);
    CREATE INDEX IF NOT EXISTS idx_receivables_customer ON receivables(customer_id);
    CREATE INDEX IF NOT EXISTS idx_receivables_rep ON receivables(representative_id);
    CREATE INDEX IF NOT EXISTS idx_collections_date ON collections(collection_date);
    CREATE INDEX IF NOT EXISTS idx_collections_customer ON collections(customer_id);
    CREATE INDEX IF NOT EXISTS idx_collections_rep ON collections(representative_id);
    CREATE INDEX IF NOT EXISTS idx_settlements_rep ON settlements(representative_id);
  `);

  const collectionInfo = rows('PRAGMA table_info(collections)');
  const receivableColumn = collectionInfo.find((column) => column.name === 'receivable_id');
  if (receivableColumn && Number(receivableColumn.notnull) === 1) {
    db.run('PRAGMA foreign_keys = OFF');
    db.run(`
      CREATE TABLE collections_direct (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_token TEXT UNIQUE,
        receipt_number TEXT NOT NULL UNIQUE,
        customer_id INTEGER NOT NULL,
        receivable_id INTEGER,
        representative_id INTEGER,
        amount REAL NOT NULL CHECK(amount > 0),
        commission_percentage REAL NOT NULL CHECK(commission_percentage >= 0 AND commission_percentage <= 100),
        commission_amount REAL NOT NULL,
        net_amount REAL NOT NULL,
        collection_date TEXT NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'cash',
        notes TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
        cancelled_at TEXT,
        cancelled_by INTEGER,
        created_by INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(customer_id) REFERENCES customers(id),
        FOREIGN KEY(receivable_id) REFERENCES receivables(id),
        FOREIGN KEY(representative_id) REFERENCES representatives(id),
        FOREIGN KEY(created_by) REFERENCES users(id),
        FOREIGN KEY(cancelled_by) REFERENCES users(id)
      );
      INSERT INTO collections_direct SELECT id,operation_token,receipt_number,customer_id,receivable_id,representative_id,amount,commission_percentage,commission_amount,net_amount,collection_date,payment_method,notes,status,cancelled_at,cancelled_by,created_by,created_at,updated_at FROM collections;
      DROP TABLE collections;
      ALTER TABLE collections_direct RENAME TO collections;
      CREATE INDEX IF NOT EXISTS idx_collections_date ON collections(collection_date);
      CREATE INDEX IF NOT EXISTS idx_collections_customer ON collections(customer_id);
      CREATE INDEX IF NOT EXISTS idx_collections_rep ON collections(representative_id);
    `);
    db.run('PRAGMA foreign_keys = ON');
  }
  const collectionColumns = rows('PRAGMA table_info(collections)').map((column) => column.name);
  if (!collectionColumns.includes('operation_token')) db.run('ALTER TABLE collections ADD COLUMN operation_token TEXT');
  db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_operation_token ON collections(operation_token) WHERE operation_token IS NOT NULL');
  if (!row('SELECT id FROM settings WHERE id = 1')) {
    db.run(`INSERT INTO settings (id, updated_at) VALUES (1, ?)`, [nowIso()]);
  }
  persistDb();
}

function userFacingError(error) {
  const message = error?.message || String(error || '');
  if (message.includes('UNIQUE constraint failed')) return 'القيمة أو الرقم مستخدم مسبقاً. غيّر الكود أو الرقم ثم حاول مجدداً.';
  if (message.includes('FOREIGN KEY constraint failed')) return 'لا يمكن تنفيذ العملية لوجود بيانات مرتبطة بهذا السجل.';
  if (message.includes('CHECK constraint failed')) return 'إحدى القيم المدخلة غير صالحة. راجع المبلغ أو النسبة أو الحالة.';
  return message || 'حدث خطأ غير متوقع.';
}

function safeHandle(channel, handler) {
  ipcMain.handle(channel, async (_event, payload) => {
    try {
      const data = await handler(payload || {});
      return { ok: true, data };
    } catch (error) {
      console.error(channel, error);
      return { ok: false, error: userFacingError(error) };
    }
  });
}

function registerIpc() {
  safeHandle('app:openExternal', async ({ url }) => {
    await shell.openExternal(url);
    return true;
  });

  safeHandle('auth:status', () => {
    const count = Number(row('SELECT COUNT(*) AS count FROM users')?.count || 0);
    return { needsSetup: count === 0, user: currentUser };
  });

  safeHandle('auth:setupAdmin', async ({ username, fullName, password }) => {
    const count = Number(row('SELECT COUNT(*) AS count FROM users')?.count || 0);
    if (count > 0) throw new Error('تم إنشاء مدير النظام مسبقاً.');
    if (!username || username.trim().length < 3) throw new Error('اسم المستخدم يجب أن يكون 3 أحرف على الأقل.');
    if (!fullName || fullName.trim().length < 2) throw new Error('أدخل الاسم الكامل.');
    if (!password || password.length < 6) throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
    const passwordHash = await bcrypt.hash(password, 12);
    const permissions = adminPermissions();
    const id = transaction(() => run(`INSERT INTO users (username, full_name, password_hash, role, permissions, active, created_at, updated_at)
      VALUES (?, ?, ?, 'admin', ?, 1, ?, ?)`, [username.trim(), fullName.trim(), passwordHash, JSON.stringify(permissions), nowIso(), nowIso()]));
    currentUser = { id, username: username.trim(), fullName: fullName.trim(), role: 'admin', permissions };
    transaction(() => audit('setup_admin', 'user', id, null, { username: currentUser.username, role: 'admin' }));
    return currentUser;
  });

  safeHandle('auth:login', async ({ username, password }) => {
    const user = row('SELECT * FROM users WHERE username = ? AND active = 1', [String(username || '').trim()]);
    if (!user || !(await bcrypt.compare(String(password || ''), user.password_hash))) {
      throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
    }
    currentUser = {
      id: Number(user.id),
      username: user.username,
      fullName: user.full_name,
      role: user.role,
      permissions: normalizePermissions(user.role, user.permissions),
    };
    transaction(() => audit('login', 'session', currentUser.id, null, { username: currentUser.username }));
    return currentUser;
  });

  safeHandle('auth:logout', () => {
    if (currentUser) transaction(() => audit('logout', 'session', currentUser.id, null, null));
    currentUser = null;
    return true;
  });

  safeHandle('settings:get', () => {
    requireAuth();
    return getSettings();
  });

  safeHandle('settings:update', ({ values }) => {
    requirePermission('settings', 'edit');
    const old = getSettings();
    const v = values || {};
    const decimals = Number(v.decimal_places ?? old.decimal_places);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 4) throw new Error('عدد المنازل العشرية يجب أن يكون بين 0 و4.');
    transaction(() => {
      db.run(`UPDATE settings SET organization_name=?, organization_phone=?, organization_address=?, organization_email=?, tax_number=?, logo_data=?, currency_name=?, currency_code=?, currency_symbol=?, symbol_position=?, decimal_places=?, thousands_separator=?, decimal_separator=?, date_format=?, receipt_prefix=?, settlement_prefix=?, updated_at=? WHERE id=1`, [
        v.organization_name ?? old.organization_name,
        v.organization_phone ?? old.organization_phone,
        v.organization_address ?? old.organization_address,
        v.organization_email ?? old.organization_email,
        v.tax_number ?? old.tax_number,
        v.logo_data ?? old.logo_data,
        v.currency_name ?? old.currency_name,
        String(v.currency_code ?? old.currency_code).toUpperCase(),
        v.currency_symbol ?? old.currency_symbol,
        v.symbol_position ?? old.symbol_position,
        decimals,
        v.thousands_separator ?? old.thousands_separator,
        v.decimal_separator ?? old.decimal_separator,
        v.date_format ?? old.date_format,
        v.receipt_prefix ?? old.receipt_prefix,
        v.settlement_prefix ?? old.settlement_prefix,
        nowIso(),
      ]);
      audit('update_settings', 'settings', 1, old, getSettings());
    });
    return getSettings();
  });

  safeHandle('dashboard:get', () => {
    requirePermission('dashboard', 'view');
    const totals = row(`SELECT
      (SELECT COUNT(*) FROM representatives WHERE status='active') AS representatives,
      (SELECT COUNT(*) FROM customers WHERE status='active') AS customers,
      (SELECT COUNT(*) FROM collections WHERE status='active') AS operations,
      (SELECT COALESCE(SUM(amount),0) FROM collections WHERE status='active') AS collected,
      (SELECT COALESCE(SUM(commission_amount),0) FROM collections WHERE status='active') AS commissions,
      (SELECT COALESCE(SUM(net_amount),0) FROM collections WHERE status='active') AS net,
      ((SELECT COALESCE(SUM(net_amount),0) FROM collections WHERE status='active') - (SELECT COALESCE(SUM(amount),0) FROM settlements)) AS outstanding,
      (SELECT COALESCE(SUM(amount),0) FROM collections WHERE status='active' AND collection_date=date('now','localtime')) AS today,
      (SELECT COALESCE(SUM(amount),0) FROM collections WHERE status='active' AND substr(collection_date,1,7)=substr(date('now','localtime'),1,7)) AS month
    `);
    const recent = rows(`SELECT c.id,c.receipt_number,c.amount,c.commission_amount,c.net_amount,c.collection_date,c.payment_method,
      cu.name AS customer_name,r.name AS representative_name
      FROM collections c
      JOIN customers cu ON cu.id=c.customer_id
      LEFT JOIN representatives r ON r.id=c.representative_id
      WHERE c.status='active' ORDER BY c.collection_date DESC,c.id DESC LIMIT 10`);
    const trend = rows(`SELECT collection_date AS date, SUM(amount) AS amount FROM collections WHERE status='active' AND collection_date >= date('now','-29 day') GROUP BY collection_date ORDER BY collection_date`);
    const topReps = rows(`SELECT r.name, COALESCE(SUM(c.amount),0) AS amount FROM representatives r LEFT JOIN collections c ON c.representative_id=r.id AND c.status='active' GROUP BY r.id ORDER BY amount DESC LIMIT 5`);
    const topCustomers = rows(`SELECT cu.name, COALESCE(SUM(c.amount),0) AS amount FROM customers cu LEFT JOIN collections c ON c.customer_id=cu.id AND c.status='active' GROUP BY cu.id ORDER BY amount DESC LIMIT 5`);
    return { totals, recent, trend, topReps, topCustomers, topDebtors: [] };
  });

  safeHandle('representatives:list', ({ search = '', status = '' }) => {
    requireAnyPermission([['representatives','view'], ['customers','view'], ['collections','view'], ['collections','create'], ['collections','edit'], ['settlements','view'], ['settlements','create'], ['balances','view'], ['reports','view']]);
    return rows(`SELECT r.*,
      (SELECT COUNT(*) FROM customers c WHERE c.representative_id=r.id AND c.status='active') AS customer_count,
      (SELECT COUNT(*) FROM collections c WHERE c.representative_id=r.id AND c.status='active') AS collections_count,
      (SELECT COALESCE(SUM(amount),0) FROM collections c WHERE c.representative_id=r.id AND c.status='active') AS collected,
      (SELECT COALESCE(SUM(commission_amount),0) FROM collections c WHERE c.representative_id=r.id AND c.status='active') AS commissions,
      (SELECT COALESCE(SUM(net_amount),0) FROM collections c WHERE c.representative_id=r.id AND c.status='active') AS net,
      (SELECT COALESCE(SUM(amount),0) FROM settlements s WHERE s.representative_id=r.id) AS settlements,
      ((SELECT COALESCE(SUM(net_amount),0) FROM collections c WHERE c.representative_id=r.id AND c.status='active') -
       (SELECT COALESCE(SUM(amount),0) FROM settlements s WHERE s.representative_id=r.id)) AS outstanding
      FROM representatives r
      WHERE (?='' OR r.name LIKE ? OR r.code LIKE ? OR r.phone LIKE ?)
        AND (?='' OR r.status=?)
      ORDER BY r.id DESC`, [search, `%${search}%`, `%${search}%`, `%${search}%`, status, status]);
  });

  safeHandle('representatives:get', ({ id }) => {
    requirePermission('representatives', 'view');
    const rep = row('SELECT * FROM representatives WHERE id=?', [id]);
    if (!rep) throw new Error('المندوب غير موجود.');
    const customers = rows(`SELECT c.*,
      (SELECT COUNT(*) FROM collections cl WHERE cl.customer_id=c.id AND cl.status='active') AS collections_count,
      COALESCE((SELECT SUM(amount) FROM collections cl WHERE cl.customer_id=c.id AND cl.status='active'),0) AS collected,
      COALESCE((SELECT SUM(commission_amount) FROM collections cl WHERE cl.customer_id=c.id AND cl.status='active'),0) AS commissions,
      COALESCE((SELECT SUM(net_amount) FROM collections cl WHERE cl.customer_id=c.id AND cl.status='active'),0) AS net
      FROM customers c WHERE c.representative_id=? ORDER BY c.name`, [id]);
    const summary = row(`SELECT
      (SELECT COUNT(*) FROM collections WHERE representative_id=? AND status='active') AS operations,
      COALESCE((SELECT SUM(amount) FROM collections WHERE representative_id=? AND status='active'),0) AS collected,
      COALESCE((SELECT SUM(commission_amount) FROM collections WHERE representative_id=? AND status='active'),0) AS commissions,
      COALESCE((SELECT SUM(net_amount) FROM collections WHERE representative_id=? AND status='active'),0) AS net,
      COALESCE((SELECT SUM(amount) FROM settlements WHERE representative_id=?),0) AS delivered`, [id,id,id,id,id]);
    summary.outstanding = Number(summary.net || 0) - Number(summary.delivered || 0);
    return { rep, customers, summary };
  });

  safeHandle('representatives:create', ({ values }) => {
    requirePermission('representatives', 'create');
    const v = values || {};
    if (!String(v.name || '').trim()) throw new Error('اسم المندوب مطلوب.');
    const commission = Number(v.default_commission || 0);
    if (commission < 0 || commission > 100) throw new Error('نسبة العمولة يجب أن تكون بين 0 و100.');
    return transaction(() => {
      const code = v.code?.trim() || nextCode('representatives', 'REP');
      const id = run(`INSERT INTO representatives (code,name,phone,address,email,default_commission,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, [
        code, v.name.trim(), v.phone || '', v.address || '', v.email || '', commission, v.status || 'active', v.notes || '', nowIso(), nowIso(),
      ]);
      const created = row('SELECT * FROM representatives WHERE id=?', [id]);
      audit('create', 'representative', id, null, created);
      return created;
    });
  });

  safeHandle('representatives:update', ({ id, values }) => {
    requirePermission('representatives', 'edit');
    const old = row('SELECT * FROM representatives WHERE id=?', [id]);
    if (!old) throw new Error('المندوب غير موجود.');
    const v = values || {};
    const commission = Number(v.default_commission ?? old.default_commission);
    if (commission < 0 || commission > 100) throw new Error('نسبة العمولة يجب أن تكون بين 0 و100.');
    transaction(() => {
      db.run(`UPDATE representatives SET code=?,name=?,phone=?,address=?,email=?,default_commission=?,status=?,notes=?,updated_at=? WHERE id=?`, [
        v.code ?? old.code, v.name ?? old.name, v.phone ?? old.phone, v.address ?? old.address, v.email ?? old.email,
        commission, v.status ?? old.status, v.notes ?? old.notes, nowIso(), id,
      ]);
      audit('update', 'representative', id, old, row('SELECT * FROM representatives WHERE id=?', [id]));
    });
    return row('SELECT * FROM representatives WHERE id=?', [id]);
  });

  safeHandle('representatives:delete', ({ id }) => {
    requirePermission('representatives', 'delete');
    const old = row('SELECT * FROM representatives WHERE id=?', [id]);
    if (!old) throw new Error('المندوب غير موجود.');
    const history = Number(row(`SELECT
      (SELECT COUNT(*) FROM receivables WHERE representative_id=?) +
      (SELECT COUNT(*) FROM collections WHERE representative_id=?) +
      (SELECT COUNT(*) FROM settlements WHERE representative_id=?) AS count`, [id,id,id])?.count || 0);
    transaction(() => {
      if (history > 0) {
        db.run(`UPDATE representatives SET status='inactive',updated_at=? WHERE id=?`, [nowIso(), id]);
        audit('deactivate', 'representative', id, old, row('SELECT * FROM representatives WHERE id=?', [id]));
      } else {
        db.run('UPDATE customers SET representative_id=NULL,updated_at=? WHERE representative_id=?', [nowIso(), id]);
        db.run('DELETE FROM representatives WHERE id=?', [id]);
        audit('delete', 'representative', id, old, null);
      }
    });
    return { deactivated: history > 0 };
  });

  safeHandle('customers:list', ({ search = '', representativeId = '', status = '' }) => {
    requireAnyPermission([['customers','view'], ['collections','view'], ['collections','create'], ['collections','edit'], ['balances','view'], ['reports','view']]);
    return rows(`SELECT c.*, r.name AS representative_name,
      (SELECT COUNT(*) FROM collections cl WHERE cl.customer_id=c.id AND cl.status='active') AS collections_count,
      COALESCE((SELECT SUM(amount) FROM collections cl WHERE cl.customer_id=c.id AND cl.status='active'),0) AS collected,
      COALESCE((SELECT SUM(commission_amount) FROM collections cl WHERE cl.customer_id=c.id AND cl.status='active'),0) AS commissions,
      COALESCE((SELECT SUM(net_amount) FROM collections cl WHERE cl.customer_id=c.id AND cl.status='active'),0) AS net
      FROM customers c LEFT JOIN representatives r ON r.id=c.representative_id
      WHERE (?='' OR c.name LIKE ? OR c.code LIKE ? OR c.phone LIKE ? OR c.area LIKE ?)
        AND (?='' OR c.representative_id=?) AND (?='' OR c.status=?)
      ORDER BY c.id DESC`, [search,`%${search}%`,`%${search}%`,`%${search}%`,`%${search}%`,representativeId,representativeId,status,status]);
  });

  safeHandle('customers:get', ({ id }) => {
    requirePermission('customers', 'view');
    const customer = row(`SELECT c.*,r.name AS representative_name FROM customers c LEFT JOIN representatives r ON r.id=c.representative_id WHERE c.id=?`, [id]);
    if (!customer) throw new Error('العميل غير موجود.');
    const collections = rows(`SELECT cl.*,r.name AS representative_name FROM collections cl LEFT JOIN representatives r ON r.id=cl.representative_id WHERE cl.customer_id=? ORDER BY cl.collection_date DESC,cl.id DESC`, [id]);
    const assignments = rows(`SELECT ca.*,r.name AS representative_name,u.full_name AS changed_by_name FROM customer_assignments ca LEFT JOIN representatives r ON r.id=ca.representative_id LEFT JOIN users u ON u.id=ca.changed_by WHERE ca.customer_id=? ORDER BY ca.started_at DESC`, [id]);
    const active = collections.filter((item) => item.status === 'active');
    const summary = {
      operations: active.length,
      collected: active.reduce((total,item)=>total+Number(item.amount||0),0),
      commissions: active.reduce((total,item)=>total+Number(item.commission_amount||0),0),
      net: active.reduce((total,item)=>total+Number(item.net_amount||0),0),
    };
    return { customer, collections, assignments, summary };
  });

  safeHandle('customers:create', ({ values }) => {
    requirePermission('customers', 'create');
    const v = values || {};
    if (!String(v.name || '').trim()) throw new Error('اسم العميل مطلوب.');
    const commission = v.commission_percentage === '' || v.commission_percentage == null ? null : Number(v.commission_percentage);
    if (commission != null && (commission < 0 || commission > 100)) throw new Error('نسبة العمولة يجب أن تكون بين 0 و100.');
    return transaction(() => {
      const code = v.code?.trim() || nextCode('customers', 'CUS');
      const id = run(`INSERT INTO customers (code,name,phone,address,area,representative_id,commission_percentage,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
        code,v.name.trim(),v.phone||'',v.address||'',v.area||'',v.representative_id||null,commission,v.status||'active',v.notes||'',nowIso(),nowIso(),
      ]);
      if (v.representative_id) run(`INSERT INTO customer_assignments (customer_id,representative_id,started_at,changed_by,notes) VALUES (?,?,?,?,?)`, [id,v.representative_id,nowIso(),currentUser.id,'إسناد أولي']);
      const created = row('SELECT * FROM customers WHERE id=?', [id]);
      audit('create', 'customer', id, null, created);
      return created;
    });
  });

  safeHandle('customers:update', ({ id, values }) => {
    requirePermission('customers', 'edit');
    const old = row('SELECT * FROM customers WHERE id=?', [id]);
    if (!old) throw new Error('العميل غير موجود.');
    const v = values || {};
    const commission = v.commission_percentage === '' ? null : (v.commission_percentage ?? old.commission_percentage);
    if (commission != null && (Number(commission) < 0 || Number(commission) > 100)) throw new Error('نسبة العمولة يجب أن تكون بين 0 و100.');
    transaction(() => {
      db.run(`UPDATE customers SET code=?,name=?,phone=?,address=?,area=?,commission_percentage=?,status=?,notes=?,updated_at=? WHERE id=?`, [
        v.code??old.code,v.name??old.name,v.phone??old.phone,v.address??old.address,v.area??old.area,commission,v.status??old.status,v.notes??old.notes,nowIso(),id,
      ]);
      audit('update', 'customer', id, old, row('SELECT * FROM customers WHERE id=?', [id]));
    });
    return row('SELECT * FROM customers WHERE id=?', [id]);
  });

  safeHandle('customers:transfer', ({ id, representativeId, notes = '' }) => {
    requirePermission('customers', 'edit');
    const old = row('SELECT * FROM customers WHERE id=?', [id]);
    if (!old) throw new Error('العميل غير موجود.');
    transaction(() => {
      db.run('UPDATE customer_assignments SET ended_at=? WHERE customer_id=? AND ended_at IS NULL', [nowIso(), id]);
      db.run('UPDATE customers SET representative_id=?,updated_at=? WHERE id=?', [representativeId || null, nowIso(), id]);
      if (representativeId) run(`INSERT INTO customer_assignments (customer_id,representative_id,started_at,changed_by,notes) VALUES (?,?,?,?,?)`, [id,representativeId,nowIso(),currentUser.id,notes]);
      audit('transfer', 'customer', id, { representative_id: old.representative_id }, { representative_id: representativeId || null, notes });
    });
    return row('SELECT * FROM customers WHERE id=?', [id]);
  });

  safeHandle('customers:delete', ({ id }) => {
    requirePermission('customers', 'delete');
    const old = row('SELECT * FROM customers WHERE id=?', [id]);
    if (!old) throw new Error('العميل غير موجود.');
    const history = Number(row(`SELECT (SELECT COUNT(*) FROM receivables WHERE customer_id=?) + (SELECT COUNT(*) FROM collections WHERE customer_id=?) AS count`, [id,id])?.count || 0);
    transaction(() => {
      if (history > 0) {
        db.run(`UPDATE customers SET status='inactive',updated_at=? WHERE id=?`, [nowIso(), id]);
        audit('deactivate', 'customer', id, old, row('SELECT * FROM customers WHERE id=?', [id]));
      } else {
        db.run('DELETE FROM customer_assignments WHERE customer_id=?', [id]);
        db.run('DELETE FROM customers WHERE id=?', [id]);
        audit('delete', 'customer', id, old, null);
      }
    });
    return { deactivated: history > 0 };
  });

  safeHandle('receivables:list', ({ search = '', status = '', customerId = '', representativeId = '' }) => {
    requirePermission('receivables', 'view');
    refreshDueStatuses();
    const list = rows(`SELECT rv.*,cu.name AS customer_name,r.name AS representative_name
      FROM receivables rv JOIN customers cu ON cu.id=rv.customer_id LEFT JOIN representatives r ON r.id=rv.representative_id
      WHERE (?='' OR rv.number LIKE ? OR rv.description LIKE ? OR cu.name LIKE ?)
        AND (?='' OR rv.status=?) AND (?='' OR rv.customer_id=?) AND (?='' OR rv.representative_id=?)
      ORDER BY rv.issue_date DESC,rv.id DESC`, [search,`%${search}%`,`%${search}%`,`%${search}%`,status,status,customerId,customerId,representativeId,representativeId]);
    return list;
  });

  safeHandle('receivables:create', ({ values }) => {
    requirePermission('receivables', 'create');
    const v = values || {};
    const customer = row('SELECT * FROM customers WHERE id=?', [v.customer_id]);
    if (!customer) throw new Error('اختر عميلاً صحيحاً.');
    const amount = Number(v.original_amount);
    if (!(amount > 0)) throw new Error('المبلغ يجب أن يكون أكبر من صفر.');
    const rep = customer.representative_id ? row('SELECT * FROM representatives WHERE id=?', [customer.representative_id]) : null;
    const commission = v.commission_percentage !== '' && v.commission_percentage != null
      ? Number(v.commission_percentage)
      : Number(customer.commission_percentage ?? rep?.default_commission ?? 0);
    if (commission < 0 || commission > 100) throw new Error('نسبة العمولة يجب أن تكون بين 0 و100.');
    return transaction(() => {
      const number = v.number?.trim() || nextCode('receivables', 'INV', 'number');
      const id = run(`INSERT INTO receivables (number,customer_id,representative_id,description,original_amount,paid_amount,remaining_amount,commission_percentage,issue_date,due_date,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,0,?,?,?,?,?,?,?,?)`, [
        number,customer.id,customer.representative_id||null,v.description?.trim()||'مبلغ مستحق',amount,amount,commission,v.issue_date||new Date().toISOString().slice(0,10),v.due_date||null,'unpaid',v.notes||'',nowIso(),nowIso(),
      ]);
      recalcReceivable(id);
      const created = row('SELECT * FROM receivables WHERE id=?', [id]);
      audit('create', 'receivable', id, null, created);
      return created;
    });
  });

  safeHandle('receivables:update', ({ id, values }) => {
    requirePermission('receivables', 'edit');
    const old = row('SELECT * FROM receivables WHERE id=?', [id]);
    if (!old) throw new Error('السجل غير موجود.');
    const amount = Number(values.original_amount ?? old.original_amount);
    if (amount < Number(old.paid_amount)) throw new Error('لا يمكن جعل أصل المبلغ أقل من المبلغ المقبوض.');
    const commission = Number(values.commission_percentage ?? old.commission_percentage);
    if (commission < 0 || commission > 100) throw new Error('نسبة العمولة يجب أن تكون بين 0 و100.');
    transaction(() => {
      db.run(`UPDATE receivables SET number=?,description=?,original_amount=?,commission_percentage=?,issue_date=?,due_date=?,notes=?,updated_at=? WHERE id=?`, [
        values.number??old.number,values.description??old.description,amount,commission,values.issue_date??old.issue_date,values.due_date??old.due_date,values.notes??old.notes,nowIso(),id,
      ]);
      recalcReceivable(id);
      audit('update', 'receivable', id, old, row('SELECT * FROM receivables WHERE id=?', [id]));
    });
    return row('SELECT * FROM receivables WHERE id=?', [id]);
  });

  safeHandle('receivables:delete', ({ id }) => {
    requirePermission('receivables', 'delete');
    const old = row('SELECT * FROM receivables WHERE id=?', [id]);
    if (!old) throw new Error('السجل غير موجود.');
    const count = Number(row('SELECT COUNT(*) AS count FROM collections WHERE receivable_id=?', [id])?.count || 0);
    transaction(() => {
      if (count > 0) {
        db.run(`UPDATE receivables SET status='cancelled',updated_at=? WHERE id=?`, [nowIso(), id]);
        audit('cancel', 'receivable', id, old, row('SELECT * FROM receivables WHERE id=?', [id]));
      } else {
        db.run('DELETE FROM receivables WHERE id=?', [id]);
        audit('delete', 'receivable', id, old, null);
      }
    });
    return { cancelled: count > 0 };
  });

  safeHandle('collections:list', ({ search = '', dateFrom = '', dateTo = '', representativeId = '', customerId = '', status = '' }) => {
    requirePermission('collections', 'view');
    return rows(`SELECT cl.*,cu.name AS customer_name,r.name AS representative_name
      FROM collections cl JOIN customers cu ON cu.id=cl.customer_id LEFT JOIN representatives r ON r.id=cl.representative_id
      WHERE (?='' OR cl.receipt_number LIKE ? OR cu.name LIKE ? OR r.name LIKE ?)
        AND (?='' OR cl.collection_date>=?) AND (?='' OR cl.collection_date<=?)
        AND (?='' OR cl.representative_id=?) AND (?='' OR cl.customer_id=?) AND (?='' OR cl.status=?)
      ORDER BY cl.collection_date DESC,cl.id DESC`, [search,`%${search}%`,`%${search}%`,`%${search}%`,dateFrom,dateFrom,dateTo,dateTo,representativeId,representativeId,customerId,customerId,status,status]);
  });

  safeHandle('collections:create', ({ values }) => {
    requirePermission('collections', 'create');
    const v = values || {};
    if (v.operation_token) {
      const existing = row('SELECT * FROM collections WHERE operation_token=?', [v.operation_token]);
      if (existing) return existing;
    }
    const representative = row(`SELECT * FROM representatives WHERE id=? AND status='active'`, [v.representative_id]);
    if (!representative) throw new Error('اختر مندوباً فعالاً.');
    const customer = row(`SELECT * FROM customers WHERE id=? AND status='active'`, [v.customer_id]);
    if (!customer) throw new Error('اختر عميلاً فعالاً.');
    if (customer.representative_id && Number(customer.representative_id) !== Number(representative.id)) throw new Error('العميل مرتبط بمندوب آخر. انقل العميل أولاً أو اختر مندوبه الحالي.');
    const amount = Number(v.amount);
    if (!(amount > 0)) throw new Error('المبلغ المقبوض يجب أن يكون أكبر من صفر.');
    const sourcePercentage = v.commission_percentage === '' || v.commission_percentage === undefined || v.commission_percentage === null
      ? (customer.commission_percentage ?? representative.default_commission ?? 0)
      : v.commission_percentage;
    const percentage = Number(sourcePercentage);
    if (percentage < 0 || percentage > 100) throw new Error('نسبة العمولة يجب أن تكون بين 0 و100.');
    const commissionAmount = Math.round((amount * percentage / 100) * 10000) / 10000;
    const netAmount = amount - commissionAmount;
    return transaction(() => {
      const settings = getSettings();
      const receipt = v.receipt_number?.trim() || nextCode('collections', settings.receipt_prefix || 'REC', 'receipt_number');
      const id = run(`INSERT INTO collections (operation_token,receipt_number,customer_id,receivable_id,representative_id,amount,commission_percentage,commission_amount,net_amount,collection_date,payment_method,notes,status,created_by,created_at,updated_at) VALUES (?,?,?,NULL,?,?,?,?,?,?,?,?,'active',?,?,?)`, [
        v.operation_token||null,receipt,customer.id,representative.id,amount,percentage,commissionAmount,netAmount,v.collection_date||new Date().toISOString().slice(0,10),v.payment_method||'cash',v.notes||'',currentUser.id,nowIso(),nowIso(),
      ]);
      const created = row('SELECT * FROM collections WHERE id=?', [id]);
      audit('create', 'collection', id, null, created);
      return created;
    });
  });

  safeHandle('collections:update', ({ id, values }) => {
    requirePermission('collections', 'edit');
    const old = row('SELECT * FROM collections WHERE id=?', [id]);
    if (!old || old.status !== 'active') throw new Error('عملية القبض غير موجودة أو ملغاة.');
    const representativeId = values.representative_id ?? old.representative_id;
    const customerId = values.customer_id ?? old.customer_id;
    const representative = row(`SELECT * FROM representatives WHERE id=? AND status='active'`, [representativeId]);
    if (!representative) throw new Error('اختر مندوباً فعالاً.');
    const customer = row(`SELECT * FROM customers WHERE id=? AND status='active'`, [customerId]);
    if (!customer) throw new Error('اختر عميلاً فعالاً.');
    if (customer.representative_id && Number(customer.representative_id) !== Number(representative.id)) throw new Error('العميل مرتبط بمندوب آخر. انقل العميل أولاً أو اختر مندوبه الحالي.');
    const amount = Number(values.amount ?? old.amount);
    if (!(amount > 0)) throw new Error('المبلغ المقبوض يجب أن يكون أكبر من صفر.');
    const percentage = Number(values.commission_percentage ?? old.commission_percentage);
    if (percentage < 0 || percentage > 100) throw new Error('نسبة العمولة يجب أن تكون بين 0 و100.');
    const commissionAmount = Math.round((amount * percentage / 100) * 10000) / 10000;
    transaction(() => {
      db.run(`UPDATE collections SET receipt_number=?,customer_id=?,receivable_id=NULL,representative_id=?,amount=?,commission_percentage=?,commission_amount=?,net_amount=?,collection_date=?,payment_method=?,notes=?,updated_at=? WHERE id=?`, [
        values.receipt_number??old.receipt_number,customer.id,representative.id,amount,percentage,commissionAmount,amount-commissionAmount,values.collection_date??old.collection_date,values.payment_method??old.payment_method,values.notes??old.notes,nowIso(),id,
      ]);
      audit('update', 'collection', id, old, row('SELECT * FROM collections WHERE id=?', [id]));
    });
    return row('SELECT * FROM collections WHERE id=?', [id]);
  });

  safeHandle('collections:cancel', ({ id, reason = '' }) => {
    requirePermission('collections', 'delete');
    const old = row('SELECT * FROM collections WHERE id=?', [id]);
    if (!old || old.status !== 'active') throw new Error('عملية القبض غير موجودة أو ملغاة مسبقاً.');
    transaction(() => {
      db.run(`UPDATE collections SET status='cancelled',cancelled_at=?,cancelled_by=?,notes=?,updated_at=? WHERE id=?`, [nowIso(),currentUser.id,[old.notes,reason && `سبب الإلغاء: ${reason}`].filter(Boolean).join('\n'),nowIso(),id]);
      audit('cancel', 'collection', id, old, row('SELECT * FROM collections WHERE id=?', [id]));
    });
    return true;
  });

  safeHandle('collections:receipt', ({ id }) => {
    requirePermission('collections', 'view');
    const receipt = row(`SELECT cl.*,cu.name AS customer_name,cu.phone AS customer_phone,r.name AS representative_name,u.full_name AS created_by_name
      FROM collections cl JOIN customers cu ON cu.id=cl.customer_id LEFT JOIN representatives r ON r.id=cl.representative_id LEFT JOIN users u ON u.id=cl.created_by WHERE cl.id=?`, [id]);
    if (!receipt) throw new Error('الإيصال غير موجود.');
    return { receipt, settings: getSettings() };
  });

  safeHandle('settlements:list', ({ representativeId = '', dateFrom = '', dateTo = '' }) => {
    requirePermission('settlements', 'view');
    return rows(`SELECT s.*,r.name AS representative_name,u.full_name AS created_by_name FROM settlements s JOIN representatives r ON r.id=s.representative_id LEFT JOIN users u ON u.id=s.created_by
      WHERE (?='' OR s.representative_id=?) AND (?='' OR s.settlement_date>=?) AND (?='' OR s.settlement_date<=?) ORDER BY s.settlement_date DESC,s.id DESC`, [representativeId,representativeId,dateFrom,dateFrom,dateTo,dateTo]);
  });

  safeHandle('settlements:balance', ({ representativeId }) => {
    requirePermission('settlements', 'view');
    const r = row(`SELECT
      COALESCE((SELECT SUM(net_amount) FROM collections WHERE representative_id=? AND status='active'),0) AS due,
      COALESCE((SELECT SUM(amount) FROM settlements WHERE representative_id=?),0) AS delivered`, [representativeId,representativeId]);
    return { ...r, outstanding: Number(r.due || 0) - Number(r.delivered || 0) };
  });

  safeHandle('settlements:create', ({ values }) => {
    requirePermission('settlements', 'create');
    const v = values || {};
    const amount = Number(v.amount);
    if (!(amount > 0)) throw new Error('المبلغ المسلم يجب أن يكون أكبر من صفر.');
    const balance = row(`SELECT COALESCE((SELECT SUM(net_amount) FROM collections WHERE representative_id=? AND status='active'),0) - COALESCE((SELECT SUM(amount) FROM settlements WHERE representative_id=?),0) AS outstanding`, [v.representative_id,v.representative_id]);
    if (amount > Number(balance?.outstanding || 0) + 0.000001) throw new Error('المبلغ المسلم أكبر من الرصيد المستحق على المندوب.');
    return transaction(() => {
      const settings = getSettings();
      const number = v.number?.trim() || nextCode('settlements', settings.settlement_prefix || 'SET', 'number');
      const id = run(`INSERT INTO settlements (number,representative_id,amount,settlement_date,payment_method,reference_number,received_by,notes,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
        number,v.representative_id,amount,v.settlement_date||new Date().toISOString().slice(0,10),v.payment_method||'cash',v.reference_number||'',v.received_by||currentUser.fullName,v.notes||'',currentUser.id,nowIso(),nowIso(),
      ]);
      const created = row('SELECT * FROM settlements WHERE id=?', [id]);
      audit('create', 'settlement', id, null, created);
      return created;
    });
  });

  safeHandle('settlements:delete', ({ id }) => {
    requirePermission('settlements', 'delete');
    const old = row('SELECT * FROM settlements WHERE id=?', [id]);
    if (!old) throw new Error('التسليم غير موجود.');
    transaction(() => {
      db.run('DELETE FROM settlements WHERE id=?', [id]);
      audit('delete', 'settlement', id, old, null);
    });
    return true;
  });

  safeHandle('balances:list', () => {
    requirePermission('balances', 'view');
    const representatives = rows(`SELECT r.id,r.code,r.name,
      COALESCE((SELECT SUM(amount) FROM collections c WHERE c.representative_id=r.id AND c.status='active'),0) AS collected,
      COALESCE((SELECT SUM(commission_amount) FROM collections c WHERE c.representative_id=r.id AND c.status='active'),0) AS commissions,
      COALESCE((SELECT SUM(net_amount) FROM collections c WHERE c.representative_id=r.id AND c.status='active'),0) AS due_to_admin,
      COALESCE((SELECT SUM(amount) FROM settlements s WHERE s.representative_id=r.id),0) AS delivered
      FROM representatives r ORDER BY r.name`);
    representatives.forEach((r) => { r.outstanding = Number(r.due_to_admin) - Number(r.delivered); });
    const customers = rows(`SELECT c.id,c.code,c.name,r.name AS representative_name,
      (SELECT COUNT(*) FROM collections cl WHERE cl.customer_id=c.id AND cl.status='active') AS collections_count,
      COALESCE((SELECT SUM(amount) FROM collections cl WHERE cl.customer_id=c.id AND cl.status='active'),0) AS collected,
      COALESCE((SELECT SUM(commission_amount) FROM collections cl WHERE cl.customer_id=c.id AND cl.status='active'),0) AS commissions,
      COALESCE((SELECT SUM(net_amount) FROM collections cl WHERE cl.customer_id=c.id AND cl.status='active'),0) AS net
      FROM customers c LEFT JOIN representatives r ON r.id=c.representative_id ORDER BY collected DESC,c.name`);
    return { representatives, customers };
  });

  safeHandle('users:list', () => {
    requirePermission('users', 'view');
    return rows('SELECT id,username,full_name,role,permissions,active,created_at,updated_at FROM users ORDER BY id DESC').map((u) => ({ ...u, permissions: normalizePermissions(u.role, u.permissions) }));
  });

  safeHandle('users:create', async ({ values }) => {
    requirePermission('users', 'create');
    const v = values || {};
    if (!String(v.username || '').trim() || String(v.username).trim().length < 3) throw new Error('اسم المستخدم يجب أن يكون 3 أحرف على الأقل.');
    if (!String(v.full_name || '').trim()) throw new Error('الاسم الكامل مطلوب.');
    if (!v.password || String(v.password).length < 6) throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
    if (!['admin','user','viewer'].includes(v.role)) throw new Error('الدور غير صالح.');
    const hash = await bcrypt.hash(String(v.password), 12);
    const permissions = normalizePermissions(v.role, v.permissions);
    return transaction(() => {
      const id = run(`INSERT INTO users (username,full_name,password_hash,role,permissions,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`, [
        v.username.trim(),v.full_name.trim(),hash,v.role,JSON.stringify(permissions),v.active === false ? 0 : 1,nowIso(),nowIso(),
      ]);
      const created = row('SELECT id,username,full_name,role,permissions,active,created_at,updated_at FROM users WHERE id=?', [id]);
      audit('create', 'user', id, null, { ...created, password_hash: undefined });
      return { ...created, permissions };
    });
  });

  safeHandle('users:update', async ({ id, values }) => {
    requirePermission('users', 'edit');
    const old = row('SELECT * FROM users WHERE id=?', [id]);
    if (!old) throw new Error('المستخدم غير موجود.');
    if (Number(id) === currentUser.id && values.active === false) throw new Error('لا يمكنك تعطيل حسابك الحالي.');
    const role = values.role ?? old.role;
    const adminCount = Number(row(`SELECT COUNT(*) AS count FROM users WHERE role='admin' AND active=1`)?.count || 0);
    if (old.role === 'admin' && role !== 'admin' && adminCount <= 1) throw new Error('لا يمكن تغيير دور آخر مدير فعال.');
    const permissions = normalizePermissions(role, values.permissions ?? old.permissions);
    transaction(() => {
      let hash = old.password_hash;
      if (values.password) {
        if (String(values.password).length < 6) throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
        hash = bcrypt.hashSync(String(values.password), 12);
      }
      db.run(`UPDATE users SET username=?,full_name=?,password_hash=?,role=?,permissions=?,active=?,updated_at=? WHERE id=?`, [
        values.username??old.username,values.full_name??old.full_name,hash,role,JSON.stringify(permissions),values.active === undefined ? old.active : (values.active?1:0),nowIso(),id,
      ]);
      const updated = row('SELECT * FROM users WHERE id=?', [id]);
      audit('update', 'user', id, { ...old, password_hash: undefined }, { ...updated, password_hash: undefined });
      if (Number(id) === currentUser.id) currentUser = { id:Number(id),username:updated.username,fullName:updated.full_name,role:updated.role,permissions };
    });
    const updated = row('SELECT id,username,full_name,role,permissions,active,created_at,updated_at FROM users WHERE id=?', [id]);
    return { ...updated, permissions };
  });

  safeHandle('users:delete', ({ id }) => {
    requirePermission('users', 'delete');
    if (Number(id) === currentUser.id) throw new Error('لا يمكنك حذف حسابك الحالي.');
    const old = row('SELECT * FROM users WHERE id=?', [id]);
    if (!old) throw new Error('المستخدم غير موجود.');
    const adminCount = Number(row(`SELECT COUNT(*) AS count FROM users WHERE role='admin' AND active=1`)?.count || 0);
    if (old.role === 'admin' && adminCount <= 1) throw new Error('لا يمكن حذف آخر مدير فعال.');
    transaction(() => {
      db.run('UPDATE users SET active=0,updated_at=? WHERE id=?', [nowIso(), id]);
      audit('deactivate', 'user', id, { ...old, password_hash: undefined }, { active: 0 });
    });
    return true;
  });

  safeHandle('audit:list', ({ search = '', entityType = '', action = '', dateFrom = '', dateTo = '' }) => {
    requirePermission('audit', 'view');
    return rows(`SELECT * FROM audit_logs WHERE (?='' OR username LIKE ? OR entity_type LIKE ? OR entity_id LIKE ?)
      AND (?='' OR entity_type=?) AND (?='' OR action=?) AND (?='' OR substr(created_at,1,10)>=?) AND (?='' OR substr(created_at,1,10)<=?)
      ORDER BY id DESC LIMIT 1000`, [search,`%${search}%`,`%${search}%`,`%${search}%`,entityType,entityType,action,action,dateFrom,dateFrom,dateTo,dateTo]);
  });

  safeHandle('reports:run', ({ type, filters = {} }) => {
    requirePermission('reports', 'view');
    refreshDueStatuses();
    const f = filters;
    if (type === 'representatives') {
      return rows(`SELECT r.code AS code,r.name AS name,
        COALESCE((SELECT COUNT(*) FROM customers c WHERE c.representative_id=r.id),0) AS customers,
        COALESCE((SELECT COUNT(*) FROM collections c WHERE c.representative_id=r.id AND c.status='active'),0) AS operations,
        COALESCE((SELECT SUM(amount) FROM collections c WHERE c.representative_id=r.id AND c.status='active'),0) AS collected,
        COALESCE((SELECT SUM(commission_amount) FROM collections c WHERE c.representative_id=r.id AND c.status='active'),0) AS commissions,
        COALESCE((SELECT SUM(net_amount) FROM collections c WHERE c.representative_id=r.id AND c.status='active'),0) AS net,
        COALESCE((SELECT SUM(amount) FROM settlements s WHERE s.representative_id=r.id),0) AS delivered
        FROM representatives r ORDER BY r.name`);
    }
    if (type === 'customers') {
      return rows(`SELECT c.code,c.name,r.name AS representative_name,c.area,
        (SELECT COUNT(*) FROM collections cl WHERE cl.customer_id=c.id AND cl.status='active') AS operations,
        COALESCE((SELECT SUM(amount) FROM collections cl WHERE cl.customer_id=c.id AND cl.status='active'),0) AS collected,
        COALESCE((SELECT SUM(commission_amount) FROM collections cl WHERE cl.customer_id=c.id AND cl.status='active'),0) AS commissions,
        COALESCE((SELECT SUM(net_amount) FROM collections cl WHERE cl.customer_id=c.id AND cl.status='active'),0) AS net
        FROM customers c LEFT JOIN representatives r ON r.id=c.representative_id
        WHERE (?='' OR c.representative_id=?) AND (?='' OR c.area=?) ORDER BY c.name`, [f.representativeId||'',f.representativeId||'',f.area||'',f.area||'']);
    }
    if (type === 'collections' || type === 'commissions') {
      return rows(`SELECT cl.receipt_number,cl.collection_date,cu.name AS customer_name,r.name AS representative_name,cl.amount,cl.commission_percentage,cl.commission_amount,cl.net_amount,cl.payment_method,cl.status
        FROM collections cl JOIN customers cu ON cu.id=cl.customer_id LEFT JOIN representatives r ON r.id=cl.representative_id
        WHERE (?='' OR cl.collection_date>=?) AND (?='' OR cl.collection_date<=?) AND (?='' OR cl.representative_id=?) AND (?='' OR cl.customer_id=?) AND (?='' OR cl.payment_method=?)
        ORDER BY cl.collection_date DESC,cl.id DESC`, [f.dateFrom||'',f.dateFrom||'',f.dateTo||'',f.dateTo||'',f.representativeId||'',f.representativeId||'',f.customerId||'',f.customerId||'',f.paymentMethod||'',f.paymentMethod||'']);
    }
    if (type === 'settlements') {
      return rows(`SELECT s.number,s.settlement_date,r.name AS representative_name,s.amount,s.payment_method,s.reference_number,s.received_by,s.notes
        FROM settlements s JOIN representatives r ON r.id=s.representative_id
        WHERE (?='' OR s.settlement_date>=?) AND (?='' OR s.settlement_date<=?) AND (?='' OR s.representative_id=?) ORDER BY s.settlement_date DESC`, [f.dateFrom||'',f.dateFrom||'',f.dateTo||'',f.dateTo||'',f.representativeId||'',f.representativeId||'']);
    }
    throw new Error('نوع التقرير غير معروف.');
  });

  safeHandle('backup:create', async () => {
    requirePermission('settings', 'export');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'حفظ نسخة احتياطية',
      defaultPath: `Nexora-Collect-Backup-${new Date().toISOString().slice(0,10)}.sqlite`,
      filters: [{ name: 'SQLite Database', extensions: ['sqlite'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    persistDb();
    fs.copyFileSync(dbPath, result.filePath);
    transaction(() => audit('backup', 'database', null, null, { path: result.filePath }));
    return { canceled: false, filePath: result.filePath };
  });

  safeHandle('backup:restore', async () => {
    requirePermission('settings', 'edit');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'استعادة نسخة احتياطية',
      properties: ['openFile'],
      filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const backupCurrent = `${dbPath}.before-restore-${Date.now()}`;
    persistDb();
    fs.copyFileSync(dbPath, backupCurrent);
    fs.copyFileSync(result.filePaths[0], dbPath);
    try {
      await initializeDatabase();
    } catch (error) {
      fs.copyFileSync(backupCurrent, dbPath);
      await initializeDatabase();
      throw new Error('ملف النسخة الاحتياطية غير صالح أو تالف. تمت إعادة قاعدة البيانات الحالية بأمان.');
    }
    currentUser = null;
    return { canceled: false, restartRequired: true, safetyBackup: backupCurrent };
  });

  safeHandle('export:excel', async ({ title, base64 }) => {
    requireAuth();
    if (!hasPermission('reports', 'export')) throw new Error('ليس لديك صلاحية تصدير التقارير.');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'حفظ ملف Excel',
      defaultPath: `${String(title || 'report').replace(/[\\/:*?"<>|]/g, '-')}.xlsx`,
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    fs.writeFileSync(result.filePath, Buffer.from(String(base64 || ''), 'base64'));
    return { canceled: false, filePath: result.filePath };
  });

  safeHandle('export:pdf', async ({ title, html }) => {
    requireAuth();
    if (!hasPermission('reports', 'export') && !hasPermission('collections', 'export')) throw new Error('ليس لديك صلاحية التصدير.');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'حفظ ملف PDF',
      defaultPath: `${String(title || 'report').replace(/[\\/:*?"<>|]/g, '-')}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    try {
      const headerPath = path.join(__dirname, 'assets', 'altakamul-pdf-header.png');
      if (!fs.existsSync(headerPath)) throw new Error('صورة رأس تقارير PDF غير موجودة داخل البرنامج.');
      const generatedBy = currentUser?.fullName || currentUser?.username || '';
      const generatedAt = new Date().toLocaleString('ar-IQ');
      const footer = `<footer>تم إنشاء المستند بواسطة ${generatedBy} — ${generatedAt}</footer>`;
      const doc = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
        *{box-sizing:border-box}
        html,body{margin:0;padding:0}
        body{font-family:Arial,Tahoma,sans-serif;direction:rtl;color:#111827;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        h1,h2{text-align:center;margin-top:0}
        table{width:100%;border-collapse:collapse;margin-top:16px;page-break-inside:auto}
        thead{display:table-header-group}
        tfoot{display:table-footer-group}
        tr{page-break-inside:avoid;page-break-after:auto}
        th,td{border:1px solid #cbd5e1;padding:8px;text-align:right;font-size:12px;vertical-align:top}
        th{background:#f1f5f9}
        .meta{display:flex;justify-content:space-between;gap:16px;margin:12px 0;page-break-inside:avoid}
        .total{font-weight:700;background:#ecfeff}
        footer{margin-top:28px;padding-top:10px;border-top:1px solid #cbd5e1;color:#64748b;font-size:10px;text-align:center}
        @page{size:A4;margin:58mm 12mm 18mm 12mm}
      </style></head><body>${html}${footer}</body></html>`;
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(doc)}`);
      const rawPdf = await printWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });

      // Stamp the official company letterhead into the reserved top margin of every page.
      // This guarantees that it repeats on multi-page reports and receipts without
      // covering titles, metadata, tables, or totals.
      const pdfDocument = await PDFDocument.load(rawPdf);
      const headerImage = await pdfDocument.embedPng(fs.readFileSync(headerPath));
      const sideMarginPoints = 14 * 72 / 25.4;
      const topMarginPoints = 7 * 72 / 25.4;
      for (const page of pdfDocument.getPages()) {
        const { width, height } = page.getSize();
        const imageWidth = width - (sideMarginPoints * 2);
        const imageHeight = imageWidth * (headerImage.height / headerImage.width);
        page.drawImage(headerImage, {
          x: sideMarginPoints,
          y: height - topMarginPoints - imageHeight,
          width: imageWidth,
          height: imageHeight,
        });
      }
      const finalPdf = await pdfDocument.save();
      fs.writeFileSync(result.filePath, finalPdf);
    } finally {
      if (!printWindow.isDestroyed()) printWindow.destroy();
    }
    return { canceled: false, filePath: result.filePath };
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#f8fafc',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(async () => {
  await initializeDatabase();
  if (process.argv.includes('--smoke-test')) {
    const tableCount = Number(row("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table'")?.count || 0);
    if (tableCount < 8) throw new Error('Database schema smoke test failed.');
    console.log('Nexora Collect smoke test passed.');
    app.quit();
    return;
  }
  registerIpc();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try { persistDb(); } catch (_) {}
});
