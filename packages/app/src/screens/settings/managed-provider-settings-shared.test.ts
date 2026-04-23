import { describe, expect, it } from "vitest";
import type { DesktopProviderPayload } from "@/screens/settings/sub2api-provider-types";
import { providerTargetHint } from "./managed-provider-settings-shared";

function createProvider(overrides: Partial<DesktopProviderPayload> = {}): DesktopProviderPayload {
  return {
    id: "provider",
    name: "Provider",
    type: "default",
    endpoint: "https://api.example.com",
    apiKey: "sk-test",
    isDefault: true,
    ...overrides,
  };
}

describe("providerTargetHint", () => {
  it("describes managed Claude rows as Claude-only", () => {
    expect(providerTargetHint(createProvider({ target: "claude" }))).toBe(
      "Claude Code · Anthropic",
    );
  });

  it("describes managed Codex rows as Codex-only", () => {
    expect(providerTargetHint(createProvider({ target: "codex" }))).toBe("Codex · Responses");
  });

  it("keeps legacy unscoped rows as dual-CLI", () => {
    expect(providerTargetHint(createProvider({ target: undefined }))).toBe("Claude Code + Codex");
  });
});
