import { describe, expect, it } from "vitest";
import { shouldShowWorkspaceDraftSetupLoading } from "@/screens/workspace/workspace-draft-setup-loading";

describe("shouldShowWorkspaceDraftSetupLoading", () => {
  it("stays loading while the workspace is still a placeholder", () => {
    expect(
      shouldShowWorkspaceDraftSetupLoading({
        workspaceId: "__creating_worktree__:steady-lark",
        workspaceSetupSnapshot: null,
      }),
    ).toBe(true);
  });

  it("stays loading after the real workspace arrives while setup is still running", () => {
    expect(
      shouldShowWorkspaceDraftSetupLoading({
        workspaceId: "/repo/.paseo/worktrees/steady-lark",
        workspaceSetupSnapshot: { status: "running" },
      }),
    ).toBe(true);
  });

  it("stops loading once setup is no longer running", () => {
    expect(
      shouldShowWorkspaceDraftSetupLoading({
        workspaceId: "/repo/.paseo/worktrees/steady-lark",
        workspaceSetupSnapshot: { status: "completed" },
      }),
    ).toBe(false);
    expect(
      shouldShowWorkspaceDraftSetupLoading({
        workspaceId: "/repo/.paseo/worktrees/steady-lark",
        workspaceSetupSnapshot: { status: "failed" },
      }),
    ).toBe(false);
  });
});
