import type { Agent } from "@/stores/session-store";
import { normalizeWorkspacePath } from "@/utils/workspace-identity";

function normalizeWorkspaceId(value: string | null | undefined): string {
  return normalizeWorkspacePath(value) ?? "";
}

/** Match execution directory to agent cwd (trailing slashes normalized; case on macOS volumes). */
function workspacePathsMatch(agentCwd: string, workspaceDir: string): boolean {
  const a = normalizeWorkspaceId(agentCwd);
  const b = normalizeWorkspaceId(workspaceDir);
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  // Default APFS/HFS+ are case-insensitive; host may return different casing than the route descriptor.
  return a.toLowerCase() === b.toLowerCase();
}

export interface WorkspaceAgentVisibility {
  activeAgentIds: Set<string>;
  knownAgentIds: Set<string>;
}

export function deriveWorkspaceAgentVisibility(input: {
  sessionAgents: Map<string, Agent> | undefined;
  workspaceDirectory: string | null | undefined;
}): WorkspaceAgentVisibility {
  const { sessionAgents, workspaceDirectory } = input;
  const normalizedWorkspaceDirectory = normalizeWorkspaceId(workspaceDirectory);
  if (!sessionAgents || !normalizedWorkspaceDirectory) {
    return {
      activeAgentIds: new Set<string>(),
      knownAgentIds: new Set<string>(),
    };
  }

  const activeAgentIds = new Set<string>();
  const knownAgentIds = new Set<string>();
  for (const agent of sessionAgents.values()) {
    if (!workspacePathsMatch(agent.cwd, workspaceDirectory ?? "")) {
      continue;
    }
    knownAgentIds.add(agent.id);
    if (!agent.archivedAt) {
      activeAgentIds.add(agent.id);
    }
  }

  return { activeAgentIds, knownAgentIds };
}

export function workspaceAgentVisibilityEqual(
  a: WorkspaceAgentVisibility,
  b: WorkspaceAgentVisibility,
): boolean {
  return (
    setsEqual(a.activeAgentIds, b.activeAgentIds) && setsEqual(a.knownAgentIds, b.knownAgentIds)
  );
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const item of a) {
    if (!b.has(item)) {
      return false;
    }
  }
  return true;
}

// Prune agent tabs that are unknown (deleted) or archived.
// Archived agents get pruned so that archiving on one client closes the tab on all clients.
export function shouldPruneWorkspaceAgentTab(input: {
  agentId: string;
  agentsHydrated: boolean;
  knownAgentIds: Set<string>;
  activeAgentIds: Set<string>;
}): boolean {
  if (!input.agentId.trim()) {
    return false;
  }
  if (!input.agentsHydrated) {
    return false;
  }
  return !input.activeAgentIds.has(input.agentId);
}
