import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockedHome } = vi.hoisted(() => ({
  mockedHome: {
    dir: "",
  },
}));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return {
    ...actual,
    homedir: () => mockedHome.dir,
  };
});

describe("setupDefaultProvider scoped writes", () => {
  beforeEach(async () => {
    vi.resetModules();
    mockedHome.dir = await mkdtemp(join(tmpdir(), "paseo-provider-switch-"));
  });

  afterEach(async () => {
    if (mockedHome.dir) {
      await rm(mockedHome.dir, { recursive: true, force: true });
    }
  });

  it("writes only Claude config when scope is claude", async () => {
    const mod = await import("./provider-switch");

    await mod.setupDefaultProvider({
      endpoint: "https://api.example.com",
      apiKey: "sk-claude",
      name: "Claude only",
      scope: "claude",
    });

    const claudePath = join(mockedHome.dir, ".claude", "settings.json");
    const codexConfigPath = join(mockedHome.dir, ".codex", "config.toml");
    const codexAuthPath = join(mockedHome.dir, ".codex", "auth.json");
    const storePath = join(mockedHome.dir, ".paseo", "providers.json");

    expect(existsSync(claudePath)).toBe(true);
    expect(existsSync(codexConfigPath)).toBe(false);
    expect(existsSync(codexAuthPath)).toBe(false);

    const claudeSettings = await readFile(claudePath, "utf8");
    expect(claudeSettings).toContain('"ANTHROPIC_AUTH_TOKEN": "sk-claude"');

    const store = JSON.parse(await readFile(storePath, "utf8")) as {
      activeClaudeProviderId: string | null;
      activeCodexProviderId: string | null;
    };
    expect(store.activeClaudeProviderId).toBe(mod.PASEO_MANAGED_CLAUDE_PROVIDER_ID);
    expect(store.activeCodexProviderId).toBeNull();
  });

  it("writes only Codex config when scope is codex", async () => {
    const mod = await import("./provider-switch");

    await mod.setupDefaultProvider({
      endpoint: "https://api.example.com",
      apiKey: "sk-codex",
      name: "Codex only",
      scope: "codex",
    });

    const claudePath = join(mockedHome.dir, ".claude", "settings.json");
    const codexConfigPath = join(mockedHome.dir, ".codex", "config.toml");
    const codexAuthPath = join(mockedHome.dir, ".codex", "auth.json");
    const storePath = join(mockedHome.dir, ".paseo", "providers.json");

    expect(existsSync(claudePath)).toBe(false);
    expect(existsSync(codexConfigPath)).toBe(true);
    expect(existsSync(codexAuthPath)).toBe(true);

    const codexConfig = await readFile(codexConfigPath, "utf8");
    const codexAuth = await readFile(codexAuthPath, "utf8");
    expect(codexConfig).toContain('model_provider = "OpenAI"');
    expect(codexAuth).toContain('"OPENAI_API_KEY": "sk-codex"');

    const store = JSON.parse(await readFile(storePath, "utf8")) as {
      activeClaudeProviderId: string | null;
      activeCodexProviderId: string | null;
    };
    expect(store.activeClaudeProviderId).toBeNull();
    expect(store.activeCodexProviderId).toBe(mod.PASEO_MANAGED_CODEX_PROVIDER_ID);
  });

  it("does not mirror Claude active id into Codex when only Claude has been set", async () => {
    const mod = await import("./provider-switch");

    await mod.setupDefaultProvider({
      endpoint: "https://api.example.com",
      apiKey: "sk-claude",
      scope: "claude",
    });

    const providers = await mod.getProviders();
    expect(providers.activeClaudeProviderId).toBe(mod.PASEO_MANAGED_CLAUDE_PROVIDER_ID);
    expect(providers.activeCodexProviderId).toBeNull();
  });

  it("does not mirror Codex active id into Claude when only Codex has been set", async () => {
    const mod = await import("./provider-switch");

    await mod.setupDefaultProvider({
      endpoint: "https://api.example.com",
      apiKey: "sk-codex",
      scope: "codex",
    });

    const providers = await mod.getProviders();
    expect(providers.activeClaudeProviderId).toBeNull();
    expect(providers.activeCodexProviderId).toBe(mod.PASEO_MANAGED_CODEX_PROVIDER_ID);
  });
});
