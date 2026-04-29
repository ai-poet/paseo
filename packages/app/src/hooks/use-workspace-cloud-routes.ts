import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  WorkspaceCloudRoutePayload,
  WorkspaceCloudRouteProvider,
  WorkspaceCloudRouteSetInput,
} from "@server/shared/messages";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { normalizeProvidersSnapshotCwdKey } from "@/hooks/use-providers-snapshot";

function normalizeWorkspaceCloudRouteCwdKey(cwd: string | null | undefined): string {
  return normalizeProvidersSnapshotCwdKey(cwd) ?? "none";
}

export function workspaceCloudRoutesQueryKey(
  serverId: string | null | undefined,
  cwd: string | null | undefined,
  provider?: WorkspaceCloudRouteProvider | null,
) {
  return [
    "workspaceCloudRoutes",
    serverId ?? "none",
    normalizeWorkspaceCloudRouteCwdKey(cwd),
    provider ?? "all",
  ] as const;
}

export function useWorkspaceCloudRoutes(
  serverId: string | null | undefined,
  cwd: string | null | undefined,
  provider?: WorkspaceCloudRouteProvider | null,
) {
  const normalizedServerId = serverId ?? "";
  const normalizedCwd = cwd?.trim() || "";
  const client = useHostRuntimeClient(normalizedServerId);
  const isConnected = useHostRuntimeIsConnected(normalizedServerId);

  return useQuery({
    queryKey: workspaceCloudRoutesQueryKey(serverId, normalizedCwd, provider),
    enabled: Boolean(client && isConnected && normalizedServerId && normalizedCwd),
    staleTime: 30_000,
    queryFn: async (): Promise<WorkspaceCloudRoutePayload[]> => {
      if (!client || !normalizedCwd) {
        throw new Error("Host is not connected");
      }
      const result = await client.getWorkspaceCloudRoutes({
        cwd: normalizedCwd,
        ...(provider ? { provider } : {}),
      });
      return result.routes;
    },
  });
}

export function useSetWorkspaceCloudRouteMutation(serverId: string | null | undefined) {
  const normalizedServerId = serverId ?? "";
  const client = useHostRuntimeClient(normalizedServerId);
  const isConnected = useHostRuntimeIsConnected(normalizedServerId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (route: WorkspaceCloudRouteSetInput): Promise<WorkspaceCloudRoutePayload> => {
      if (!client || !isConnected) {
        throw new Error("Host is not connected");
      }
      const result = await client.setWorkspaceCloudRoute(route);
      return result.route;
    },
    onSuccess: (route) => {
      queryClient.setQueryData<WorkspaceCloudRoutePayload[]>(
        workspaceCloudRoutesQueryKey(serverId, route.cwd, route.provider),
        [route],
      );
      void queryClient.invalidateQueries({
        queryKey: workspaceCloudRoutesQueryKey(serverId, route.cwd),
      });
    },
  });
}

export function useClearWorkspaceCloudRouteMutation(serverId: string | null | undefined) {
  const normalizedServerId = serverId ?? "";
  const client = useHostRuntimeClient(normalizedServerId);
  const isConnected = useHostRuntimeIsConnected(normalizedServerId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      cwd: string;
      provider: WorkspaceCloudRouteProvider;
    }): Promise<WorkspaceCloudRoutePayload | null> => {
      if (!client || !isConnected) {
        throw new Error("Host is not connected");
      }
      const result = await client.clearWorkspaceCloudRoute(input);
      return result.route;
    },
    onSuccess: (route, input) => {
      queryClient.setQueryData<WorkspaceCloudRoutePayload[]>(
        workspaceCloudRoutesQueryKey(serverId, input.cwd, input.provider),
        [],
      );
      void queryClient.invalidateQueries({
        queryKey: workspaceCloudRoutesQueryKey(serverId, input.cwd),
      });
      if (route) {
        void queryClient.invalidateQueries({
          queryKey: workspaceCloudRoutesQueryKey(serverId, route.cwd, route.provider),
        });
      }
    },
  });
}
