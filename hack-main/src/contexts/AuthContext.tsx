import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { request } from '../lib/api';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (
    name: string,
    email: string,
    password: string,
    country: string,
    role: User['role'],
    adminKey?: string
  ) => Promise<User>;
  signOut: () => void;
  configError: string | null;
  refreshUser: () => Promise<void>;
}

const TOKEN_STORAGE_KEY = 'expense-manager-token';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  const apiUrl = import.meta.env.VITE_API_URL;

  const persistToken = useCallback((value: string | null) => {
    if (value) {
      localStorage.setItem(TOKEN_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
    setToken(value);
  }, []);

  const loadUser = useCallback(
    async (authToken: string) => {
      try {
        const data = await request<{ user: User }>('/api/auth/me', authToken);
        setUser(data.user);
        setConfigError(null);
      } catch (error: unknown) {
        const apiError = error as { status?: number; message?: string } | undefined;
        if (apiError?.status === 401) {
          persistToken(null);
          setUser(null);
        } else {
          setConfigError(apiError?.message || 'Failed to reach the API');
        }
      }
    },
    [persistToken]
  );

  useEffect(() => {
    let cancelled = false;

    if (!apiUrl) {
      setConfigError('Missing VITE_API_URL environment variable. Update your .env file.');
      setLoading(false);
      return;
    }

    if (!token) {
      setLoading(false);
      return;
    }

    (async () => {
      await loadUser(token);
      if (!cancelled) {
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiUrl, token, loadUser]);

  useEffect(() => {
    if (apiUrl && (!token || user)) {
      setLoading(false);
    }
  }, [apiUrl, token, user]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!apiUrl) {
        throw new Error('API is not configured. Set VITE_API_URL in your .env file.');
      }

      const data = await request<{ token: string; user: User }>('/api/auth/login', null, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      persistToken(data.token);
      setUser(data.user);
      return data.user;
    },
    [apiUrl, persistToken]
  );

  const signUp = useCallback(
    async (
      name: string,
      email: string,
      password: string,
      country: string,
      role: User['role'],
      adminKey?: string
    ) => {
      if (!apiUrl) {
        throw new Error('API is not configured. Set VITE_API_URL in your .env file.');
      }

      // Prepare payload for admin signup
      const payload: {
        name: string;
        email: string;
        password: string;
        country: string;
        role: User['role'];
        adminSignupKey?: string;
        companyName?: string;
        defaultCurrency?: string;
      } = {
        name,
        email,
        password,
        role,
        country,
      };

      // For admin signup, add required fields
      if (role === 'admin') {
        payload.adminSignupKey = adminKey;
        payload.companyName = `${name}'s Company`; // Default company name
        payload.defaultCurrency = 'USD'; // Default currency
      }

      const data = await request<{ token: string; user: User }>('/api/auth/signup', null, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      persistToken(data.token);
      setUser(data.user);
      return data.user;
    },
    [apiUrl, persistToken]
  );

  const signOut = useCallback(() => {
    persistToken(null);
    setUser(null);
  }, [persistToken]);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    await loadUser(token);
  }, [loadUser, token]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      signIn,
      signUp,
      signOut,
      configError,
      refreshUser,
    }),
    [configError, loading, refreshUser, signIn, signOut, signUp, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
