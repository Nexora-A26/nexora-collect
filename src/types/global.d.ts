export {};

declare global {
  type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'export';
  type PageKey = 'dashboard' | 'representatives' | 'customers' | 'collections' | 'settlements' | 'balances' | 'reports' | 'users' | 'audit' | 'settings';
  type PermissionMap = Record<PageKey, Record<PermissionAction, boolean>>;

  type AppUser = {
    id: number;
    username: string;
    fullName: string;
    role: 'admin' | 'user' | 'viewer';
    permissions: PermissionMap;
  };

  type AnyRecord = Record<string, any>;

  interface NexoraApi {
    invoke: <T = any>(channel: string, payload?: any) => Promise<T>;
    app: { openExternal(url: string): Promise<any> };
    auth: {
      status(): Promise<{ needsSetup: boolean; user: AppUser | null }>;
      setupAdmin(values: AnyRecord): Promise<AppUser>;
      login(values: AnyRecord): Promise<AppUser>;
      logout(): Promise<boolean>;
    };
    dashboard: { get(): Promise<AnyRecord> };
    settings: { get(): Promise<AnyRecord>; update(values: AnyRecord): Promise<AnyRecord> };
    representatives: {
      list(filters?: AnyRecord): Promise<AnyRecord[]>;
      get(id: number): Promise<AnyRecord>;
      create(values: AnyRecord): Promise<AnyRecord>;
      update(id: number, values: AnyRecord): Promise<AnyRecord>;
      remove(id: number): Promise<AnyRecord>;
    };
    customers: {
      list(filters?: AnyRecord): Promise<AnyRecord[]>;
      get(id: number): Promise<AnyRecord>;
      create(values: AnyRecord): Promise<AnyRecord>;
      update(id: number, values: AnyRecord): Promise<AnyRecord>;
      transfer(id: number, representativeId: number | null, notes?: string): Promise<AnyRecord>;
      remove(id: number): Promise<AnyRecord>;
    };
    receivables: {
      list(filters?: AnyRecord): Promise<AnyRecord[]>;
      create(values: AnyRecord): Promise<AnyRecord>;
      update(id: number, values: AnyRecord): Promise<AnyRecord>;
      remove(id: number): Promise<AnyRecord>;
    };
    collections: {
      list(filters?: AnyRecord): Promise<AnyRecord[]>;
      create(values: AnyRecord): Promise<AnyRecord>;
      update(id: number, values: AnyRecord): Promise<AnyRecord>;
      remove(id: number, reason?: string): Promise<boolean>;
      cancel(id: number, reason?: string): Promise<boolean>;
      receipt(id: number): Promise<AnyRecord>;
    };
    settlements: {
      list(filters?: AnyRecord): Promise<AnyRecord[]>;
      balance(representativeId: number): Promise<AnyRecord>;
      create(values: AnyRecord): Promise<AnyRecord>;
      remove(id: number): Promise<boolean>;
    };
    balances: { list(): Promise<AnyRecord> };
    users: {
      list(): Promise<AnyRecord[]>;
      create(values: AnyRecord): Promise<AnyRecord>;
      update(id: number, values: AnyRecord): Promise<AnyRecord>;
      remove(id: number): Promise<boolean>;
    };
    audit: { list(filters?: AnyRecord): Promise<AnyRecord[]> };
    reports: { run(type: string, filters?: AnyRecord): Promise<AnyRecord[]> };
    backup: { create(): Promise<AnyRecord>; restore(): Promise<AnyRecord> };
    export: { pdf(title: string, html: string): Promise<AnyRecord>; excel(title: string, base64: string): Promise<AnyRecord> };
  }

  interface Window { nexora: NexoraApi; }
}
