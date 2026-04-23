import { describe, expect, it } from "vitest";
import {
  getManagedCloudMetaForScope,
  resolveManagedCloudRouteForKey,
  resolveManagedCloudRouteFromPlatform,
} from "@/screens/settings/managed-cloud-scope";
import type { Sub2APIKey, Sub2APIGroup } from "@/lib/sub2api-client";

describe("managed-cloud-scope", () => {
  it("exposes config target metadata for each scope", () => {
    expect(getManagedCloudMetaForScope("claude")).toMatchObject({
      cliLabel: "Claude Code",
      platform: "anthropic",
    });
    expect(getManagedCloudMetaForScope("codex")).toMatchObject({
      cliLabel: "Codex",
      platform: "openai",
    });
  });

  it("maps anthropic to Claude Code", () => {
    const r = resolveManagedCloudRouteFromPlatform("anthropic");
    expect(r).toEqual({ ok: true, scope: "claude", cliLabel: "Claude Code" });
  });

  it("maps openai to Codex", () => {
    const r = resolveManagedCloudRouteFromPlatform("openai");
    expect(r).toEqual({ ok: true, scope: "codex", cliLabel: "Codex" });
  });

  it("is case-insensitive", () => {
    expect(resolveManagedCloudRouteFromPlatform("Anthropic").ok).toBe(true);
    expect(resolveManagedCloudRouteFromPlatform("OpenAI").ok).toBe(true);
  });

  it("rejects unknown platforms", () => {
    const r = resolveManagedCloudRouteFromPlatform("gemini");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("gemini");
    }
  });

  it("resolves key from embedded group", () => {
    const key = {
      id: 1,
      group_id: 10,
      key: "k",
      name: "n",
      group: { id: 10, name: "g", platform: "openai" } as Sub2APIGroup,
    } as Sub2APIKey;
    expect(resolveManagedCloudRouteForKey(key, []).ok).toBe(true);
  });
});
