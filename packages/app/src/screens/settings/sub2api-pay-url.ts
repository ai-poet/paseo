import { normalizeSub2APIEndpoint } from "@/lib/sub2api-client";

export function buildPayCenterUrl(endpoint: string, accessToken: string): string {
  const base = normalizeSub2APIEndpoint(endpoint);
  return `${base}/pay?token=${encodeURIComponent(accessToken)}&theme=dark&ui_mode=embedded&lang=en`;
}

export function buildPayApiUrl(endpoint: string, pathWithQuery: string): string {
  const base = normalizeSub2APIEndpoint(endpoint);
  const normalizedPath = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  return `${base}/pay${normalizedPath}`;
}
