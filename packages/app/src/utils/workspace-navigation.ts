import { router } from "expo-router";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { generateDraftId } from "@/stores/draft-keys";
import {
  activateNavigationWorkspaceSelection,
  getNavigationActiveWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import {
  buildWorkspaceTabPersistenceKey,
  type WorkspaceTabTarget,
} from "@/stores/workspace-tabs-store";
import { buildHostWorkspaceRoute } from "@/utils/host-routes";
import { normalizeWorkspaceTabTarget } from "@/utils/workspace-tab-identity";

interface PrepareWorkspaceTabInput {
  serverId: string;
  workspaceId: string;
  target: WorkspaceTabTarget;
  pin?: boolean;
}

interface NavigateToPreparedWorkspaceTabInput extends PrepareWorkspaceTabInput {
  navigationMethod?: "navigate" | "replace";
}

function getPreparedTarget(target: WorkspaceTabTarget): WorkspaceTabTarget {
  if (target.kind !== "draft" || target.draftId.trim() !== "new") {
    return target;
  }
  return { kind: "draft", draftId: generateDraftId() };
}

function getFocusedWorkspaceTabTarget(input: {
  serverId: string;
  workspaceId: string;
}): WorkspaceTabTarget | null {
  const workspaceKey = buildWorkspaceTabPersistenceKey(input);
  if (!workspaceKey) {
    return null;
  }
  return useWorkspaceLayoutStore.getState().getFocusedTabTarget(workspaceKey);
}

function retargetWorkspaceReplacementTarget(input: {
  fromWorkspaceId: string;
  toWorkspaceId: string;
  target: WorkspaceTabTarget | null;
}): WorkspaceTabTarget | null {
  const target = normalizeWorkspaceTabTarget(input.target);
  if (!target) {
    return null;
  }
  if (target.kind === "setup") {
    return {
      kind: "setup",
      workspaceId:
        target.workspaceId === input.fromWorkspaceId ? input.toWorkspaceId : target.workspaceId,
    };
  }
  return target;
}

export function prepareWorkspaceTab(input: PrepareWorkspaceTabInput) {
  const target = getPreparedTarget(input.target);
  const key =
    buildWorkspaceTabPersistenceKey({
      serverId: input.serverId,
      workspaceId: input.workspaceId,
    }) ?? "";

  useWorkspaceLayoutStore.getState().openTabFocused(key, target);

  if (input.pin && target.kind === "agent") {
    useWorkspaceLayoutStore.getState().pinAgent(key, target.agentId);
  }

  return buildHostWorkspaceRoute(input.serverId, input.workspaceId);
}

export function navigateToPreparedWorkspaceTab(input: NavigateToPreparedWorkspaceTabInput): string {
  const route = prepareWorkspaceTab(input);
  if (getNavigationActiveWorkspaceSelection()) {
    activateNavigationWorkspaceSelection(
      {
        serverId: input.serverId,
        workspaceId: input.workspaceId,
      },
      {
        updateBrowserHistory: true,
        historyMode: input.navigationMethod === "replace" ? "replace" : "push",
      },
    );
    return route;
  }

  if (input.navigationMethod === "replace") {
    router.replace(route as any);
  } else {
    router.navigate(route as any);
  }
  return route;
}

export function navigateToReplacementWorkspacePreservingFocusedTab(input: {
  serverId: string;
  fromWorkspaceId: string;
  toWorkspaceId: string;
  navigationMethod?: "navigate" | "replace";
}): string {
  const target = retargetWorkspaceReplacementTarget({
    fromWorkspaceId: input.fromWorkspaceId,
    toWorkspaceId: input.toWorkspaceId,
    target: getFocusedWorkspaceTabTarget({
      serverId: input.serverId,
      workspaceId: input.fromWorkspaceId,
    }),
  });

  if (target) {
    return navigateToPreparedWorkspaceTab({
      serverId: input.serverId,
      workspaceId: input.toWorkspaceId,
      target,
      navigationMethod: input.navigationMethod,
    });
  }

  const route = buildHostWorkspaceRoute(input.serverId, input.toWorkspaceId);
  if (getNavigationActiveWorkspaceSelection()) {
    activateNavigationWorkspaceSelection(
      {
        serverId: input.serverId,
        workspaceId: input.toWorkspaceId,
      },
      {
        updateBrowserHistory: true,
        historyMode: input.navigationMethod === "replace" ? "replace" : "push",
      },
    );
    return route;
  }

  if (input.navigationMethod === "replace") {
    router.replace(route as any);
  } else {
    router.navigate(route as any);
  }
  return route;
}
