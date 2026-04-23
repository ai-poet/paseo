import { describe, expect, it } from "vitest";
import {
  buildClaudeSettings,
  buildCodexConfig,
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_PROVIDER_ID,
  DEFAULT_PROVIDER_NAME,
  PASEO_MANAGED_CODEX_PROVIDER_ID,
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
  it("writes Anthropic settings with normalized endpoint and Claude Code guide flags", () => {
    const settings = buildClaudeSettings(createProvider(), {});

    expect(settings).toMatchObject({
      env: {
        ANTHROPIC_BASE_URL: "https://api.example.com",
        ANTHROPIC_AUTH_TOKEN: "sk-live-example",
        ANTHROPIC_MODEL: DEFAULT_CLAUDE_MODEL,
        ANTHROPIC_DEFAULT_OPUS_MODEL: DEFAULT_CLAUDE_MODEL,
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
        CLAUDE_CODE_ATTRIBUTION_HEADER: "0",
      },
    });
  });

  it("writes Codex config in the integration-guide format", () => {
    const config = buildCodexConfig(createProvider());

    expect(config).toContain('model_provider = "OpenAI"');
    expect(config).toContain('model = "gpt-5.4"');
    expect(config).toContain('review_model = "gpt-5.4"');
    expect(config).toContain('model_reasoning_effort = "xhigh"');
    expect(config).toContain("disable_response_storage = true");
    expect(config).toContain(`[model_providers.OpenAI]`);
    expect(config).toContain('name = "OpenAI"');
    expect(config).toContain('base_url = "https://api.example.com/v1"');
    expect(config).not.toContain("/v1/v1");
  });

  it("forces managed Codex rows to use gpt-5.4 template even if stale custom config exists", () => {
    const config = buildCodexConfig(
      createProvider({
        id: PASEO_MANAGED_CODEX_PROVIDER_ID,
        target: "codex",
        codexConfig: 'model = "claude-opus-4-7"\n',
      }),
    );

    expect(config).toContain('model = "gpt-5.4"');
    expect(config).toContain('review_model = "gpt-5.4"');
    expect(config).not.toContain('model = "claude-opus-4-7"');
  });
});
