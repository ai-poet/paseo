import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSub2APIAuth } from "@/hooks/use-sub2api-auth";
import {
  createSub2APIClient,
  type Sub2APICreateKeyRequest,
  type Sub2APIModelCatalog,
  type Sub2APIPaginatedData,
  type Sub2APIUsagePeriod,
  type Sub2APIUsageStats,
  type Sub2APIUser,
  type Sub2APIKey,
  type Sub2APIGroup,
  type Sub2APIClient,
} from "@/lib/sub2api-client";

function normalizeEndpointKey(endpoint: string | null | undefined): string {
  const trimmed = endpoint?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "none";
}

const CLOUD_SERVICE_QUERY_ROOT = "managedCloud";

export const cloudServiceQueryKeys = {
  root: [CLOUD_SERVICE_QUERY_ROOT] as const,
  me: (endpoint: string | null | undefined) =>
    [CLOUD_SERVICE_QUERY_ROOT, normalizeEndpointKey(endpoint), "me"] as const,
  keys: (endpoint: string | null | undefined) =>
    [CLOUD_SERVICE_QUERY_ROOT, normalizeEndpointKey(endpoint), "keys"] as const,
  groups: (endpoint: string | null | undefined) =>
    [CLOUD_SERVICE_QUERY_ROOT, normalizeEndpointKey(endpoint), "groups"] as const,
  usage: (endpoint: string | null | undefined, period: Sub2APIUsagePeriod) =>
    [CLOUD_SERVICE_QUERY_ROOT, normalizeEndpointKey(endpoint), "usage", period] as const,
  models: (endpoint: string | null | undefined) =>
    [CLOUD_SERVICE_QUERY_ROOT, normalizeEndpointKey(endpoint), "models"] as const,
};

export function useSub2APIClient(): {
  client: Sub2APIClient | null;
  endpoint: string | null;
  isReady: boolean;
  isLoggedIn: boolean;
} {
  const { auth, isLoggedIn, getAccessToken } = useSub2APIAuth();
  const endpoint = auth?.endpoint ?? null;

  const client = useMemo(() => {
    if (!isLoggedIn || !endpoint) {
      return null;
    }
    return createSub2APIClient({
      endpoint,
      getAccessToken,
    });
  }, [endpoint, getAccessToken, isLoggedIn]);

  return {
    client,
    endpoint,
    isReady: Boolean(client && isLoggedIn),
    isLoggedIn,
  };
}

export function useSub2APIMe() {
  const { client, endpoint, isReady } = useSub2APIClient();
  return useQuery({
    queryKey: cloudServiceQueryKeys.me(endpoint),
    enabled: isReady && client !== null,
    staleTime: 30_000,
    queryFn: async (): Promise<Sub2APIUser> => {
      if (!client) {
        throw new Error("Service client is unavailable.");
      }
      return await client.getMe();
    },
  });
}

export function useSub2APIKeys(page = 1, pageSize = 50) {
  const { client, endpoint, isReady } = useSub2APIClient();
  return useQuery({
    queryKey: [...cloudServiceQueryKeys.keys(endpoint), page, pageSize] as const,
    enabled: isReady && client !== null,
    staleTime: 15_000,
    queryFn: async (): Promise<Sub2APIPaginatedData<Sub2APIKey>> => {
      if (!client) {
        throw new Error("Service client is unavailable.");
      }
      return await client.listKeys(page, pageSize);
    },
  });
}

export function useSub2APIAvailableGroups() {
  const { client, endpoint, isReady } = useSub2APIClient();
  return useQuery({
    queryKey: cloudServiceQueryKeys.groups(endpoint),
    enabled: isReady && client !== null,
    staleTime: 60_000,
    queryFn: async (): Promise<Sub2APIGroup[]> => {
      if (!client) {
        throw new Error("Service client is unavailable.");
      }
      return await client.getAvailableGroups();
    },
  });
}

export function useSub2APIUsageStats(period: Sub2APIUsagePeriod) {
  const { client, endpoint, isReady } = useSub2APIClient();
  return useQuery({
    queryKey: cloudServiceQueryKeys.usage(endpoint, period),
    enabled: isReady && client !== null,
    staleTime: 20_000,
    queryFn: async (): Promise<Sub2APIUsageStats> => {
      if (!client) {
        throw new Error("Service client is unavailable.");
      }
      return await client.getUsageStats(period);
    },
  });
}

export function useSub2APIModelCatalog() {
  const { client, endpoint, isReady } = useSub2APIClient();
  return useQuery({
    queryKey: cloudServiceQueryKeys.models(endpoint),
    enabled: isReady && client !== null,
    staleTime: 60_000,
    queryFn: async (): Promise<Sub2APIModelCatalog> => {
      if (!client) {
        throw new Error("Service client is unavailable.");
      }
      return await client.getModelCatalog();
    },
  });
}

export function useCreateSub2APIKeyMutation() {
  const queryClient = useQueryClient();
  const { client, endpoint, isReady } = useSub2APIClient();

  return useMutation({
    mutationFn: async (input: Sub2APICreateKeyRequest): Promise<Sub2APIKey> => {
      if (!client || !isReady) {
        throw new Error("Service client is unavailable.");
      }
      return await client.createKey(input);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cloudServiceQueryKeys.keys(endpoint) }),
        queryClient.invalidateQueries({ queryKey: cloudServiceQueryKeys.me(endpoint) }),
      ]);
    },
  });
}

export function useDeleteSub2APIKeyMutation() {
  const queryClient = useQueryClient();
  const { client, endpoint, isReady } = useSub2APIClient();

  return useMutation({
    mutationFn: async (id: number): Promise<void> => {
      if (!client || !isReady) {
        throw new Error("Service client is unavailable.");
      }
      await client.deleteKey(id);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: cloudServiceQueryKeys.keys(endpoint) }),
        queryClient.invalidateQueries({ queryKey: cloudServiceQueryKeys.me(endpoint) }),
      ]);
    },
  });
}
