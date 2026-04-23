import type { SidebarProjectEntry } from "@/hooks/use-sidebar-workspaces-list";
import { isCreatingWorktreePlaceholderId } from "@/utils/quick-create-worktree";

function normalizeWorkspaceName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function extractCreatingSlug(workspaceId: string): string | null {
  const separatorIndex = workspaceId.indexOf(":");
  if (separatorIndex < 0 || separatorIndex >= workspaceId.length - 1) {
    return null;
  }
  return workspaceId.slice(separatorIndex + 1);
}

function workspaceDirectoryHasSlug(workspaceDirectory: string | undefined, slug: string): boolean {
  if (!workspaceDirectory) {
    return false;
  }
  const normalizedDirectory = workspaceDirectory.replace(/\\/g, "/");
  return normalizedDirectory.endsWith(`/${slug}`);
}

export function getSidebarRenderableProjects(
  projects: SidebarProjectEntry[],
): SidebarProjectEntry[] {
  let didChange = false;
  const nextProjects = projects.map((project) => {
    const realWorkspaces = project.workspaces.filter(
      (workspace) => !isCreatingWorktreePlaceholderId(workspace.workspaceId),
    );
    if (realWorkspaces.length === 0) {
      return project;
    }
    const realWorkspaceNames = new Set(
      realWorkspaces.map((workspace) => normalizeWorkspaceName(workspace.name)),
    );

    const filteredWorkspaces = project.workspaces.filter((workspace) => {
      if (!isCreatingWorktreePlaceholderId(workspace.workspaceId)) {
        return true;
      }
      const normalizedPlaceholderName = normalizeWorkspaceName(workspace.name);
      if (realWorkspaceNames.has(normalizedPlaceholderName)) {
        return false;
      }
      const placeholderSlug = extractCreatingSlug(workspace.workspaceId);
      if (!placeholderSlug) {
        return true;
      }
      return !realWorkspaces.some((realWorkspace) =>
        workspaceDirectoryHasSlug(realWorkspace.workspaceDirectory, placeholderSlug),
      );
    });

    if (filteredWorkspaces.length === project.workspaces.length) {
      return project;
    }
    didChange = true;
    return {
      ...project,
      workspaces: filteredWorkspaces,
    };
  });

  return didChange ? nextProjects : projects;
}
