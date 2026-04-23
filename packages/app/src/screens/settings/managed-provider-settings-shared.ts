import type { SegmentedControlOption } from "@/components/ui/segmented-control";
import type { DesktopProviderPayload, ManagedProviderTarget } from "@/screens/settings/sub2api-provider-types";

export function providerWritesClaude(p: { target?: ManagedProviderTarget }): boolean {
  return p.target === undefined || p.target === "claude";
}

export function providerWritesCodex(p: { target?: ManagedProviderTarget }): boolean {
  return p.target === undefined || p.target === "codex";
}

export function providerTargetHint(p: DesktopProviderPayload): string {
  if (p.isDefault || p.target === undefined) {
    return "Claude Code + Codex";
  }
  if (p.target === "claude") {
    return "Claude Code · Anthropic";
  }
  return "Codex · Responses";
}

export const CUSTOM_TARGET_SEGMENT_OPTIONS: SegmentedControlOption<ManagedProviderTarget>[] = [
  { value: "claude", label: "Claude Code" },
  { value: "codex", label: "Codex" },
];

export const ENDPOINT_PLACEHOLDER =
  "https://api.example.com — omit /v1 (a trailing /v1 is stripped if present)";

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatUsd(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }
  return `$${value.toFixed(2)}`;
}

export function maskApiKey(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 12) {
    return trimmed;
  }
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-4)}`;
}

export function findReusableKey<T extends { group_id: number | null; status?: string }>(
  keys: T[],
  groupId: number,
): T | null {
  return (
    keys.find((entry) => entry.group_id === groupId && entry.status === "active") ??
    keys.find((entry) => entry.group_id === groupId) ??
    null
  );
}

export function normalizeFilter(s: string): string {
  return s.trim().toLowerCase();
}
