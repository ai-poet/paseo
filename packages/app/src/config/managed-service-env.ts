import { isValidSub2APIEndpoint } from "@/screens/settings/sub2api-auth-bridge";

/** Shipped default when `EXPO_PUBLIC_MANAGED_SERVICE_URL` is unset (override for staging via env). */
const DEFAULT_MANAGED_SERVICE_URL = "https://ai-coding.cyberspirit.io";

/**
 * Managed cloud service base URL: `EXPO_PUBLIC_MANAGED_SERVICE_URL` at bundle time, else default above.
 *
 * Staging example: `EXPO_PUBLIC_MANAGED_SERVICE_URL=https://staging.example.com npm run dev:desktop`
 */
export function getManagedServiceUrlFromEnv(): string {
  const raw = process.env.EXPO_PUBLIC_MANAGED_SERVICE_URL;
  const fromEnv = typeof raw === "string" ? raw.trim() : "";
  return fromEnv || DEFAULT_MANAGED_SERVICE_URL;
}

/**
 * `EXPO_PUBLIC_MANAGED_SERVICE_URL` was set at bundle time (non-empty).
 */
export function hasExplicitManagedServiceUrlEnv(): boolean {
  const raw = process.env.EXPO_PUBLIC_MANAGED_SERVICE_URL;
  return typeof raw === "string" && raw.trim().length > 0;
}

/**
 * Show the service URL text field only when there is no env override and no shipped default.
 */
export function shouldShowManagedServiceUrlEditor(): boolean {
  if (hasExplicitManagedServiceUrlEnv()) {
    return false;
  }
  return DEFAULT_MANAGED_SERVICE_URL.length === 0;
}

export function isManagedServiceUrlEnvValid(): boolean {
  return isValidSub2APIEndpoint(getManagedServiceUrlFromEnv());
}
