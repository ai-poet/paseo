import { useCallback } from "react";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import type { KeyboardActionId } from "@/keyboard/keyboard-action-dispatcher";
import { useToast } from "@/contexts/toast-context";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useNavigationActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { generateDraftId } from "@/stores/draft-keys";
import { useSessionStore } from "@/stores/session-store";
import { projectDisplayNameFromProjectId } from "@/utils/project-display-name";
import { createWorktreeQuickly } from "@/utils/quick-create-worktree";
import { navigateToPreparedWorkspaceTab } from "@/utils/workspace-navigation";

const WORKTREE_NEW_ACTIONS: readonly KeyboardActionId[] = ["worktree.new"];

export function useActiveWorktreeNewAction() {
  const selection = useNavigationActiveWorkspaceSelection();
  const serverId = selection?.serverId ?? null;
  const workspaceId = selection?.workspaceId ?? null;
  const toast = useToast();
  const runtimeServerId = serverId ?? "";
  const client = useHostRuntimeClient(runtimeServerId);
  const isConnected = useHostRuntimeIsConnected(runtimeServerId);
  const mergeWorkspaces = useSessionStore((state) => state.mergeWorkspaces);
  const removeWorkspace = useSessionStore((state) => state.removeWorkspace);
  const setWorkspaces = useSessionStore((state) => state.setWorkspaces);

  const activeWorkspace = useSessionStore((state) => {
    if (!serverId || !workspaceId) {
      return null;
    }
    const workspace = state.sessions[serverId]?.workspaces?.get(workspaceId);
    if (!workspace || workspace.projectKind !== "git") {
      return null;
    }
    return workspace;
  });

  const handle = useCallback(() => {
    if (!serverId || !activeWorkspace) {
      return false;
    }
    const draftId = generateDraftId();
    void createWorktreeQuickly({
      client,
      isConnected,
      serverId,
      sourceDirectory: activeWorkspace.projectRootPath,
      projectId: activeWorkspace.projectId,
      projectDisplayName:
        activeWorkspace.projectDisplayName ||
        projectDisplayNameFromProjectId(activeWorkspace.projectId),
      projectRootPath: activeWorkspace.projectRootPath,
      mergeWorkspaces,
      removeWorkspace,
      setWorkspaces,
      toast,
      onPlaceholderCreated: (placeholderWorkspace) => {
        navigateToPreparedWorkspaceTab({
          serverId,
          workspaceId: placeholderWorkspace.id,
          target: { kind: "draft", draftId },
          navigationMethod: "navigate",
        });
      },
      onCreated: ({ workspace }) => {
        navigateToPreparedWorkspaceTab({
          serverId,
          workspaceId: workspace.id,
          target: { kind: "draft", draftId },
          navigationMethod: "replace",
        });
      },
    });
    return true;
  }, [
    activeWorkspace,
    client,
    isConnected,
    mergeWorkspaces,
    navigateToPreparedWorkspaceTab,
    removeWorkspace,
    serverId,
    setWorkspaces,
    toast,
  ]);

  useKeyboardActionHandler({
    handlerId: "worktree-new-active",
    actions: WORKTREE_NEW_ACTIONS,
    enabled: serverId !== null && activeWorkspace !== null,
    priority: 0,
    handle,
  });
}
