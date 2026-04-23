/**
 * Provider switching for Claude Code and Codex configurations.
 *
 * Reads/writes ~/.claude/settings.json and ~/.codex/ config files.
 * Custom entries may target only Claude, only Codex, or both (managed default).
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import log from "electron-log/main";

export const DEFAULT_PROVIDER_ID = "default";
const LEGACY_DEFAULT_PROVIDER_ID = "sub2api-default";
export const DEFAULT_PROVIDER_NAME = "Default";
export const DEFAULT_CLAUDE_MODEL = "claude-opus-4-7";

export type ManagedProviderTarget = "claude" | "codex";

/** Claude Code is written as native Anthropic Messages only; other wire shapes belong in a future gateway layer. */
export type ClaudeApiFormat = "anthropic";

export type CodexWireApi = "responses" | "chat";

const PASEO_UPSTREAM_FORMAT_KEY = "PASEO_ANTHROPIC_UPSTREAM_FORMAT";

export interface StoredProvider {
  id: string;
  name: string;
  type: "default" | "custom";
  endpoint: string;
  apiKey: string;
  isDefault: boolean;
  /** When set, switching applies only to that CLI. Omitted = write both (managed default / legacy). */
  target?: ManagedProviderTarget;
  claudeApiFormat?: ClaudeApiFormat;
  codexWireApi?: CodexWireApi;
  claudeConfig?: Record<string, unknown>;
  codexAuth?: Record<string, unknown>;
  codexConfig?: string;
}

/** @deprecated Prefer `StoredProvider`; kept for daemon IPC typings. */
export type Provider = StoredProvider;

export interface ProviderStore {
  providers: StoredProvider[];
  activeProviderId: string | null;
}

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

export function normalizeProviderEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  if (trimmed.toLowerCase().endsWith("/v1")) {
    return trimmed.slice(0, -3);
  }
  return trimmed;
}

function normalizeProviderType(type: string): "default" | "custom" {
  return type === "custom" ? "custom" : "default";
}

function normalizeClaudeApiFormat(raw: unknown): ClaudeApiFormat | undefined {
  if (raw === "anthropic") {
    return "anthropic";
  }
  // Legacy openai_* values are dropped on load until conversion is implemented app-side.
  return undefined;
}

function normalizeCodexWireApi(raw: unknown): CodexWireApi | undefined {
  if (raw === "responses" || raw === "chat") {
    return raw;
  }
  return undefined;
}

function normalizeTarget(raw: unknown): ManagedProviderTarget | undefined {
  if (raw === "claude" || raw === "codex") {
    return raw;
  }
  return undefined;
}

export function normalizeProvider(input: StoredProvider): StoredProvider {
  return {
    ...input,
    type: normalizeProviderType(input.type),
    endpoint: normalizeProviderEndpoint(input.endpoint),
    isDefault: input.id === DEFAULT_PROVIDER_ID ? true : input.isDefault,
    target: normalizeTarget(input.target),
    claudeApiFormat: normalizeClaudeApiFormat(input.claudeApiFormat),
    codexWireApi: normalizeCodexWireApi(input.codexWireApi),
  };
}

function providerEndpointBaseUrl(endpoint: string): string {
  const normalized = normalizeProviderEndpoint(endpoint);
  if (!normalized) {
    return `${endpoint.replace(/\/+$/, "")}/v1`;
  }
  return `${normalized}/v1`;
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
    const parsed: unknown = JSON.parse(raw);
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

function providerNeedsReNormalize(original: unknown, normalized: StoredProvider): boolean {
  if (!isRecord(original)) {
    return true;
  }
  return (
    normalizeProviderEndpoint(String(original.endpoint ?? "")) !== normalized.endpoint ||
    normalizeProviderType(String(original.type ?? "")) !== normalized.type ||
    Boolean(original.isDefault) !== normalized.isDefault ||
    normalizeTarget(original.target) !== normalized.target ||
    normalizeClaudeApiFormat(original.claudeApiFormat) !== normalized.claudeApiFormat ||
    normalizeCodexWireApi(original.codexWireApi) !== normalized.codexWireApi
  );
}

async function loadStore(): Promise<ProviderStore> {
  try {
    if (!existsSync(PROVIDERS_FILE)) {
      return { providers: [], activeProviderId: null };
    }
    const raw = await readFile(PROVIDERS_FILE, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    const parsedRecord = isRecord(parsed) ? parsed : {};
    const providersInput = Array.isArray(parsedRecord.providers) ? parsedRecord.providers : [];
    const providers = providersInput.map((p) =>
      normalizeProvider(p as StoredProvider),
    );
    const activeProviderId =
      typeof parsedRecord.activeProviderId === "string" &&
      providers.some((provider) => provider.id === parsedRecord.activeProviderId)
        ? parsedRecord.activeProviderId
        : null;
    const normalizedStore: ProviderStore = { providers, activeProviderId };
    const shouldPersistNormalizedStore =
      !Array.isArray(parsedRecord.providers) ||
      parsedRecord.activeProviderId !== activeProviderId ||
      providers.some((provider, index) => {
        const original = providersInput[index];
        return providerNeedsReNormalize(original, provider);
      });
    if (shouldPersistNormalizedStore) {
      await saveStore(normalizedStore);
    }
    return normalizedStore;
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

export function buildClaudeSettings(
  provider: StoredProvider,
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const providerConfig = isRecord(provider.claudeConfig) ? provider.claudeConfig : {};
  const existingEnv = isRecord(existing.env) ? existing.env : {};
  const providerEnv = isRecord(providerConfig.env) ? providerConfig.env : {};
  const defaultClaudeModel = readString(providerEnv.ANTHROPIC_MODEL) ?? DEFAULT_CLAUDE_MODEL;
  const defaultOpusModel =
    readString(providerEnv.ANTHROPIC_DEFAULT_OPUS_MODEL) ?? defaultClaudeModel;

  const env: Record<string, unknown> = {
    ...existingEnv,
    ...providerEnv,
    ANTHROPIC_BASE_URL: normalizeProviderEndpoint(provider.endpoint),
    ANTHROPIC_AUTH_TOKEN: provider.apiKey,
    ANTHROPIC_MODEL: defaultClaudeModel,
    ANTHROPIC_DEFAULT_OPUS_MODEL: defaultOpusModel,
  };
  delete env[PASEO_UPSTREAM_FORMAT_KEY];

  return {
    ...existing,
    ...providerConfig,
    env,
  };
}

export function buildCodexAuth(provider: StoredProvider): Record<string, unknown> {
  return (provider.codexAuth as Record<string, unknown>) ?? { OPENAI_API_KEY: provider.apiKey };
}

export function buildCodexConfig(provider: StoredProvider): string {
  if (provider.codexConfig) {
    return provider.codexConfig;
  }
  const defaultCodexModel = provider.type === "default" ? DEFAULT_CLAUDE_MODEL : "gpt-4o";
  const wireApi: CodexWireApi = provider.codexWireApi ?? "responses";
  return `model_provider = "default"
model = "${defaultCodexModel}"

[model_providers.default]
name = "${provider.name}"
base_url = "${providerEndpointBaseUrl(provider.endpoint)}"
wire_api = "${wireApi}"
requires_openai_auth = true
`;
}

async function writeClaudeSettings(provider: StoredProvider): Promise<void> {
  const merged = buildClaudeSettings(provider, await readJsonObject(claudeSettingsPath()));
  await atomicWriteText(claudeSettingsPath(), JSON.stringify(merged, null, 2));
  log.info("[provider-switch] wrote claude settings for provider:", provider.name);
}

async function writeCodexSettings(provider: StoredProvider): Promise<void> {
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

export interface ConfigBackup {
  timestamp: number;
  claudeSettings: string | null;
  codexAuth: string | null;
  codexConfig: string | null;
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

function shouldWriteClaude(provider: StoredProvider): boolean {
  return provider.target === undefined || provider.target === "claude";
}

function shouldWriteCodex(provider: StoredProvider): boolean {
  return provider.target === undefined || provider.target === "codex";
}

export async function getProviders(): Promise<ProviderStore> {
  return loadStore();
}

export async function addProvider(provider: StoredProvider): Promise<void> {
  const store = await loadStore();
  const normalizedProvider = normalizeProvider(provider);
  const idx = store.providers.findIndex((entry) => entry.id === normalizedProvider.id);
  if (idx >= 0) {
    store.providers[idx] = normalizedProvider;
  } else {
    store.providers.push(normalizedProvider);
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
    if (shouldWriteClaude(provider)) {
      await writeClaudeSettings(provider);
    }
    if (shouldWriteCodex(provider)) {
      await writeCodexSettings(provider);
    }
    store.activeProviderId = id;
    await saveStore(store);
  } catch (error) {
    await restoreConfig(backup);
    throw error;
  }
  log.info("[provider-switch] switched to provider:", provider.name);
  return backup;
}

export async function getCurrentProvider(): Promise<StoredProvider | null> {
  const store = await loadStore();
  if (!store.activeProviderId) {
    return null;
  }
  return store.providers.find((p) => p.id === store.activeProviderId) ?? null;
}

export async function setupDefaultProvider(params: {
  endpoint: string;
  apiKey: string;
  name?: string;
}): Promise<StoredProvider> {
  const store = await loadStore();
  const id = DEFAULT_PROVIDER_ID;
  const provider: StoredProvider = {
    id,
    name: params.name ?? DEFAULT_PROVIDER_NAME,
    type: "default",
    endpoint: normalizeProviderEndpoint(params.endpoint),
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
