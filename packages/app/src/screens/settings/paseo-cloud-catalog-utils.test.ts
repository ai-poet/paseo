import { describe, expect, it } from "vitest";
import type {
  Sub2APIGroupStatusItem,
  Sub2APIModelCatalog,
  Sub2APIModelCatalogItem,
} from "@/lib/sub2api-client";
import { buildGroupFirstModelCatalog } from "./paseo-cloud-catalog-utils";

const price = {
  input_per_mtok_usd: 1,
  output_per_mtok_usd: 2,
  cache_write_per_mtok_usd: null,
  cache_read_per_mtok_usd: null,
  per_request_usd: null,
  per_image_usd: null,
  source: "catalog",
  has_reference: true,
};

const comparison = {
  savings_percent: 10,
  is_cheaper_than_official: true,
  delta_input_per_mtok_usd: null,
  delta_output_per_mtok_usd: null,
  delta_per_request_usd: null,
  delta_per_image_usd: null,
};

function item(
  overrides: Partial<Sub2APIModelCatalogItem> & Pick<Sub2APIModelCatalogItem, "model">,
): Sub2APIModelCatalogItem {
  return {
    model: overrides.model,
    display_name: overrides.display_name ?? overrides.model,
    platform: overrides.platform ?? "anthropic",
    billing_mode: "token",
    best_group: overrides.best_group ?? {
      id: 1,
      name: "Anthropic Fast",
      rate_multiplier: 1,
      rate_source: "group",
    },
    available_group_count: overrides.available_group_count ?? 1,
    official_pricing: price,
    effective_pricing_usd: price,
    comparison,
    pricing_details: {
      supports_prompt_caching: true,
      has_long_context_multiplier: false,
      long_context_input_threshold: 0,
      intervals: [],
    },
    other_groups: overrides.other_groups ?? [],
  };
}

describe("buildGroupFirstModelCatalog", () => {
  it("indexes best and companion groups and merges runtime status", () => {
    const catalog: Sub2APIModelCatalog = {
      summary: {
        total_models: 2,
        token_models: 2,
        non_token_models: 0,
        best_savings_model: "claude-sonnet",
        max_savings_percent: 10,
      },
      items: [
        item({
          model: "claude-sonnet",
          other_groups: [
            {
              group: {
                id: 2,
                name: "Anthropic Stable",
                rate_multiplier: 1.2,
                rate_source: "group",
              },
              effective_pricing_usd: price,
              comparison,
            },
          ],
        }),
        item({
          model: "gpt-5.4",
          platform: "openai",
          best_group: {
            id: 3,
            name: "OpenAI Fast",
            rate_multiplier: 1,
            rate_source: "group",
          },
        }),
      ],
    };
    const statuses: Sub2APIGroupStatusItem[] = [
      {
        group_id: 2,
        group_name: "Anthropic Stable",
        latest_status: "up",
        stable_status: "up",
        latency_ms: 120,
        availability_24h: 99.9,
        availability_7d: 99.8,
        observed_at: "2026-04-29T00:00:00.000Z",
      },
    ];

    const result = buildGroupFirstModelCatalog({
      catalog,
      statuses,
      platform: "anthropic",
    });

    expect(result.groups.map((group) => group.group.id)).toEqual([2, 1]);
    expect(result.groups[0]).toEqual(
      expect.objectContaining({
        platform: "anthropic",
        status: statuses[0],
      }),
    );
    expect(result.groups[0]!.models.map((model) => model.item.model)).toEqual(["claude-sonnet"]);
    expect(result.groups[1]!.models.map((model) => model.item.model)).toEqual(["claude-sonnet"]);
  });
});
