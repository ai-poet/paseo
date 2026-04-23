import { normalizeSub2APIEndpoint } from "@/lib/sub2api-client";

type PayCenterUrlOptions = {
  lang?: string;
  theme?: "light" | "dark";
  uiMode?: "embedded" | "standalone";
};

const DEFAULT_PAY_LANG = "zh";

export function buildPayCenterUrl(
  endpoint: string,
  accessToken: string,
  options?: PayCenterUrlOptions,
): string {
  const base = normalizeSub2APIEndpoint(endpoint);
  const lang = options?.lang ?? DEFAULT_PAY_LANG;
  const theme = options?.theme ?? "dark";
  const uiMode = options?.uiMode ?? "embedded";
  return `${base}/pay?token=${encodeURIComponent(accessToken)}&theme=${encodeURIComponent(theme)}&ui_mode=${encodeURIComponent(uiMode)}&lang=${encodeURIComponent(lang)}`;
}

export function buildPayCenterApiUrl(endpoint: string, pathWithQuery: string): string {
  const base = normalizeSub2APIEndpoint(endpoint);
  const normalizedPath = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  return `${base}/pay${normalizedPath}`;
}

export function buildPayCenterOrderStatusUrl(
  endpoint: string,
  orderId: string,
  accessToken?: string | null,
): string {
  const query = new URLSearchParams();
  if (accessToken) {
    query.set("access_token", accessToken);
  }
  const suffix = query.toString();
  return buildPayCenterApiUrl(
    endpoint,
    suffix ? `/api/orders/${orderId}?${suffix}` : `/api/orders/${orderId}`,
  );
}

export function buildPayCenterStripePopupUrl(input: {
  endpoint: string;
  orderId: string;
  amount: number;
  accessToken?: string | null;
  method?: string | null;
  lang?: string;
  theme?: "light" | "dark";
}): string {
  const base = normalizeSub2APIEndpoint(input.endpoint);
  const url = new URL(`${base}/pay/stripe-popup`);
  url.searchParams.set("order_id", input.orderId);
  url.searchParams.set("amount", String(input.amount));
  url.searchParams.set("theme", input.theme ?? "dark");
  if (input.accessToken) {
    url.searchParams.set("access_token", input.accessToken);
  }
  if (input.method) {
    url.searchParams.set("method", input.method);
  }
  url.searchParams.set("lang", input.lang ?? DEFAULT_PAY_LANG);
  return url.toString();
}
