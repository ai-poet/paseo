export interface Sub2APIAuthCallback {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  apiKey: string;
  endpoint: string;
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, "");
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
