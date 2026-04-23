import type { Sub2APIGroup, Sub2APIKey } from "@/lib/sub2api-client";

/** Desktop managed route: Claude Code (Anthropic API) vs Codex (OpenAI API). */
export type ManagedCloudDesktopScope = "claude" | "codex";

export const MANAGED_CLOUD_SCOPE_META = {
  claude: {
    scope: "claude" as const,
    cliLabel: "Claude Code",
    platform: "anthropic",
    configTarget: "~/.claude/settings.json",
  },
  codex: {
    scope: "codex" as const,
    cliLabel: "Codex",
    platform: "openai",
    configTarget: "~/.codex/config.toml + ~/.codex/auth.json",
  },
};

export type ManagedCloudRouteResolution =
  | { ok: true; scope: ManagedCloudDesktopScope; cliLabel: string }
  | { ok: false; reason: string };

export function getManagedCloudMetaForScope(scope: ManagedCloudDesktopScope) {
  return MANAGED_CLOUD_SCOPE_META[scope];
}

/**
 * Map Sub2API group `platform` to the local CLI we configure.
 * Backend uses `anthropic` / `openai` (see domain.PlatformAnthropic / PlatformOpenAI).
 */
export function resolveManagedCloudRouteFromPlatform(
  platform: string,
): ManagedCloudRouteResolution {
  const p = platform.trim().toLowerCase();
  if (p === MANAGED_CLOUD_SCOPE_META.claude.platform) {
    return {
      ok: true,
      scope: MANAGED_CLOUD_SCOPE_META.claude.scope,
      cliLabel: MANAGED_CLOUD_SCOPE_META.claude.cliLabel,
    };
  }
  if (p === MANAGED_CLOUD_SCOPE_META.codex.platform) {
    return {
      ok: true,
      scope: MANAGED_CLOUD_SCOPE_META.codex.scope,
      cliLabel: MANAGED_CLOUD_SCOPE_META.codex.cliLabel,
    };
  }
  return {
    ok: false,
    reason: `This group uses platform "${platform}". Only anthropic (Claude Code) and openai (Codex) can be configured automatically on this device.`,
  };
}

export function resolveManagedCloudRouteForKey(
  key: Sub2APIKey,
  groups: Sub2APIGroup[],
): ManagedCloudRouteResolution {
  const platform = key.group?.platform ?? groups.find((g) => g.id === key.group_id)?.platform ?? "";
  if (!platform) {
    return {
      ok: false,
      reason: "This key has no group or platform; cannot choose Claude Code vs Codex.",
    };
  }
  return resolveManagedCloudRouteFromPlatform(platform);
}

export function resolveManagedCloudRouteForGroup(group: Sub2APIGroup): ManagedCloudRouteResolution {
  return resolveManagedCloudRouteFromPlatform(group.platform);
}
