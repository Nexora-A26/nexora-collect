import React, { createContext, ReactNode, useContext } from 'react';

type AuthValue = {
  user: AppUser;
  settings: Record<string, any>;
  refreshSettings(): Promise<void>;
  logout(): Promise<void>;
  can(page: PageKey, action?: PermissionAction): boolean;
  money(value: unknown): string;
};

export const AuthContext = createContext<AuthValue | null>(null);
export function AuthProvider({ value, children }: { value: AuthValue; children: ReactNode }) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthContext unavailable');
  return value;
}
