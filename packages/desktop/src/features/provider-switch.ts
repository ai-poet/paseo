/**
 * Provider switching for Claude Code and Codex configurations.
 *
 * Reads/writes ~/.claude/settings.json and ~/.codex/ config files
 * to switch between different API providers (sub2api, custom, etc.).
 *
 * Inspired by cc-switch (paseo/reference/cc-switch/).
 */
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import log from "electron-log/main";

export interface Provider {
  id: string;
  name: string;
  type: "default" | "sub2api" | "custom";
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

export const DEFAULT_PROVIDER_ID = "default";
const LEGACY_DEFAULT_PROVIDER_ID = "sub2api-default";
export const DEFAULT_PROVIDER_NAME = "Default";
export const DEFAULT_CLAUDE_MODEL = "claude-opus-4-7";

const PROVIDERS_FILE = join(homedir(), ".paseo", "providers.json");

function claudeSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

function codexAuthPath(): string {
  return join(homedir(), ".codex", "auth.json");
}

function codexConfigPath(): string {
  return join(homedir(), ".codex", "config.toml");
}

function providerEndpointBaseUrl(endpoint: string): string {
  return `${endpoint.replace(/\/+$/, "")}/v1`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function ensureParentDir(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}

async function atomicWriteText(filePath: string, content: string): Promise<void> {
  await ensureParentDir(filePath);

  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, content, "utf-8");

  if (process.platform === "win32" && existsSync(filePath)) {
    await rm(filePath, { force: true });
  }

  await rename(tempPath, filePath);
}

async function readJsonObject(filePath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function readFileOrNull(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

async function restoreFile(filePath: string, contents: string | null): Promise<void> {
  if (contents === null) {
    await rm(filePath, { force: true });
    return;
  }
  await atomicWriteText(filePath, contents);
}

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
  await ensureParentDir(PROVIDERS_FILE);
  await atomicWriteText(PROVIDERS_FILE, JSON.stringify(store, null, 2));
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildClaudeSettings(provider: Provider, existing: Record<string, unknown>) {
  const providerConfig = isRecord(provider.claudeConfig) ? provider.claudeConfig : {};
  const existingEnv = isRecord(existing.env) ? existing.env : {};
  const providerEnv = isRecord(providerConfig.env) ? providerConfig.env : {};
  const defaultClaudeModel = readString(providerEnv.ANTHROPIC_MODEL) ?? DEFAULT_CLAUDE_MODEL;
  const defaultOpusModel =
    readString(providerEnv.ANTHROPIC_DEFAULT_OPUS_MODEL) ?? defaultClaudeModel;

  return {
    ...existing,
    ...providerConfig,
    env: {
      ...existingEnv,
      ...providerEnv,
      ANTHROPIC_BASE_URL: provider.endpoint,
      ANTHROPIC_AUTH_TOKEN: provider.apiKey,
      ANTHROPIC_MODEL: defaultClaudeModel,
      ANTHROPIC_DEFAULT_OPUS_MODEL: defaultOpusModel,
    },
  };
}

function buildCodexAuth(provider: Provider): Record<string, string> {
  return provider.codexAuth ?? { OPENAI_API_KEY: provider.apiKey };
}

export function buildCodexConfig(provider: Provider): string {
  if (provider.codexConfig) {
    return provider.codexConfig;
  }

  const defaultCodexModel =
    provider.type === "default" || provider.type === "sub2api" ? DEFAULT_CLAUDE_MODEL : "gpt-4o";

  return `model_provider = "default"
model = "${defaultCodexModel}"

[model_providers.default]
name = "${provider.name}"
base_url = "${providerEndpointBaseUrl(provider.endpoint)}"
wire_api = "responses"
requires_openai_auth = true
`;
}

async function writeClaudeSettings(provider: Provider): Promise<void> {
  const merged = buildClaudeSettings(provider, await readJsonObject(claudeSettingsPath()));
  await atomicWriteText(claudeSettingsPath(), JSON.stringify(merged, null, 2));
  log.info("[provider-switch] wrote claude settings for provider:", provider.name);
}

async function writeCodexSettings(provider: Provider): Promise<void> {
  const authPath = codexAuthPath();
  const configPath = codexConfigPath();
  const oldAuth = await readFileOrNull(authPath);

  await atomicWriteText(authPath, JSON.stringify(buildCodexAuth(provider), null, 2));

  try {
    await atomicWriteText(configPath, buildCodexConfig(provider));
  } catch (error) {
    await restoreFile(authPath, oldAuth);
    throw error;
  }

  log.info("[provider-switch] wrote codex settings for provider:", provider.name);
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
  await restoreFile(claudeSettingsPath(), backup.claudeSettings);
  await restoreFile(codexAuthPath(), backup.codexAuth);
  await restoreFile(codexConfigPath(), backup.codexConfig);
  log.info("[provider-switch] restored config from backup at", backup.timestamp);
}

export async function getProviders(): Promise<ProviderStore> {
  return loadStore();
}

export async function addProvider(provider: Provider): Promise<void> {
  const store = await loadStore();
  const idx = store.providers.findIndex((entry) => entry.id === provider.id);
  if (idx >= 0) {
    store.providers[idx] = provider;
  } else {
    store.providers.push(provider);
  }
  await saveStore(store);
}

export async function removeProvider(id: string): Promise<void> {
  const store = await loadStore();
  store.providers = store.providers.filter((provider) => provider.id !== id);
  if (store.activeProviderId === id) {
    store.activeProviderId = null;
  }
  await saveStore(store);
}

export async function switchProvider(id: string): Promise<ConfigBackup> {
  const store = await loadStore();
  const provider = store.providers.find((entry) => entry.id === id);
  if (!provider) {
    throw new Error(`Provider not found: ${id}`);
  }

  const backup = await backupCurrentConfig();

  try {
    await writeClaudeSettings(provider);
    await writeCodexSettings(provider);
    store.activeProviderId = id;
    await saveStore(store);
  } catch (error) {
    await restoreConfig(backup);
    throw error;
  }

  log.info("[provider-switch] switched to provider:", provider.name);
  return backup;
}

export async function getCurrentProvider(): Promise<Provider | null> {
  const store = await loadStore();
  if (!store.activeProviderId) {
    return null;
  }
  return store.providers.find((provider) => provider.id === store.activeProviderId) ?? null;
}

export async function setupDefaultProvider(params: {
  endpoint: string;
  apiKey: string;
  name?: string;
}): Promise<Provider> {
  const store = await loadStore();
  const id = DEFAULT_PROVIDER_ID;
  const provider: Provider = {
    id,
    name: params.name ?? DEFAULT_PROVIDER_NAME,
    type: "default",
    endpoint: params.endpoint,
    apiKey: params.apiKey,
    isDefault: true,
    claudeConfig: {
      env: {
        ANTHROPIC_MODEL: DEFAULT_CLAUDE_MODEL,
        ANTHROPIC_DEFAULT_OPUS_MODEL: DEFAULT_CLAUDE_MODEL,
      },
    },
  };

  store.providers = store.providers.filter((entry) => entry.id !== LEGACY_DEFAULT_PROVIDER_ID);
  const idx = store.providers.findIndex((entry) => entry.id === id);
  if (idx >= 0) {
    store.providers[idx] = provider;
  } else {
    store.providers.push(provider);
  }

  const backup = await backupCurrentConfig();

  try {
    await writeClaudeSettings(provider);
    await writeCodexSettings(provider);
    store.activeProviderId = id;
    await saveStore(store);
  } catch (error) {
    await restoreConfig(backup);
    throw error;
  }

  log.info("[provider-switch] set up default provider");
  return provider;
}
