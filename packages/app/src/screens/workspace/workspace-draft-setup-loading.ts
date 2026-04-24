import type { WorkspaceSetupSnapshot } from "@/stores/workspace-setup-store";
import { isCreatingWorktreePlaceholderId } from "@/utils/quick-create-worktree";

export function shouldShowWorkspaceDraftSetupLoading(input: {
  workspaceId: string;
  workspaceSetupSnapshot: Pick<WorkspaceSetupSnapshot, "status"> | null;
}): boolean {
  return (
    isCreatingWorktreePlaceholderId(input.workspaceId) ||
    input.workspaceSetupSnapshot?.status === "running"
  );
}
