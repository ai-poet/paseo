/**
 * Provider switching for Claude Code and Codex configurations.
 *
 * Reads/writes ~/.claude/settings.json and ~/.codex/ config files
 * to switch between different API providers (sub2api, custom, etc.).
 *
 * Inspired by cc-switch (paseo/reference/cc-switch/).
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import log from "electron-log/main";

export interface Provider {
  id: string;
  name: string;
  type: "sub2api" | "custom";
  endpoint: string;
  apiKey: string;
  isDefault: boolean;
  claudeConfig?: Record<string, unknown>;
  codexAuth?: Record<string, string>;
  codexConfig?: string;
}

export interface ConfigBackup {
  timestamp: number;
  claudeSettings: string | null;
  codexAuth: string | null;
  codexConfig: string | null;
}

interface ProviderStore {
  providers: Provider[];
  activeProviderId: string | null;
}

const PROVIDERS_FILE = join(homedir(), ".paseo", "providers.json");

// Config file paths
function claudeSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}
function codexAuthPath(): string {
  return join(homedir(), ".codex", "auth.json");
}
function codexConfigPath(): string {
  return join(homedir(), ".codex", "config.toml");
}

// --- Store ---

async function loadStore(): Promise<ProviderStore> {
  try {
    if (!existsSync(PROVIDERS_FILE)) {
      return { providers: [], activeProviderId: null };
    }
    const raw = await readFile(PROVIDERS_FILE, "utf-8");
    return JSON.parse(raw) as ProviderStore;
  } catch {
    return { providers: [], activeProviderId: null };
  }
}

async function saveStore(store: ProviderStore): Promise<void> {
  const dir = join(homedir(), ".paseo");
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(PROVIDERS_FILE, JSON.stringify(store, null, 2), "utf-8");
}

// --- Config writers ---

async function writeClaudeSettings(provider: Provider): Promise<void> {
  const dir = join(homedir(), ".claude");
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  // Read existing settings to preserve user customizations
  let existing: Record<string, unknown> = {};
  try {
    const raw = await readFile(claudeSettingsPath(), "utf-8");
    existing = JSON.parse(raw);
  } catch {
    // No existing file
  }

  const env = (existing.env as Record<string, string>) ?? {};
  env.ANTHROPIC_BASE_URL = provider.endpoint;
  env.ANTHROPIC_AUTH_TOKEN = provider.apiKey;

  const merged = {
    ...existing,
    env,
    ...(provider.claudeConfig ?? {}),
  };

  await writeFile(claudeSettingsPath(), JSON.stringify(merged, null, 2), "utf-8");
  log.info("[provider-switch] wrote claude settings for provider:", provider.name);
}

async function writeCodexSettings(provider: Provider): Promise<void> {
  const dir = join(homedir(), ".codex");
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  // Write auth.json
  const auth = provider.codexAuth ?? { OPENAI_API_KEY: provider.apiKey };
  await writeFile(codexAuthPath(), JSON.stringify(auth, null, 2), "utf-8");

  // Write config.toml
  const configToml =
    provider.codexConfig ??
    `model_provider = "sub2api"
model = "gpt-4o"

[model_providers.sub2api]
name = "${provider.name}"
base_url = "${provider.endpoint}/v1"
wire_api = "responses"
requires_openai_auth = true
`;
  await writeFile(codexConfigPath(), configToml, "utf-8");
  log.info("[provider-switch] wrote codex settings for provider:", provider.name);
}

// --- Backup / Restore ---

async function readFileOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

export async function backupCurrentConfig(): Promise<ConfigBackup> {
  return {
    timestamp: Date.now(),
    claudeSettings: await readFileOrNull(claudeSettingsPath()),
    codexAuth: await readFileOrNull(codexAuthPath()),
    codexConfig: await readFileOrNull(codexConfigPath()),
  };
}

export async function restoreConfig(backup: ConfigBackup): Promise<void> {
  if (backup.claudeSettings !== null) {
    const dir = join(homedir(), ".claude");
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(claudeSettingsPath(), backup.claudeSettings, "utf-8");
  }
  if (backup.codexAuth !== null) {
    const dir = join(homedir(), ".codex");
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(codexAuthPath(), backup.codexAuth, "utf-8");
  }
  if (backup.codexConfig !== null) {
    await writeFile(codexConfigPath(), backup.codexConfig, "utf-8");
  }
  log.info("[provider-switch] restored config from backup at", backup.timestamp);
}

// --- Public API ---

export async function getProviders(): Promise<ProviderStore> {
  return loadStore();
}

export async function addProvider(provider: Provider): Promise<void> {
  const store = await loadStore();
  const idx = store.providers.findIndex((p) => p.id === provider.id);
  if (idx >= 0) {
    store.providers[idx] = provider;
  } else {
    store.providers.push(provider);
  }
  await saveStore(store);
}

export async function removeProvider(id: string): Promise<void> {
  const store = await loadStore();
  store.providers = store.providers.filter((p) => p.id !== id);
  if (store.activeProviderId === id) {
    store.activeProviderId = null;
  }
  await saveStore(store);
}

export async function switchProvider(id: string): Promise<ConfigBackup> {
  const store = await loadStore();
  const provider = store.providers.find((p) => p.id === id);
  if (!provider) {
    throw new Error(`Provider not found: ${id}`);
  }

  // Backup current config before switching
  const backup = await backupCurrentConfig();

  // Write new configs
  await writeClaudeSettings(provider);
  await writeCodexSettings(provider);

  // Update active provider
  store.activeProviderId = id;
  await saveStore(store);

  log.info("[provider-switch] switched to provider:", provider.name);
  return backup;
}

export async function getCurrentProvider(): Promise<Provider | null> {
  const store = await loadStore();
  if (!store.activeProviderId) return null;
  return store.providers.find((p) => p.id === store.activeProviderId) ?? null;
}

export async function setupDefaultProvider(params: {
  endpoint: string;
  apiKey: string;
  name?: string;
}): Promise<Provider> {
  const store = await loadStore();
  const id = "sub2api-default";
  const provider: Provider = {
    id,
    name: params.name ?? "Sub2API",
    type: "sub2api",
    endpoint: params.endpoint,
    apiKey: params.apiKey,
    isDefault: true,
  };

  const idx = store.providers.findIndex((p) => p.id === id);
  if (idx >= 0) {
    store.providers[idx] = provider;
  } else {
    store.providers.push(provider);
  }
  store.activeProviderId = id;
  await saveStore(store);

  // Write configs immediately
  await writeClaudeSettings(provider);
  await writeCodexSettings(provider);

  log.info("[provider-switch] set up default sub2api provider");
  return provider;
}
