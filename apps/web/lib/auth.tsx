'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ApiFailure, User } from './types';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  request<T>(path: string, init?: RequestInit): Promise<T>;
  download(path: string): Promise<Blob>;
  login(email: string, password: string): Promise<User>;
  signup(email: string, password: string): Promise<User>;
  logout(): Promise<void>;
  acceptConsent(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export class ApiError extends Error {
  constructor(
    readonly detail: ApiFailure,
    readonly status: number,
  ) {
    super(detail.message);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        setToken(null);
        setUser(null);
        return null;
      }
      const session = (await response.json()) as {
        accessToken: string;
        user: User;
      };
      setToken(session.accessToken);
      setUser(session.user);
      return session.accessToken;
    } catch {
      setToken(null);
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    const initialize = async () => {
      await refresh();
      setLoading(false);
    };
    void initialize();
  }, [refresh]);

  const request = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const execute = (access: string | null) =>
        fetch(`${API_URL}${path}`, {
          ...init,
          credentials: 'include',
          headers: {
            ...(init.body instanceof FormData
              ? {}
              : { 'Content-Type': 'application/json' }),
            ...(access ? { Authorization: `Bearer ${access}` } : {}),
            ...init.headers,
          },
        });
      let response = await execute(token);
      if (response.status === 401) response = await execute(await refresh());
      if (!response.ok) {
        const detail = (await response.json().catch(() => ({
          code: 'REQUEST_FAILED',
          message: 'That did not work. Please try again.',
          retryable: true,
        }))) as ApiFailure;
        throw new ApiError(detail, response.status);
      }
      if (response.status === 204) return undefined as T;
      return response.json() as Promise<T>;
    },
    [refresh, token],
  );

  const download = useCallback(
    async (path: string): Promise<Blob> => {
      const execute = (access: string | null) =>
        fetch(`${API_URL}${path}`, {
          credentials: 'include',
          headers: access ? { Authorization: `Bearer ${access}` } : {},
        });
      let response = await execute(token);
      if (response.status === 401) response = await execute(await refresh());
      if (!response.ok) {
        const detail = (await response.json().catch(() => ({
          code: 'DOWNLOAD_FAILED',
          message: 'The file is temporarily unavailable.',
          retryable: true,
        }))) as ApiFailure;
        throw new ApiError(detail, response.status);
      }
      return response.blob();
    },
    [refresh, token],
  );

  const authenticate = useCallback(
    async (mode: 'login' | 'signup', email: string, password: string) => {
      const response = await fetch(`${API_URL}/auth/${mode}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok)
        throw new ApiError(
          (await response.json()) as ApiFailure,
          response.status,
        );
      const session = (await response.json()) as {
        accessToken: string;
        user: User;
      };
      setToken(session.accessToken);
      setUser(session.user);
      return session.user;
    },
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      request,
      download,
      login: (email, password) => authenticate('login', email, password),
      signup: (email, password) => authenticate('signup', email, password),
      logout: async () => {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          credentials: 'include',
        });
        setToken(null);
        setUser(null);
      },
      acceptConsent: async () => {
        await request('/auth/consent', { method: 'PUT' });
        setUser((current) =>
          current ? { ...current, hasAiConsent: true } : current,
        );
      },
    }),
    [authenticate, download, loading, request, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}
