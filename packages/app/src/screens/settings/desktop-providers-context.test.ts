import { describe, expect, it } from "vitest";
import type { ProviderStore } from "@/screens/settings/sub2api-provider-types";
import { resolveScopedActiveProviderIds } from "./desktop-providers-context";

function createStore(overrides: Partial<ProviderStore> = {}): ProviderStore {
  return {
    providers: [],
    activeProviderId: null,
    activeClaudeProviderId: null,
    activeCodexProviderId: null,
    ...overrides,
  };
}

describe("resolveScopedActiveProviderIds", () => {
  it("falls back to the legacy active id only when no scoped ids exist", () => {
    expect(
      resolveScopedActiveProviderIds(
        createStore({
          activeProviderId: "legacy",
        }),
      ),
    ).toEqual({
      claude: "legacy",
      codex: "legacy",
    });
  });

  it("does not mirror a Claude-specific active id onto Codex", () => {
    expect(
      resolveScopedActiveProviderIds(
        createStore({
          activeProviderId: "legacy",
          activeClaudeProviderId: "claude-only",
        }),
      ),
    ).toEqual({
      claude: "claude-only",
      codex: null,
    });
  });

  it("does not mirror a Codex-specific active id onto Claude", () => {
    expect(
      resolveScopedActiveProviderIds(
        createStore({
          activeProviderId: "legacy",
          activeCodexProviderId: "codex-only",
        }),
      ),
    ).toEqual({
      claude: null,
      codex: "codex-only",
    });
  });
});
