import { describe, expect, it, vi } from "vitest";
import type { AgentProviderDefinition } from "@server/server/agent/provider-manifest";
import type { WorkspaceCloudRoutePayload } from "@server/shared/messages";
import type { Sub2APIGroupStatusItem, Sub2APIModelCatalog, Sub2APIKey } from "@/lib/sub2api-client";
import {
  buildCloudModelRoutingGroups,
  formatWorkspaceCloudRouteSwitchError,
  selectCloudModelForNextSession,
} from "./cloud-model-routing-utils";

const providerDefinitions: AgentProviderDefinition[] = [
  {
    id: "claude",
    label: "Claude",
    description: "Claude provider",
    defaultModeId: "default",
    modes: [],
  },
  {
    id: "codex",
    label: "Codex",
    description: "Codex provider",
    defaultModeId: "auto",
    modes: [],
  },
];

const price = {
  input_per_mtok_usd: 1,
  output_per_mtok_usd: 2,
  cache_write_per_mtok_usd: null,
  cache_read_per_mtok_usd: null,
  per_request_usd: null,
  per_image_usd: null,
  source: "official",
  has_reference: true,
};

const catalog: Sub2APIModelCatalog = {
  summary: {
    total_models: 1,
    token_models: 1,
    non_token_models: 0,
    best_savings_model: "claude-sonnet",
    max_savings_percent: 0.1,
  },
  items: [
    {
      model: "claude-sonnet",
      display_name: "Claude Sonnet",
      platform: "anthropic",
      billing_mode: "token",
      best_group: {
        id: 10,
        name: "Claude Fast",
        rate_multiplier: 0.8,
        rate_source: "group",
      },
      available_group_count: 1,
      official_pricing: price,
      effective_pricing_usd: price,
      comparison: {
        savings_percent: 0.2,
        is_cheaper_than_official: true,
        delta_input_per_mtok_usd: null,
        delta_output_per_mtok_usd: null,
        delta_per_request_usd: null,
        delta_per_image_usd: null,
      },
      pricing_details: {
        supports_prompt_caching: false,
        has_long_context_multiplier: false,
        long_context_input_threshold: 0,
        intervals: [],
      },
      other_groups: [],
    },
  ],
};

const statuses: Sub2APIGroupStatusItem[] = [
  {
    group_id: 10,
    group_name: "Claude Fast",
    latest_status: "up",
    stable_status: "up",
    latency_ms: null,
    availability_24h: 99.5,
    availability_7d: 99,
    observed_at: null,
  },
];

describe("buildCloudModelRoutingGroups", () => {
  it("builds selector cloud groups from the catalog for supported providers", () => {
    const groups = buildCloudModelRoutingGroups({
      catalog,
      statuses,
      providerDefinitions,
      workspaceRoutes: [
        {
          cwd: "/repo",
          provider: "claude",
          endpoint: "https://cloud.example",
          maskedKey: "sk-***",
          apiKeyId: 1,
          groupId: 10,
          groupName: "Claude Fast",
          platform: "anthropic",
          updatedAt: "2026-01-01T00:00:00.000Z",
        } satisfies WorkspaceCloudRoutePayload,
      ],
    });

    expect(groups).toEqual([
      expect.objectContaining({
        provider: "claude",
        groupId: 10,
        groupLabel: "Claude Fast",
        platform: "anthropic",
        description: expect.stringContaining("Current workspace"),
        models: [
          expect.objectContaining({
            id: "claude-sonnet",
            label: "Claude Sonnet",
          }),
        ],
      }),
    ]);
  });
});

describe("selectCloudModelForNextSession", () => {
  it("reuses an existing key before creating a new one and persists the workspace route", async () => {
    const existingKey = {
      id: 7,
      key: "sk-existing",
      group_id: 10,
    } as Sub2APIKey;
    const setWorkspaceCloudRoute = vi.fn(async (route) => ({
      ...route,
      maskedKey: "sk-***",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }));
    const createKey = vi.fn();

    await selectCloudModelForNextSession({
      serverId: "local",
      cwd: "/repo",
      endpoint: "https://cloud.example",
      isLoggedIn: true,
      keys: [existingKey],
      group: {
        provider: "claude",
        groupId: 10,
        groupLabel: "Claude Fast",
        platform: "anthropic",
        models: [{ id: "claude-sonnet", label: "Claude Sonnet" }],
      },
      provider: "claude",
      createKey,
      setWorkspaceCloudRoute,
    });

    expect(createKey).not.toHaveBeenCalled();
    expect(setWorkspaceCloudRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: "/repo",
        provider: "claude",
        endpoint: "https://cloud.example",
        apiKey: "sk-existing",
        apiKeyId: 7,
        groupId: 10,
        groupName: "Claude Fast",
        platform: "anthropic",
      }),
    );
  });
});

describe("formatWorkspaceCloudRouteSwitchError", () => {
  it("turns old daemon schema failures into a restart hint", () => {
    const error = new Error(
      "Unknown request schema requestType=set_workspace_cloud_route_request code=unknown_schema",
    ) as Error & { code?: string; requestType?: string };
    error.code = "unknown_schema";
    error.requestType = "set_workspace_cloud_route_request";

    expect(formatWorkspaceCloudRouteSwitchError(error)).toContain("Restart Desktop");
  });
});
