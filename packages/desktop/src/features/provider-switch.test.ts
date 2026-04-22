import { describe, expect, it } from "vitest";
import {
  buildClaudeSettings,
  buildCodexConfig,
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_PROVIDER_ID,
  DEFAULT_PROVIDER_NAME,
  type Provider,
} from "./provider-switch";

function createProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: DEFAULT_PROVIDER_ID,
    name: DEFAULT_PROVIDER_NAME,
    type: "default",
    endpoint: "https://api.example.com/v1",
    apiKey: "sk-live-example",
    isDefault: true,
    ...overrides,
  };
}

describe("provider-switch", () => {
  it("writes the Anthropic default model into Claude settings", () => {
    const settings = buildClaudeSettings(createProvider(), {});

    expect(settings).toMatchObject({
      env: {
        ANTHROPIC_BASE_URL: "https://api.example.com/v1",
        ANTHROPIC_AUTH_TOKEN: "sk-live-example",
        ANTHROPIC_MODEL: DEFAULT_CLAUDE_MODEL,
        ANTHROPIC_DEFAULT_OPUS_MODEL: DEFAULT_CLAUDE_MODEL,
      },
    });
  });

  it("uses the default provider name and Claude model in Codex config", () => {
    const config = buildCodexConfig(createProvider());

    expect(config).toContain('model_provider = "default"');
    expect(config).toContain(`model = "${DEFAULT_CLAUDE_MODEL}"`);
    expect(config).toContain(`name = "${DEFAULT_PROVIDER_NAME}"`);
  });
});
