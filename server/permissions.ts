export const PAGE_KEYS = ['dashboard','representatives','customers','collections','settlements','balances','reports','users','audit','settings'] as const;
export const ACTION_KEYS = ['view','create','edit','delete','export'] as const;

export type Role = 'admin' | 'user' | 'viewer';

export function blankPermissions() {
  return Object.fromEntries(PAGE_KEYS.map((page) => [page, Object.fromEntries(ACTION_KEYS.map((action) => [action, false]))]));
}

export function normalizePermissions(role: Role, input: unknown) {
  const result: Record<string, Record<string, boolean>> = blankPermissions();
  const source = input && typeof input === 'object' ? input as Record<string, any> : {};
  for (const page of PAGE_KEYS) {
    for (const action of ACTION_KEYS) {
      if (role === 'admin') result[page][action] = true;
      else if (role === 'viewer' && !['view', 'export'].includes(action)) result[page][action] = false;
      else result[page][action] = Boolean(source?.[page]?.[action]);
    }
  }
  return result;
}

export function usernameToEmail(username: string) {
  const domain = process.env.NEXORA_AUTH_DOMAIN || 'users.nexora.app';
  const normalized = String(username || '').trim().toLowerCase();
  let hash = 14695981039346656037n;
  for (const character of normalized) {
    hash ^= BigInt(character.codePointAt(0) || 0);
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return `u-${hash.toString(16).padStart(16, '0')}@${domain}`;
}
