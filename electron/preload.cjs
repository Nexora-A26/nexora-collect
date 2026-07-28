const { contextBridge, ipcRenderer } = require('electron');

const invoke = async (channel, payload) => {
  const result = await ipcRenderer.invoke(channel, payload);
  if (!result?.ok) throw new Error(result?.error || 'حدث خطأ غير متوقع.');
  return result.data;
};

contextBridge.exposeInMainWorld('nexora', {
  invoke,
  app: { openExternal: (url) => invoke('app:openExternal', { url }) },
  auth: {
    status: () => invoke('auth:status'),
    setupAdmin: (values) => invoke('auth:setupAdmin', values),
    login: (values) => invoke('auth:login', values),
    logout: () => invoke('auth:logout'),
  },
  dashboard: { get: () => invoke('dashboard:get') },
  settings: { get: () => invoke('settings:get'), update: (values) => invoke('settings:update', { values }) },
  representatives: {
    list: (filters) => invoke('representatives:list', filters),
    get: (id) => invoke('representatives:get', { id }),
    create: (values) => invoke('representatives:create', { values }),
    update: (id, values) => invoke('representatives:update', { id, values }),
    remove: (id) => invoke('representatives:delete', { id }),
  },
  customers: {
    list: (filters) => invoke('customers:list', filters),
    get: (id) => invoke('customers:get', { id }),
    create: (values) => invoke('customers:create', { values }),
    update: (id, values) => invoke('customers:update', { id, values }),
    transfer: (id, representativeId, notes) => invoke('customers:transfer', { id, representativeId, notes }),
    remove: (id) => invoke('customers:delete', { id }),
  },
  receivables: {
    list: (filters) => invoke('receivables:list', filters),
    create: (values) => invoke('receivables:create', { values }),
    update: (id, values) => invoke('receivables:update', { id, values }),
    remove: (id) => invoke('receivables:delete', { id }),
  },
  collections: {
    list: (filters) => invoke('collections:list', filters),
    create: (values) => invoke('collections:create', { values }),
    update: (id, values) => invoke('collections:update', { id, values }),
    cancel: (id, reason) => invoke('collections:cancel', { id, reason }),
    receipt: (id) => invoke('collections:receipt', { id }),
  },
  settlements: {
    list: (filters) => invoke('settlements:list', filters),
    balance: (representativeId) => invoke('settlements:balance', { representativeId }),
    create: (values) => invoke('settlements:create', { values }),
    remove: (id) => invoke('settlements:delete', { id }),
  },
  balances: { list: () => invoke('balances:list') },
  users: {
    list: () => invoke('users:list'),
    create: (values) => invoke('users:create', { values }),
    update: (id, values) => invoke('users:update', { id, values }),
    remove: (id) => invoke('users:delete', { id }),
  },
  audit: { list: (filters) => invoke('audit:list', filters) },
  reports: { run: (type, filters) => invoke('reports:run', { type, filters }) },
  backup: { create: () => invoke('backup:create'), restore: () => invoke('backup:restore') },
  export: {
    pdf: (title, html) => invoke('export:pdf', { title, html }),
    excel: (title, base64) => invoke('export:excel', { title, base64 }),
  },
});
