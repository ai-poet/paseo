/**
 * Managed cloud-service authentication for Paseo desktop.
 *
 * Persists OAuth tokens in AsyncStorage and auto-refreshes before expiry.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";

const AUTH_STORAGE_KEY = "@paseo:managed-service-auth";

export interface Sub2APIAuthState {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms timestamp
  endpoint: string; // service base URL
}

export interface Sub2APIUser {
  email: string;
  username: string;
  role: string;
}

export interface UseAuthReturn {
  isLoggedIn: boolean;
  isLoading: boolean;
  auth: Sub2APIAuthState | null;
  login: (params: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    endpoint: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

interface ApiEnvelope<T> {
  data?: T;
}

async function loadAuth(): Promise<Sub2APIAuthState | null> {
  try {
    const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Sub2APIAuthState;
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.endpoint) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveAuth(state: Sub2APIAuthState): Promise<void> {
  await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(state));
}

async function clearAuth(): Promise<void> {
  await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
}

async function refreshAccessToken(auth: Sub2APIAuthState): Promise<Sub2APIAuthState | null> {
  try {
    const resp = await fetch(`${auth.endpoint}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: auth.refreshToken }),
    });
    if (!resp.ok) return null;
    const payload = (await resp.json()) as ApiEnvelope<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
    }>;
    const data = payload.data;
    if (!data?.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0) {
      return null;
    }
    const next: Sub2APIAuthState = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || auth.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
      endpoint: auth.endpoint,
    };
    await saveAuth(next);
    return next;
  } catch {
    return null;
  }
}

const AUTH_QUERY_KEY = ["managed-service-auth"] as const;

export function useSub2APIAuth(): UseAuthReturn {
  const queryClient = useQueryClient();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: auth, isLoading } = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: loadAuth,
    staleTime: Infinity,
  });

  const login = useCallback(
    async (params: {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      endpoint: string;
    }) => {
      const state: Sub2APIAuthState = {
        accessToken: params.accessToken,
        refreshToken: params.refreshToken,
        expiresAt: Date.now() + params.expiresIn * 1000,
        endpoint: params.endpoint,
      };
      await saveAuth(state);
      queryClient.setQueryData(AUTH_QUERY_KEY, state);
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    await clearAuth();
    queryClient.setQueryData(AUTH_QUERY_KEY, null);
  }, [queryClient]);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const current = queryClient.getQueryData<Sub2APIAuthState | null>(AUTH_QUERY_KEY);
    if (!current) return null;
    // If token expires within 2 minutes, refresh
    if (current.expiresAt - Date.now() < 2 * 60 * 1000) {
      const refreshed = await refreshAccessToken(current);
      if (refreshed) {
        queryClient.setQueryData(AUTH_QUERY_KEY, refreshed);
        return refreshed.accessToken;
      }
      // Refresh failed — clear auth
      await clearAuth();
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
      return null;
    }
    return current.accessToken;
  }, [queryClient]);

  // Auto-refresh timer
  useEffect(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    if (!auth?.expiresAt) return;

    const refreshAt = auth.expiresAt - 2 * 60 * 1000; // 2 min before expiry
    const delay = Math.max(refreshAt - Date.now(), 0);

    refreshTimerRef.current = setTimeout(async () => {
      const refreshed = await refreshAccessToken(auth);
      if (refreshed) {
        queryClient.setQueryData(AUTH_QUERY_KEY, refreshed);
      } else {
        await clearAuth();
        queryClient.setQueryData(AUTH_QUERY_KEY, null);
      }
    }, delay);

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [auth, queryClient]);

  return useMemo(
    () => ({
      isLoggedIn: !!auth?.accessToken,
      isLoading,
      auth: auth ?? null,
      login,
      logout,
      getAccessToken,
    }),
    [auth, isLoading, login, logout, getAccessToken],
  );
}
