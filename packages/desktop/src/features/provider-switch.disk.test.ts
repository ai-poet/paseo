import { describe, expect, it } from "vitest";
import { normalizeProviderEndpoint, resolveActiveCodexIdFromDiskState, type StoredProvider } from "./provider-switch";

describe("resolveActiveCodexIdFromDiskState", () => {
  const mkProvider = (overrides: Partial<StoredProvider>): StoredProvider => ({
    id: "p1",
    name: "Test",
    type: "custom",
    endpoint: "https://api.example.com",
    apiKey: "sk-test",
    isDefault: false,
    target: "codex",
    codexWireApi: "responses",
    ...overrides,
  });

  it("returns provider id when auth + config match base_url and key", () => {
    const endpoint = "https://api.example.com";
    const providers = [
      mkProvider({
        id: "codex-only",
        endpoint,
        apiKey: "sk-abc",
        target: "codex",
      }),
    ];
    const baseUrl = `${normalizeProviderEndpoint(endpoint)}/v1`;
    const auth = JSON.stringify({ OPENAI_API_KEY: "sk-abc" });
    const config = `model_provider = "default"
model = "gpt-4o"

[model_providers.default]
name = "Test"
base_url = "${baseUrl}"
wire_api = "responses"
`;
    expect(resolveActiveCodexIdFromDiskState(auth, config, providers, null)).toBe("codex-only");
  });

  it("returns undefined when OPENAI_API_KEY is missing", () => {
    const providers = [mkProvider({ id: "x" })];
    const config = `[model_providers.default]
base_url = "https://api.example.com/v1"
`;
    expect(resolveActiveCodexIdFromDiskState("{}", config, providers, null)).toBeUndefined();
  });

  it("returns null when disk does not match any saved row", () => {
    const providers = [
      mkProvider({ id: "a", endpoint: "https://a.com", apiKey: "k1", target: "codex" }),
    ];
    const auth = JSON.stringify({ OPENAI_API_KEY: "other-key" });
    const config = `[model_providers.default]
base_url = "https://a.com/v1"
`;
    expect(resolveActiveCodexIdFromDiskState(auth, config, providers, null)).toBeNull();
  });

  it("matches when config base_url omits trailing /v1", () => {
    const endpoint = "https://api.example.com";
    const providers = [
      mkProvider({
        id: "no-v1-suffix",
        endpoint,
        apiKey: "sk-match",
        target: "codex",
      }),
    ];
    const auth = JSON.stringify({ OPENAI_API_KEY: "sk-match" });
    const config = `model_provider = "default"
[model_providers.default]
base_url = "${normalizeProviderEndpoint(endpoint)}"
`;
    expect(resolveActiveCodexIdFromDiskState(auth, config, providers, null)).toBe("no-v1-suffix");
  });

  it("uses single model_providers section when model_provider key is absent", () => {
    const endpoint = "https://gateway.test/v1/anthropic";
    const providers = [
      mkProvider({
        id: "solo",
        endpoint,
        apiKey: "keyz",
        target: "codex",
      }),
    ];
    const baseUrl = `${normalizeProviderEndpoint(endpoint)}/v1`;
    const auth = JSON.stringify({ OPENAI_API_KEY: "keyz" });
    const config = `
[model_providers.custom]
base_url = "${baseUrl}"
`;
    expect(resolveActiveCodexIdFromDiskState(auth, config, providers, null)).toBe("solo");
  });
});
