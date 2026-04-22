export interface Sub2APIAuthCallback {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  apiKey: string;
  endpoint: string;
}

function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();
  if (!trimmed) {
    throw new Error("Sub2API endpoint is required.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Sub2API endpoint must be an absolute URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Sub2API endpoint must use http or https.");
  }
  if (!parsed.host.trim()) {
    throw new Error("Sub2API endpoint is missing a host.");
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.protocol}//${parsed.host}${normalizedPath}`;
}

export function isValidSub2APIEndpoint(endpoint: string): boolean {
  try {
    normalizeEndpoint(endpoint);
    return true;
  } catch {
    return false;
  }
}

export function buildSub2APILoginBridgeUrl(endpoint: string): string {
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  return `${normalizedEndpoint}/auth/paseo?endpoint=${encodeURIComponent(normalizedEndpoint)}`;
}

export function parseSub2APIAuthCallback(url: string): Sub2APIAuthCallback {
  const hash = new URL(url).hash.slice(1);
  const params = new URLSearchParams(hash);

  const accessToken = params.get("access_token")?.trim() ?? "";
  const refreshToken = params.get("refresh_token")?.trim() ?? "";
  const apiKey = params.get("api_key")?.trim() ?? "";
  const endpoint = normalizeEndpoint(params.get("endpoint")?.trim() ?? "");
  const expiresIn = Number.parseInt(params.get("expires_in") ?? "0", 10);

  if (
    !accessToken ||
    !refreshToken ||
    !apiKey ||
    !endpoint ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    throw new Error("OAuth callback did not include a complete Sub2API session.");
  }

  return {
    accessToken,
    refreshToken,
    expiresIn,
    apiKey,
    endpoint,
  };
}
