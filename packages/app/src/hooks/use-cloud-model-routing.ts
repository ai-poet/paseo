import { useCallback, useMemo } from "react";
import type { AgentProviderDefinition } from "@server/server/agent/provider-manifest";
import type { AgentProvider } from "@server/server/agent/agent-sdk-types";
import type { SelectorCloudGroup } from "@/components/combined-model-selector.utils";
import {
  useCreateSub2APIKeyMutation,
  useSub2APIClient,
  useSub2APIGroupStatuses,
  useSub2APIKeys,
  useSub2APIModelCatalog,
} from "@/hooks/use-sub2api-api";
import {
  useClearWorkspaceCloudRouteMutation,
  useSetWorkspaceCloudRouteMutation,
  useWorkspaceCloudRoutes,
} from "@/hooks/use-workspace-cloud-routes";
import {
  buildCloudModelRoutingGroups,
  clearCloudRouteForProvider,
  selectCloudModelForNextSession,
} from "@/hooks/cloud-model-routing-utils";
export {
  buildCloudModelRoutingGroups,
  clearCloudRouteForProvider,
  formatWorkspaceCloudRouteSwitchError,
  selectCloudModelForNextSession,
} from "@/hooks/cloud-model-routing-utils";

export function useCloudModelRouting(input: {
  serverId: string | null | undefined;
  cwd: string | null | undefined;
  providerDefinitions: AgentProviderDefinition[];
}) {
  const cloudClient = useSub2APIClient();
  const cloudCatalogQuery = useSub2APIModelCatalog();
  const cloudStatusesQuery = useSub2APIGroupStatuses();
  const cloudKeysQuery = useSub2APIKeys(1, 200);
  const workspaceCloudRoutesQuery = useWorkspaceCloudRoutes(input.serverId, input.cwd);
  const createCloudKeyMutation = useCreateSub2APIKeyMutation();
  const setWorkspaceCloudRouteMutation = useSetWorkspaceCloudRouteMutation(input.serverId);
  const clearWorkspaceCloudRouteMutation = useClearWorkspaceCloudRouteMutation(input.serverId);

  const cloudGroups = useMemo(
    () =>
      cloudClient.isLoggedIn && cloudClient.endpoint && cloudCatalogQuery.data
        ? buildCloudModelRoutingGroups({
            catalog: cloudCatalogQuery.data,
            statuses: cloudStatusesQuery.data,
            providerDefinitions: input.providerDefinitions,
            workspaceRoutes: workspaceCloudRoutesQuery.data,
          })
        : [],
    [
      cloudCatalogQuery.data,
      cloudClient.endpoint,
      cloudClient.isLoggedIn,
      cloudStatusesQuery.data,
      input.providerDefinitions,
      workspaceCloudRoutesQuery.data,
    ],
  );

  const selectForNextSession = useCallback(
    async (provider: AgentProvider, _modelId: string, group: SelectorCloudGroup) =>
      await selectCloudModelForNextSession({
        serverId: input.serverId,
        cwd: input.cwd,
        endpoint: cloudClient.endpoint,
        isLoggedIn: cloudClient.isLoggedIn,
        keys: cloudKeysQuery.data?.items ?? [],
        group,
        provider,
        createKey: (request) => createCloudKeyMutation.mutateAsync(request),
        setWorkspaceCloudRoute: (route) => setWorkspaceCloudRouteMutation.mutateAsync(route),
      }),
    [
      cloudClient.endpoint,
      cloudClient.isLoggedIn,
      cloudKeysQuery.data?.items,
      createCloudKeyMutation,
      input.cwd,
      input.serverId,
      setWorkspaceCloudRouteMutation,
    ],
  );

  const clearForProvider = useCallback(
    async (provider: AgentProvider) =>
      await clearCloudRouteForProvider({
        serverId: input.serverId,
        cwd: input.cwd,
        provider,
        clearWorkspaceCloudRoute: (request) =>
          clearWorkspaceCloudRouteMutation.mutateAsync(request),
      }),
    [clearWorkspaceCloudRouteMutation, input.cwd, input.serverId],
  );

  return {
    cloudGroups,
    clearCloudRouteForProvider: clearForProvider,
    selectCloudModelForNextSession: selectForNextSession,
  };
}
