/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    activateNavigationWorkspaceSelection: vi.fn(),
    getNavigationActiveWorkspaceSelection: vi.fn(),
    openTabFocused: vi.fn(),
    pinAgent: vi.fn(),
    routerNavigate: vi.fn(),
    routerReplace: vi.fn(),
  },
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

vi.mock("expo-router", () => ({
  router: {
    navigate: mocks.routerNavigate,
    replace: mocks.routerReplace,
  },
}));

vi.mock("@/stores/workspace-layout-store", () => ({
  useWorkspaceLayoutStore: {
    getState: () => ({
      openTabFocused: mocks.openTabFocused,
      pinAgent: mocks.pinAgent,
    }),
  },
}));

vi.mock("@/stores/navigation-active-workspace-store", () => ({
  activateNavigationWorkspaceSelection: mocks.activateNavigationWorkspaceSelection,
  getNavigationActiveWorkspaceSelection: mocks.getNavigationActiveWorkspaceSelection,
}));

import { navigateToPreparedWorkspaceTab } from "./workspace-navigation";

describe("navigateToPreparedWorkspaceTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getNavigationActiveWorkspaceSelection.mockReturnValue(null);
  });

  it("switches retained workspace selection on replace when a workspace is already active", () => {
    mocks.getNavigationActiveWorkspaceSelection.mockReturnValue({
      serverId: "server-0",
      workspaceId: "workspace-0",
    });

    const route = navigateToPreparedWorkspaceTab({
      serverId: "server-1",
      workspaceId: "workspace-1",
      target: { kind: "draft", draftId: "draft-1" },
      navigationMethod: "replace",
    });

    expect(mocks.openTabFocused).toHaveBeenCalledWith("server-1:workspace-1", {
      kind: "draft",
      draftId: "draft-1",
    });
    expect(mocks.activateNavigationWorkspaceSelection).toHaveBeenCalledWith(
      { serverId: "server-1", workspaceId: "workspace-1" },
      { updateBrowserHistory: true, historyMode: "replace" },
    );
    expect(mocks.routerReplace).not.toHaveBeenCalled();
    expect(mocks.routerNavigate).not.toHaveBeenCalled();
    expect(route).toBe("/h/server-1/workspace/workspace-1");
  });

  it("falls back to router navigation when no retained workspace is active", () => {
    const route = navigateToPreparedWorkspaceTab({
      serverId: "server-1",
      workspaceId: "workspace-1",
      target: { kind: "draft", draftId: "draft-1" },
    });

    expect(mocks.activateNavigationWorkspaceSelection).not.toHaveBeenCalled();
    expect(mocks.routerNavigate).toHaveBeenCalledWith("/h/server-1/workspace/workspace-1");
    expect(mocks.routerReplace).not.toHaveBeenCalled();
    expect(route).toBe("/h/server-1/workspace/workspace-1");
  });
});
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-router", () => ({
  router: {
    navigate: vi.fn(),
    replace: vi.fn(),
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

import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { prepareWorkspaceTab } from "@/utils/workspace-navigation";

const SERVER_ID = "server-1";
const WORKSPACE_ID = "/repo/worktree";
const AGENT_ID = "agent-1";

describe("prepareWorkspaceTab", () => {
  beforeEach(() => {
    useWorkspaceLayoutStore.setState({
      layoutByWorkspace: {},
      splitSizesByWorkspace: {},
      pinnedAgentIdsByWorkspace: {},
      hiddenAgentIdsByWorkspace: {},
    });
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
