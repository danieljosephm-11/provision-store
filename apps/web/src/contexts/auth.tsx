import * as React from 'react';
import type { AuthUser } from '@ps/shared';
import { api, onUnauthorized, refreshAccessToken, setAccessToken } from '@/lib/api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  can: (permission: string | string[]) => boolean;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refreshUser = React.useCallback(async () => {
    const { user: current } = await api.get<{ user: AuthUser }>('/auth/me');
    setUser(current);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          const { user: current } = await api.get<{ user: AuthUser }>('/auth/me');
          if (!cancelled) setUser(current);
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    onUnauthorized(() => setUser(null));
    return () => onUnauthorized(null);
  }, []);

  const login = React.useCallback(async (email: string, password: string) => {
    const result = await api.post<{ user: AuthUser; accessToken: string; expiresIn: number }>(
      '/auth/login',
      { email, password },
    );
    setAccessToken(result.accessToken);
    setUser(result.user);
    return result.user;
  }, []);

  const logout = React.useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // The cookie is cleared server-side; ignore network failures.
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  const can = React.useCallback(
    (permission: string | string[]) => {
      if (!user) return false;
      const required = Array.isArray(permission) ? permission : [permission];
      return required.some((key) => user.permissions.includes(key));
    },
    [user],
  );

  const value = React.useMemo<AuthContextValue>(
    () => ({ user, loading, login, logout, refreshUser, can }),
    [user, loading, login, logout, refreshUser, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
