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

/** Codex config uses OpenAI Responses wire only until chat support is added. */
export type CodexWireApi = "responses";

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
  /** Legacy field: equals both ids when they match; otherwise Claude id for older readers. */
  activeProviderId: string | null;
  activeClaudeProviderId: string | null;
  activeCodexProviderId: string | null;
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
  if (raw === "responses") {
    return "responses";
  }
  // Legacy "chat" is dropped on load until we implement chat-completions wiring.
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

function normalizeUrlForProviderMatch(url: string): string {
  return normalizeProviderEndpoint(url).replace(/\/+$/, "").toLowerCase();
}

/** Codex may store base_url with or without a trailing /v1; we accept either vs our saved row. */
function codexDiskBaseUrlMatchKeys(diskRaw: string): Set<string> {
  const trimmed = diskRaw.trim().replace(/\/+$/, "");
  const keys = new Set<string>();
  keys.add(normalizeUrlForProviderMatch(trimmed));
  if (!trimmed.toLowerCase().endsWith("/v1")) {
    keys.add(normalizeUrlForProviderMatch(`${trimmed}/v1`));
  }
  return keys;
}

function listCodexModelProviderSectionNames(toml: string): string[] {
  const names: string[] = [];
  const re = /^\[model_providers\.([^\]]+)\]\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(toml)) !== null) {
    names.push(m[1]);
  }
  return names;
}

function extractCodexModelProviderKey(toml: string): string | null {
  const line =
    /^\s*model_provider\s*=\s*"([^"]+)"/m.exec(toml) ??
    /^\s*model_provider\s*=\s*'([^']+)'/m.exec(toml) ??
    /^\s*model_provider\s*=\s*([A-Za-z0-9_-]+)/m.exec(toml);
  return line ? line[1] : null;
}

function extractCodexBaseUrlForSection(toml: string, sectionName: string): string | null {
  const header = `[model_providers.${sectionName}]`;
  let inSection = false;
  for (const line of toml.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      if (inSection) {
        break;
      }
      if (trimmed === header) {
        inSection = true;
        continue;
      }
      inSection = false;
      continue;
    }
    if (!inSection) {
      continue;
    }
    const quoted =
      /^\s*base_url\s*=\s*"([^"]*)"/.exec(line) ?? /^\s*base_url\s*=\s*'([^']*)'/.exec(line);
    if (quoted) {
      return quoted[1].trim();
    }
    const bare = /^\s*base_url\s*=\s*(\S+)/.exec(line);
    if (bare) {
      return bare[1].trim();
    }
  }
  return null;
}

function parseCodexAuthOpenAiKey(authJsonText: string): string | null {
  try {
    const parsed: unknown = JSON.parse(authJsonText);
    if (!isRecord(parsed)) {
      return null;
    }
    return readString(parsed.OPENAI_API_KEY);
  } catch {
    return null;
  }
}

function resolveCodexDiskBaseUrl(configToml: string): string | null {
  const named = extractCodexModelProviderKey(configToml);
  if (named) {
    const fromNamed = extractCodexBaseUrlForSection(configToml, named);
    if (fromNamed) {
      return fromNamed;
    }
  }
  const sections = listCodexModelProviderSectionNames(configToml);
  if (sections.length === 1) {
    return extractCodexBaseUrlForSection(configToml, sections[0]!);
  }
  return null;
}

/**
 * Match ~/.codex files to a saved provider row. Returns undefined when files are missing or
 * unreadable so callers keep JSON state; null when disk is readable but matches nothing.
 */
export function resolveActiveCodexIdFromDiskState(
  authJsonText: string,
  configTomlText: string,
  providers: StoredProvider[],
  preferId: string | null,
): string | null | undefined {
  const apiKey = parseCodexAuthOpenAiKey(authJsonText);
  const baseUrl = resolveCodexDiskBaseUrl(configTomlText);
  if (!apiKey || !baseUrl) {
    return undefined;
  }
  const diskKeys = codexDiskBaseUrlMatchKeys(baseUrl);

  const candidates = providers.filter(shouldWriteCodex);
  const matches = candidates.filter((p) => {
    const expected = normalizeUrlForProviderMatch(providerEndpointBaseUrl(p.endpoint));
    return diskKeys.has(expected) && p.apiKey.trim() === apiKey;
  });
  if (matches.length === 0) {
    return null;
  }
  if (matches.length === 1) {
    return matches[0]!.id;
  }
  if (preferId && matches.some((m) => m.id === preferId)) {
    return preferId;
  }
  return matches[0]!.id;
}

async function inferActiveClaudeProviderIdFromDisk(
  providers: StoredProvider[],
  preferId: string | null,
): Promise<string | null | undefined> {
  const raw = await readFileOrNull(claudeSettingsPath());
  if (!raw?.trim()) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) {
    return undefined;
  }
  const env = isRecord(parsed.env) ? parsed.env : {};
  const baseUrl = readString(env.ANTHROPIC_BASE_URL);
  const token = readString(env.ANTHROPIC_AUTH_TOKEN);
  if (!baseUrl || !token) {
    return undefined;
  }
  const diskEp = normalizeProviderEndpoint(baseUrl);

  const candidates = providers.filter(shouldWriteClaude);
  const matches = candidates.filter(
    (p) => normalizeProviderEndpoint(p.endpoint) === diskEp && p.apiKey.trim() === token.trim(),
  );
  if (matches.length === 0) {
    return null;
  }
  if (matches.length === 1) {
    return matches[0]!.id;
  }
  if (preferId && matches.some((m) => m.id === preferId)) {
    return preferId;
  }
  return matches[0]!.id;
}

async function inferActiveCodexProviderIdFromDisk(
  providers: StoredProvider[],
  preferId: string | null,
): Promise<string | null | undefined> {
  const authRaw = await readFileOrNull(codexAuthPath());
  const configRaw = await readFileOrNull(codexConfigPath());
  if (!authRaw?.trim() || !configRaw?.trim()) {
    return undefined;
  }
  return resolveActiveCodexIdFromDiskState(authRaw, configRaw, providers, preferId);
}

async function loadStore(): Promise<ProviderStore> {
  try {
    if (!existsSync(PROVIDERS_FILE)) {
      return {
        providers: [],
        activeProviderId: null,
        activeClaudeProviderId: null,
        activeCodexProviderId: null,
      };
    }
    const raw = await readFile(PROVIDERS_FILE, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    const parsedRecord = isRecord(parsed) ? parsed : {};
    const providersInput = Array.isArray(parsedRecord.providers) ? parsedRecord.providers : [];
    const providers = providersInput.map((p) =>
      normalizeProvider(p as StoredProvider),
    );
    const legacyActive =
      typeof parsedRecord.activeProviderId === "string" &&
      providers.some((provider) => provider.id === parsedRecord.activeProviderId)
        ? parsedRecord.activeProviderId
        : null;

    const readScopedActive = (key: string): string | null => {
      const raw = parsedRecord[key];
      if (typeof raw !== "string" || !providers.some((p) => p.id === raw)) {
        return null;
      }
      return raw;
    };

    let activeClaudeProviderId = readScopedActive("activeClaudeProviderId") ?? legacyActive;
    let activeCodexProviderId = readScopedActive("activeCodexProviderId") ?? legacyActive;

    const diskClaudeId = await inferActiveClaudeProviderIdFromDisk(providers, activeClaudeProviderId);
    if (diskClaudeId !== undefined) {
      activeClaudeProviderId = diskClaudeId;
    }
    const diskCodexId = await inferActiveCodexProviderIdFromDisk(providers, activeCodexProviderId);
    if (diskCodexId !== undefined) {
      activeCodexProviderId = diskCodexId;
    }

    const activeProviderId =
      activeClaudeProviderId !== null &&
      activeCodexProviderId !== null &&
      activeClaudeProviderId === activeCodexProviderId
        ? activeClaudeProviderId
        : legacyActive;

    const normalizedStore: ProviderStore = {
      providers,
      activeProviderId,
      activeClaudeProviderId,
      activeCodexProviderId,
    };
    const shouldPersistNormalizedStore =
      !Array.isArray(parsedRecord.providers) ||
      parsedRecord.activeProviderId !== activeProviderId ||
      parsedRecord.activeClaudeProviderId !== activeClaudeProviderId ||
      parsedRecord.activeCodexProviderId !== activeCodexProviderId ||
      providers.some((provider, index) => {
        const original = providersInput[index];
        return providerNeedsReNormalize(original, provider);
      });
    if (shouldPersistNormalizedStore) {
      await saveStore(normalizedStore);
    }
    return normalizedStore;
  } catch {
    return {
      providers: [],
      activeProviderId: null,
      activeClaudeProviderId: null,
      activeCodexProviderId: null,
    };
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
  return `model_provider = "default"
model = "${defaultCodexModel}"

[model_providers.default]
name = "${provider.name}"
base_url = "${providerEndpointBaseUrl(provider.endpoint)}"
wire_api = "responses"
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

function syncLegacyActiveProviderId(store: ProviderStore): void {
  const c = store.activeClaudeProviderId;
  const x = store.activeCodexProviderId;
  store.activeProviderId = c !== null && c === x ? c : (c ?? x ?? null);
}

export async function removeProvider(id: string): Promise<void> {
  const store = await loadStore();
  store.providers = store.providers.filter((provider) => provider.id !== id);
  if (store.activeProviderId === id) {
    store.activeProviderId = null;
  }
  if (store.activeClaudeProviderId === id) {
    store.activeClaudeProviderId = null;
  }
  if (store.activeCodexProviderId === id) {
    store.activeCodexProviderId = null;
  }
  syncLegacyActiveProviderId(store);
  await saveStore(store);
}

/**
 * Apply a saved endpoint to Claude and/or Codex on disk.
 * @param explicitScope When set, only that CLI is updated (must be supported by the provider row).
 */
export async function switchProvider(
  id: string,
  explicitScope?: "claude" | "codex",
): Promise<ConfigBackup> {
  const store = await loadStore();
  const provider = store.providers.find((entry) => entry.id === id);
  if (!provider) {
    throw new Error(`Provider not found: ${id}`);
  }

  let writeClaude: boolean;
  let writeCodex: boolean;
  if (explicitScope === "claude") {
    if (!shouldWriteClaude(provider)) {
      throw new Error("This endpoint does not apply to Claude Code.");
    }
    writeClaude = true;
    writeCodex = false;
  } else if (explicitScope === "codex") {
    if (!shouldWriteCodex(provider)) {
      throw new Error("This endpoint does not apply to Codex.");
    }
    writeClaude = false;
    writeCodex = true;
  } else {
    writeClaude = shouldWriteClaude(provider);
    writeCodex = shouldWriteCodex(provider);
  }

  const backup = await backupCurrentConfig();
  try {
    if (writeClaude) {
      await writeClaudeSettings(provider);
      store.activeClaudeProviderId = id;
    }
    if (writeCodex) {
      await writeCodexSettings(provider);
      store.activeCodexProviderId = id;
    }
    syncLegacyActiveProviderId(store);
    await saveStore(store);
  } catch (error) {
    await restoreConfig(backup);
    throw error;
  }
  log.info("[provider-switch] switched to provider:", provider.name, explicitScope ?? "auto");
  return backup;
}

export async function getCurrentProvider(): Promise<StoredProvider | null> {
  const store = await loadStore();
  const id = store.activeClaudeProviderId ?? store.activeProviderId;
  if (!id) {
    return null;
  }
  return store.providers.find((p) => p.id === id) ?? null;
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
    store.activeClaudeProviderId = id;
    store.activeCodexProviderId = id;
    syncLegacyActiveProviderId(store);
    await saveStore(store);
  } catch (error) {
    await restoreConfig(backup);
    throw error;
  }
  log.info("[provider-switch] set up default provider");
  return provider;
}
