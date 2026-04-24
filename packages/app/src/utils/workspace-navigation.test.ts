/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    routerNavigate: vi.fn(),
    routerReplace: vi.fn(),
  },
}));

vi.mock("expo-router", () => ({
  router: {
    navigate: mocks.routerNavigate,
    replace: mocks.routerReplace,
  },
}));

vi.mock("@react-native-async-storage/async-storage", () => {
  const storage = new Map<string, string>();
  return {
    default: {
      getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn(async (key: string) => {
        storage.delete(key);
      }),
    },
  };
});

import {
  activateNavigationWorkspaceSelection,
  getNavigationActiveWorkspaceSelection,
  syncNavigationActiveWorkspace,
} from "@/stores/navigation-active-workspace-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import {
  navigateToReplacementWorkspacePreservingFocusedTab,
  navigateToPreparedWorkspaceTab,
  prepareWorkspaceTab,
} from "@/utils/workspace-navigation";

const SERVER_ID = "server-1";
const WORKSPACE_ID = "/repo/worktree";
const AGENT_ID = "agent-1";

function resetWorkspaceLayoutState() {
  useWorkspaceLayoutStore.setState({
    layoutByWorkspace: {},
    splitSizesByWorkspace: {},
    pinnedAgentIdsByWorkspace: {},
    hiddenAgentIdsByWorkspace: {},
  });
}

function resetNavigationSelection() {
  window.history.replaceState(null, "", "/");
  syncNavigationActiveWorkspace({ current: null });
}

describe("prepareWorkspaceTab", () => {
  beforeEach(() => {
    resetWorkspaceLayoutState();
    resetNavigationSelection();
  });

  it("opens and focuses an agent tab", () => {
    const route = prepareWorkspaceTab({
      serverId: SERVER_ID,
      workspaceId: WORKSPACE_ID,
      target: { kind: "agent", agentId: AGENT_ID },
    });

    expect(route).toBe("/h/server-1/workspace/b64_L3JlcG8vd29ya3RyZWU");
    const key = "server-1:/repo/worktree";
    expect(useWorkspaceLayoutStore.getState().getWorkspaceTabs(key)).toHaveLength(1);
  });
});

describe("navigateToPreparedWorkspaceTab", () => {
  beforeEach(() => {
    resetWorkspaceLayoutState();
    resetNavigationSelection();
    mocks.routerNavigate.mockReset();
    mocks.routerReplace.mockReset();
  });

  it("switches retained workspace selection on replace when a workspace is already active", () => {
    activateNavigationWorkspaceSelection({
      serverId: "server-0",
      workspaceId: "workspace-0",
    });

    const route = navigateToPreparedWorkspaceTab({
      serverId: "server-1",
      workspaceId: "workspace-1",
      target: { kind: "draft", draftId: "draft-1" },
      navigationMethod: "replace",
    });

    expect(route).toBe("/h/server-1/workspace/workspace-1");
    expect(mocks.routerReplace).not.toHaveBeenCalled();
    expect(mocks.routerNavigate).not.toHaveBeenCalled();
    expect(
      useWorkspaceLayoutStore.getState().getWorkspaceTabs("server-1:workspace-1"),
    ).toHaveLength(1);
  });

  it("falls back to router navigation when no retained workspace is active", () => {
    const route = navigateToPreparedWorkspaceTab({
      serverId: "server-1",
      workspaceId: "workspace-1",
      target: { kind: "draft", draftId: "draft-1" },
    });

    expect(route).toBe("/h/server-1/workspace/workspace-1");
    expect(mocks.routerNavigate).toHaveBeenCalledWith("/h/server-1/workspace/workspace-1");
    expect(mocks.routerReplace).not.toHaveBeenCalled();
  });

  it("preserves the focused placeholder draft when replacing a worktree workspace", () => {
    const placeholderWorkspaceId = "__creating_worktree__:swift-wren";
    const realWorkspaceId = "/repo/.paseo/worktrees/swift-wren";
    const draftId = "draft-swift-wren";

    activateNavigationWorkspaceSelection({
      serverId: SERVER_ID,
      workspaceId: placeholderWorkspaceId,
    });

    navigateToPreparedWorkspaceTab({
      serverId: SERVER_ID,
      workspaceId: placeholderWorkspaceId,
      target: { kind: "draft", draftId },
      navigationMethod: "replace",
    });

    navigateToReplacementWorkspacePreservingFocusedTab({
      serverId: SERVER_ID,
      fromWorkspaceId: placeholderWorkspaceId,
      toWorkspaceId: realWorkspaceId,
      navigationMethod: "replace",
    });

    navigateToPreparedWorkspaceTab({
      serverId: SERVER_ID,
      workspaceId: realWorkspaceId,
      target: { kind: "draft", draftId },
      navigationMethod: "replace",
    });

    expect(getNavigationActiveWorkspaceSelection()).toEqual({
      serverId: SERVER_ID,
      workspaceId: realWorkspaceId,
    });
    expect(
      useWorkspaceLayoutStore.getState().getWorkspaceTabs(`${SERVER_ID}:${realWorkspaceId}`),
    ).toEqual([
      {
        tabId: draftId,
        target: { kind: "draft", draftId },
        createdAt: expect.any(Number),
      },
    ]);
  });
});
