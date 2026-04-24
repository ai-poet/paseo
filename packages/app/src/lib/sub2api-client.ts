export type Sub2APIUsagePeriod = "today" | "week" | "month";

export interface Sub2APIUsageStatsQuery {
  period?: Sub2APIUsagePeriod;
  apiKeyId?: number | null;
  timezone?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface Sub2APIEnvelope<T> {
  code: number;
  message: string;
  reason?: string;
  metadata?: Record<string, string>;
  data: T;
}

export interface Sub2APIPaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface Sub2APIUser {
  id: number;
  email: string;
  username: string;
  role: string;
  balance: number;
  concurrency: number;
  status: string;
  allowed_groups: number[];
  created_at: string;
  updated_at: string;
  run_mode?: string;
}

export interface Sub2APIGroup {
  id: number;
  name: string;
  description: string;
  platform: string;
  rate_multiplier: number;
  status: string;
  subscription_type: string;
  allow_messages_dispatch: boolean;
}

export interface Sub2APIKey {
  id: number;
  user_id: number;
  key: string;
  name: string;
  group_id: number | null;
  status: string;
  quota: number;
  quota_used: number;
  rate_limit_5h: number;
  rate_limit_1d: number;
  rate_limit_7d: number;
  usage_5h: number;
  usage_1d: number;
  usage_7d: number;
  created_at: string;
  updated_at: string;
  group?: Sub2APIGroup | null;
}

export interface Sub2APIUsageStats {
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_tokens: number;
  total_tokens: number;
  total_cost: number;
  total_actual_cost: number;
  average_duration_ms: number;
}

export interface Sub2APIModelCatalogSummary {
  total_models: number;
  token_models: number;
  non_token_models: number;
  best_savings_model: string;
  max_savings_percent: number;
}

export interface Sub2APIModelCatalogGroupRef {
  id: number;
  name: string;
  rate_multiplier: number;
  rate_source: string;
}

export interface Sub2APIModelCatalogPrice {
  input_per_mtok_usd: number | null;
  output_per_mtok_usd: number | null;
  cache_write_per_mtok_usd: number | null;
  cache_read_per_mtok_usd: number | null;
  per_request_usd: number | null;
  per_image_usd: number | null;
  source: string;
  has_reference: boolean;
}

export interface Sub2APIModelCatalogComparison {
  savings_percent: number | null;
  is_cheaper_than_official: boolean;
  delta_input_per_mtok_usd: number | null;
  delta_output_per_mtok_usd: number | null;
  delta_per_request_usd: number | null;
  delta_per_image_usd: number | null;
}

export interface Sub2APIModelCatalogPriceInterval {
  min_tokens: number;
  max_tokens: number | null;
  tier_label: string;
  input_per_mtok_usd: number | null;
  output_per_mtok_usd: number | null;
  cache_write_per_mtok_usd: number | null;
  cache_read_per_mtok_usd: number | null;
  per_request_usd: number | null;
  per_image_usd: number | null;
}

export interface Sub2APIModelCatalogPricingDetails {
  supports_prompt_caching: boolean;
  has_long_context_multiplier: boolean;
  long_context_input_threshold: number;
  intervals: Sub2APIModelCatalogPriceInterval[];
}

export interface Sub2APIModelCatalogGroupCompanion {
  group: Sub2APIModelCatalogGroupRef;
  effective_pricing_usd: Sub2APIModelCatalogPrice;
  comparison: Sub2APIModelCatalogComparison;
}

export interface Sub2APIModelCatalogItem {
  model: string;
  display_name: string;
  platform: string;
  billing_mode: string;
  best_group: Sub2APIModelCatalogGroupRef;
  available_group_count: number;
  official_pricing: Sub2APIModelCatalogPrice;
  effective_pricing_usd: Sub2APIModelCatalogPrice;
  comparison: Sub2APIModelCatalogComparison;
  pricing_details: Sub2APIModelCatalogPricingDetails;
  other_groups: Sub2APIModelCatalogGroupCompanion[];
}

export interface Sub2APIModelCatalog {
  items: Sub2APIModelCatalogItem[];
  summary: Sub2APIModelCatalogSummary;
}

export interface Sub2APIGroupStatusItem {
  group_id: number;
  group_name: string;
  latest_status: string;
  stable_status: string;
  latency_ms: number | null;
  availability_24h: number | null;
  availability_7d: number | null;
  observed_at: string | null;
}

export interface Sub2APIReferralStats {
  total_count: number;
  rewarded_count: number;
  pending_count: number;
  total_balance_earn: number;
}

export interface Sub2APIReferralRewards {
  enabled: boolean;
  referrer_balance_reward: number;
  referee_balance_reward: number;
  referrer_subscription_days: number;
  referee_subscription_days: number;
}

export interface Sub2APIReferralInfo {
  referral_code: string;
  referral_link: string;
  stats: Sub2APIReferralStats;
  rewards: Sub2APIReferralRewards | null;
}

export interface Sub2APIUserReferral {
  id: number;
  referrer_id: number;
  referee_id: number;
  referee_username: string;
  status: string;
  referrer_balance_reward: number;
  referee_balance_reward: number;
  referrer_rewarded_at: string | null;
  referee_rewarded_at: string | null;
  created_at: string;
}

export interface Sub2APIRedeemResult {
  message: string;
  type: string;
  value: number;
  new_balance?: number;
  new_concurrency?: number;
}

export interface Sub2APICreateKeyRequest {
  name: string;
  group_id?: number | null;
}

/** Subset of user API key update fields (see backend UpdateAPIKeyRequest). */
export interface Sub2APIUpdateKeyRequest {
  name: string;
  group_id: number;
}

export interface Sub2APIClient {
  getMe: () => Promise<Sub2APIUser>;
  listKeys: (page?: number, pageSize?: number) => Promise<Sub2APIPaginatedData<Sub2APIKey>>;
  createKey: (input: Sub2APICreateKeyRequest) => Promise<Sub2APIKey>;
  updateKey: (id: number, input: Sub2APIUpdateKeyRequest) => Promise<Sub2APIKey>;
  deleteKey: (id: number) => Promise<void>;
  getAvailableGroups: () => Promise<Sub2APIGroup[]>;
  getModelCatalog: () => Promise<Sub2APIModelCatalog>;
  getUsageStats: (query: Sub2APIUsagePeriod | Sub2APIUsageStatsQuery) => Promise<Sub2APIUsageStats>;
  getGroupStatuses: () => Promise<Sub2APIGroupStatusItem[]>;
  getReferralInfo: () => Promise<Sub2APIReferralInfo>;
  getReferralHistory: (
    page?: number,
    pageSize?: number,
  ) => Promise<Sub2APIPaginatedData<Sub2APIUserReferral>>;
  redeemCode: (code: string) => Promise<Sub2APIRedeemResult>;
}

export class Sub2APIClientError extends Error {
  readonly status: number;
  readonly code?: number;
  readonly reason?: string;
  readonly metadata?: Record<string, string>;

  constructor(
    message: string,
    options: {
      status: number;
      code?: number;
      reason?: string;
      metadata?: Record<string, string>;
    },
  ) {
    super(message);
    this.name = "CloudClientError";
    this.status = options.status;
    this.code = options.code;
    this.reason = options.reason;
    this.metadata = options.metadata;
  }
}

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeSub2APIEndpoint(endpoint: string): string {
  const trimmed = trimToNull(endpoint);
  if (!trimmed) {
    throw new Error("Service endpoint is required.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Endpoint must be an absolute URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Endpoint must use http or https.");
  }
  if (!trimToNull(parsed.host)) {
    throw new Error("Endpoint is missing a host.");
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.protocol}//${parsed.host}${normalizedPath}`;
}

export function isValidSub2APIEndpoint(endpoint: string): boolean {
  try {
    normalizeSub2APIEndpoint(endpoint);
    return true;
  } catch {
    return false;
  }
}

function isEnvelope(value: unknown): value is Sub2APIEnvelope<unknown> {
  return typeof value === "object" && value !== null && "code" in value && "message" in value;
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function createSub2APIClient(input: {
  endpoint: string;
  getAccessToken: () => Promise<string | null>;
}): Sub2APIClient {
  const baseUrl = normalizeSub2APIEndpoint(input.endpoint);

  function buildUsageStatsPath(query: Sub2APIUsagePeriod | Sub2APIUsageStatsQuery): string {
    const normalized =
      typeof query === "string" ? ({ period: query } satisfies Sub2APIUsageStatsQuery) : query;
    const searchParams = new URLSearchParams();

    const period = normalized.period ?? "today";
    searchParams.set("period", period);

    if (typeof normalized.apiKeyId === "number" && Number.isFinite(normalized.apiKeyId)) {
      searchParams.set("api_key_id", String(normalized.apiKeyId));
    }
    const timezone = trimToNull(normalized.timezone);
    if (timezone) {
      searchParams.set("timezone", timezone);
    }
    const startDate = trimToNull(normalized.startDate);
    if (startDate) {
      searchParams.set("start_date", startDate);
    }
    const endDate = trimToNull(normalized.endDate);
    if (endDate) {
      searchParams.set("end_date", endDate);
    }

    return `/usage/stats?${searchParams.toString()}`;
  }

  async function request<T>(
    path: string,
    init?: {
      method?: "GET" | "POST" | "PUT" | "DELETE";
      body?: unknown;
    },
  ): Promise<T> {
    const accessToken = await input.getAccessToken();
    if (!accessToken) {
      throw new Sub2APIClientError("Session is not available.", { status: 401 });
    }

    const url = `${baseUrl}/api/v1${path}`;
    const response = await fetch(url, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });

    const payload = await parseJsonSafe(response);
    if (!response.ok) {
      if (isEnvelope(payload)) {
        throw new Sub2APIClientError(payload.message, {
          status: response.status,
          code: payload.code,
          reason: payload.reason,
          metadata: payload.metadata,
        });
      }
      throw new Sub2APIClientError(`Request failed with status ${response.status}.`, {
        status: response.status,
      });
    }

    if (!isEnvelope(payload)) {
      throw new Sub2APIClientError("Server returned an invalid response payload.", {
        status: response.status,
      });
    }
    if (payload.code !== 0) {
      throw new Sub2APIClientError(payload.message, {
        status: response.status,
        code: payload.code,
        reason: payload.reason,
        metadata: payload.metadata,
      });
    }
    return payload.data as T;
  }

  return {
    async getMe() {
      return await request<Sub2APIUser>("/auth/me");
    },
    async listKeys(page = 1, pageSize = 50) {
      return await request<Sub2APIPaginatedData<Sub2APIKey>>(
        `/keys?page=${encodeURIComponent(String(page))}&page_size=${encodeURIComponent(String(pageSize))}`,
      );
    },
    async createKey(payload) {
      return await request<Sub2APIKey>("/keys", {
        method: "POST",
        body: {
          name: payload.name,
          ...(payload.group_id !== undefined ? { group_id: payload.group_id } : {}),
        },
      });
    },
    async updateKey(id, payload) {
      return await request<Sub2APIKey>(`/keys/${encodeURIComponent(String(id))}`, {
        method: "PUT",
        body: {
          name: payload.name,
          group_id: payload.group_id,
        },
      });
    },
    async deleteKey(id) {
      await request<{ message: string }>(`/keys/${encodeURIComponent(String(id))}`, {
        method: "DELETE",
      });
    },
    async getAvailableGroups() {
      return await request<Sub2APIGroup[]>("/groups/available");
    },
    async getModelCatalog() {
      return await request<Sub2APIModelCatalog>("/models/catalog");
    },
    async getUsageStats(query) {
      return await request<Sub2APIUsageStats>(buildUsageStatsPath(query));
    },
    async getGroupStatuses() {
      return await request<Sub2APIGroupStatusItem[]>("/group-status");
    },
    async getReferralInfo() {
      return await request<Sub2APIReferralInfo>("/referral/info");
    },
    async getReferralHistory(page = 1, pageSize = 20) {
      return await request<Sub2APIPaginatedData<Sub2APIUserReferral>>(
        `/referral/history?page=${encodeURIComponent(String(page))}&page_size=${encodeURIComponent(String(pageSize))}`,
      );
    },
    async redeemCode(code) {
      return await request<Sub2APIRedeemResult>("/redeem", {
        method: "POST",
        body: { code },
      });
    },
  };
}
