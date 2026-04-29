import type { AgentProvider } from "@server/server/agent/agent-sdk-types";
import type { AgentProviderDefinition } from "@server/server/agent/provider-manifest";
import type {
  WorkspaceCloudRoutePayload,
  WorkspaceCloudRouteProvider,
  WorkspaceCloudRouteSetInput,
} from "@server/shared/messages";
import type {
  Sub2APICreateKeyRequest,
  Sub2APIGroupStatusItem,
  Sub2APIKey,
  Sub2APIModelCatalog,
} from "@/lib/sub2api-client";
import type { SelectorCloudGroup } from "@/components/combined-model-selector.utils";
import { buildGroupFirstModelCatalog } from "@/screens/settings/paseo-cloud-catalog-utils";
import { resolveManagedCloudRouteFromPlatform } from "@/screens/settings/managed-cloud-scope";
import { findReusableKey } from "@/screens/settings/managed-provider-settings-shared";
import { toErrorMessage } from "@/utils/error-messages";

function isWorkspaceCloudRouteProvider(value: string): value is WorkspaceCloudRouteProvider {
  return value === "claude" || value === "codex";
}

export function buildCloudModelRoutingGroups(input: {
  catalog: Sub2APIModelCatalog | null | undefined;
  statuses?: Sub2APIGroupStatusItem[] | null;
  providerDefinitions: AgentProviderDefinition[];
  workspaceRoutes?: WorkspaceCloudRoutePayload[] | null;
}): SelectorCloudGroup[] {
  const supportedProviderIds = new Set(input.providerDefinitions.map((definition) => definition.id));
  const activeGroupByProvider = new Map(
    (input.workspaceRoutes ?? []).map((route) => [route.provider, route.groupId] as const),
  );
  const groups: SelectorCloudGroup[] = [];

  for (const platform of ["anthropic", "openai"]) {
    const route = resolveManagedCloudRouteFromPlatform(platform);
    if (!route.ok || !supportedProviderIds.has(route.scope)) {
      continue;
    }
    const catalog = buildGroupFirstModelCatalog({
      catalog: input.catalog,
      statuses: input.statuses,
      platform,
    });

    for (const group of catalog.groups) {
      const seenModelIds = new Set<string>();
      const models = group.models
        .filter((entry) => {
          if (seenModelIds.has(entry.item.model)) {
            return false;
          }
          seenModelIds.add(entry.item.model);
          return true;
        })
        .map((entry) => ({
          id: entry.item.model,
          label: entry.item.display_name || entry.item.model,
          description: `${group.group.rate_multiplier}x · ${entry.item.billing_mode}`,
        }));
      if (models.length === 0) {
        continue;
      }

      const status = group.status?.stable_status || group.status?.latest_status;
      const isActiveForWorkspace = activeGroupByProvider.get(route.scope) === group.group.id;
      groups.push({
        provider: route.scope,
        groupId: group.group.id,
        groupLabel: group.group.name,
        platform,
        description: `${isActiveForWorkspace ? "Current workspace · " : ""}${route.cliLabel} · ${
          group.group.rate_multiplier
        }x${status ? ` · ${status}` : ""}`,
        models,
      });
    }
  }

  const getActiveGroupId = (provider: string) =>
    isWorkspaceCloudRouteProvider(provider) ? activeGroupByProvider.get(provider) : undefined;

  return groups.sort((a, b) => {
    const aActive = getActiveGroupId(a.provider) === a.groupId;
    const bActive = getActiveGroupId(b.provider) === b.groupId;
    return Number(bActive) - Number(aActive);
  });
}

export async function selectCloudModelForNextSession(input: {
  serverId: string | null | undefined;
  cwd: string | null | undefined;
  endpoint: string | null | undefined;
  isLoggedIn: boolean;
  keys: Sub2APIKey[];
  group: SelectorCloudGroup;
  provider: AgentProvider;
  createKey: (input: Sub2APICreateKeyRequest) => Promise<Sub2APIKey>;
  setWorkspaceCloudRoute: (route: WorkspaceCloudRouteSetInput) => Promise<WorkspaceCloudRoutePayload>;
}): Promise<WorkspaceCloudRoutePayload | null> {
  const normalizedCwd = input.cwd?.trim() ?? "";
  const endpoint = input.endpoint?.trim() ?? "";
  if (
    !input.serverId ||
    !normalizedCwd ||
    !endpoint ||
    !input.isLoggedIn ||
    !isWorkspaceCloudRouteProvider(input.provider)
  ) {
    return null;
  }

  const reusable = findReusableKey(input.keys, input.group.groupId);
  const keyToUse =
    reusable ??
    (await input.createKey({
      name: `${input.group.groupLabel} Key`,
      group_id: input.group.groupId,
    }));

  return await input.setWorkspaceCloudRoute({
    cwd: normalizedCwd,
    provider: input.provider,
    endpoint,
    apiKey: keyToUse.key,
    apiKeyId: keyToUse.id,
    groupId: input.group.groupId,
    groupName: input.group.groupLabel,
    platform: input.group.platform,
  });
}

export async function clearCloudRouteForProvider(input: {
  serverId: string | null | undefined;
  cwd: string | null | undefined;
  provider: AgentProvider;
  clearWorkspaceCloudRoute: (input: {
    cwd: string;
    provider: WorkspaceCloudRouteProvider;
  }) => Promise<WorkspaceCloudRoutePayload | null>;
}): Promise<WorkspaceCloudRoutePayload | null> {
  const normalizedCwd = input.cwd?.trim() ?? "";
  if (!input.serverId || !normalizedCwd || !isWorkspaceCloudRouteProvider(input.provider)) {
    return null;
  }
  return await input.clearWorkspaceCloudRoute({
    cwd: normalizedCwd,
    provider: input.provider,
  });
}

export function formatWorkspaceCloudRouteSwitchError(error: unknown): string {
  const rpcError = error as { code?: unknown; requestType?: unknown };
  if (
    rpcError.code === "unknown_schema" &&
    typeof rpcError.requestType === "string" &&
    rpcError.requestType.includes("workspace_cloud_route")
  ) {
    return "Restart the local daemon from Settings -> Host to load the new Cloud group routing protocol. Restarting Desktop alone may keep the old daemon running.";
  }
  return toErrorMessage(error);
}
