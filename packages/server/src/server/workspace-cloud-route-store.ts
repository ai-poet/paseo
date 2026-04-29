import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import type { AgentProvider } from "./agent/agent-sdk-types.js";

export const WorkspaceCloudRouteProviderSchema = z.enum(["claude", "codex"]);
export type WorkspaceCloudRouteProvider = z.infer<typeof WorkspaceCloudRouteProviderSchema>;

const WorkspaceCloudRouteRecordSchema = z
  .object({
    cwd: z.string().min(1),
    provider: WorkspaceCloudRouteProviderSchema,
    endpoint: z.string().min(1),
    apiKey: z.string().min(1),
    apiKeyId: z.number().int().positive().nullable().optional(),
    groupId: z.number().int().positive(),
    groupName: z.string().min(1),
    platform: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

const WorkspaceCloudRouteStoreFileSchema = z
  .object({
    version: z.literal(1),
    routes: z.array(WorkspaceCloudRouteRecordSchema),
  })
  .strict();

export type WorkspaceCloudRouteRecord = z.infer<typeof WorkspaceCloudRouteRecordSchema>;

export type WorkspaceCloudRouteInput = Omit<WorkspaceCloudRouteRecord, "updatedAt"> & {
  updatedAt?: string;
};

export type WorkspaceCloudRoutePayload = Omit<WorkspaceCloudRouteRecord, "apiKey"> & {
  maskedKey: string;
};

function normalizeProviderEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  if (trimmed.toLowerCase().endsWith("/v1")) {
    return trimmed.slice(0, -3);
  }
  return trimmed;
}

function providerEndpointBaseUrl(endpoint: string): string {
  const normalized = normalizeProviderEndpoint(endpoint);
  if (!normalized) {
    return `${endpoint.replace(/\/+$/, "")}/v1`;
  }
  return `${normalized}/v1`;
}

function normalizeCwd(cwd: string): string {
  const trimmed = cwd.trim();
  if (!trimmed) {
    return ".";
  }
  const normalized = trimmed.replace(/\\/g, "/");
  if (normalized === "/") {
    return normalized;
  }
  return normalized.replace(/\/+$/, "");
}

function routeKey(cwd: string, provider: WorkspaceCloudRouteProvider): string {
  return `${normalizeCwd(cwd)}::${provider}`;
}

function maskApiKey(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 12) {
    return trimmed;
  }
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-4)}`;
}

function toPayload(route: WorkspaceCloudRouteRecord): WorkspaceCloudRoutePayload {
  const { apiKey: _apiKey, ...rest } = route;
  return {
    ...rest,
    maskedKey: maskApiKey(route.apiKey),
  };
}

function stableRouteHash(route: WorkspaceCloudRouteRecord): string {
  return createHash("sha256")
    .update(`${normalizeCwd(route.cwd)}\n${route.provider}\n${route.groupId}\n${route.endpoint}`)
    .digest("hex")
    .slice(0, 24);
}

export function isWorkspaceCloudRouteProvider(
  provider: AgentProvider | string,
): provider is WorkspaceCloudRouteProvider {
  return provider === "claude" || provider === "codex";
}

export function buildWorkspaceCloudLaunchEnv(input: {
  paseoHome: string;
  route: WorkspaceCloudRouteRecord;
}): Record<string, string> {
  const route = WorkspaceCloudRouteRecordSchema.parse({
    ...input.route,
    cwd: normalizeCwd(input.route.cwd),
  });

  if (route.provider === "claude") {
    return {
      ANTHROPIC_BASE_URL: normalizeProviderEndpoint(route.endpoint),
      ANTHROPIC_AUTH_TOKEN: route.apiKey,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      CLAUDE_CODE_ENABLE_TELEMETRY: "0",
      DISABLE_TELEMETRY: "1",
    };
  }

  const codexHome = path.join(input.paseoHome, "cloud-routes", stableRouteHash(route), "codex");
  mkdirSync(codexHome, { recursive: true });
  writeFileSync(
    path.join(codexHome, "auth.json"),
    JSON.stringify({ OPENAI_API_KEY: route.apiKey }, null, 2),
  );
  writeFileSync(
    path.join(codexHome, "config.toml"),
    `model_provider = "OpenAI"
model = "gpt-5.4"
review_model = "gpt-5.4"
model_reasoning_effort = "xhigh"
disable_response_storage = true
network_access = "enabled"
windows_wsl_setup_acknowledged = true
model_context_window = 1000000
model_auto_compact_token_limit = 900000

[model_providers.OpenAI]
name = "OpenAI"
base_url = "${providerEndpointBaseUrl(route.endpoint)}"
wire_api = "responses"
requires_openai_auth = true
`,
  );

  return {
    CODEX_HOME: codexHome,
    OPENAI_API_KEY: route.apiKey,
  };
}

export class WorkspaceCloudRouteStore {
  private readonly filePath: string;

  constructor(private readonly paseoHome: string) {
    this.filePath = path.join(paseoHome, "workspace-cloud-routes.json");
  }

  getRoute(
    cwd: string,
    provider: WorkspaceCloudRouteProvider | AgentProvider,
  ): WorkspaceCloudRouteRecord | null {
    if (!isWorkspaceCloudRouteProvider(provider)) {
      return null;
    }
    return this.readRoutes().get(routeKey(cwd, provider)) ?? null;
  }

  getRoutePayload(
    cwd: string,
    provider: WorkspaceCloudRouteProvider | AgentProvider,
  ): WorkspaceCloudRoutePayload | null {
    const route = this.getRoute(cwd, provider);
    return route ? toPayload(route) : null;
  }

  listRoutes(): WorkspaceCloudRouteRecord[] {
    return Array.from(this.readRoutes().values());
  }

  listRoutePayloads(cwd?: string): WorkspaceCloudRoutePayload[] {
    const normalizedCwd = cwd ? normalizeCwd(cwd) : null;
    return this.listRoutes()
      .filter((route) => normalizedCwd === null || normalizeCwd(route.cwd) === normalizedCwd)
      .map(toPayload);
  }

  setRoute(input: WorkspaceCloudRouteInput): WorkspaceCloudRouteRecord {
    const record = WorkspaceCloudRouteRecordSchema.parse({
      ...input,
      cwd: normalizeCwd(input.cwd),
      endpoint: normalizeProviderEndpoint(input.endpoint),
      apiKey: input.apiKey.trim(),
      groupName: input.groupName.trim(),
      platform: input.platform.trim().toLowerCase(),
      updatedAt: input.updatedAt ?? new Date().toISOString(),
    });
    const routes = this.readRoutes();
    routes.set(routeKey(record.cwd, record.provider), record);
    this.writeRoutes(routes);
    return record;
  }

  clearRoute(cwd: string, provider: WorkspaceCloudRouteProvider): WorkspaceCloudRoutePayload | null {
    const routes = this.readRoutes();
    const key = routeKey(cwd, provider);
    const existing = routes.get(key) ?? null;
    if (!existing) {
      return null;
    }
    routes.delete(key);
    this.writeRoutes(routes);
    return toPayload(existing);
  }

  buildLaunchEnv(cwd: string, provider: AgentProvider): Record<string, string> {
    const route = this.getRoute(cwd, provider);
    if (!route) {
      return {};
    }
    return buildWorkspaceCloudLaunchEnv({
      paseoHome: this.paseoHome,
      route,
    });
  }

  private readRoutes(): Map<string, WorkspaceCloudRouteRecord> {
    if (!existsSync(this.filePath)) {
      return new Map();
    }
    try {
      const parsed = WorkspaceCloudRouteStoreFileSchema.safeParse(
        JSON.parse(readFileSync(this.filePath, "utf8")),
      );
      if (!parsed.success) {
        return new Map();
      }
      return new Map(parsed.data.routes.map((route) => [routeKey(route.cwd, route.provider), route]));
    } catch {
      return new Map();
    }
  }

  private writeRoutes(routes: Map<string, WorkspaceCloudRouteRecord>): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(
      this.filePath,
      JSON.stringify(
        {
          version: 1,
          routes: Array.from(routes.values()).sort((a, b) =>
            routeKey(a.cwd, a.provider).localeCompare(routeKey(b.cwd, b.provider)),
          ),
        },
        null,
        2,
      ),
    );
  }
}
