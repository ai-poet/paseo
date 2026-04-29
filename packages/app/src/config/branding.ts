import Constants from "expo-constants";

export interface AppBranding {
  appName: string;
  cloudName: string;
  logoVariant: "paseo" | "cybercode";
}

const DEFAULT_BRANDING: AppBranding = {
  appName: "Paseo",
  cloudName: "Paseo Cloud",
  logoVariant: "paseo",
};

function getManifestExtraBrand(): Partial<AppBranding> | null {
  const expoConfigBrand = Constants.expoConfig?.extra?.brand;
  if (expoConfigBrand && typeof expoConfigBrand === "object") {
    return expoConfigBrand as Partial<AppBranding>;
  }

  const legacyManifest = Constants.manifest as
    | { extra?: { brand?: Partial<AppBranding> } }
    | null
    | undefined;
  return legacyManifest?.extra?.brand ?? null;
}

function trimToNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeLogoVariant(value: unknown): AppBranding["logoVariant"] | null {
  const normalized = trimToNull(value)?.toLowerCase();
  if (normalized === "cybercode") {
    return "cybercode";
  }
  if (normalized === "paseo") {
    return "paseo";
  }
  return null;
}

function getRuntimeEnvBrand(): Partial<AppBranding> {
  const env = typeof process !== "undefined" ? process.env : undefined;
  return {
    appName: trimToNull(env?.EXPO_PUBLIC_PASEO_APP_NAME) ?? undefined,
    cloudName: trimToNull(env?.EXPO_PUBLIC_PASEO_CLOUD_NAME) ?? undefined,
    logoVariant: normalizeLogoVariant(env?.EXPO_PUBLIC_PASEO_LOGO_VARIANT) ?? undefined,
  };
}

export function getAppBranding(): AppBranding {
  const runtimeBrand = getRuntimeEnvBrand();
  const manifestBrand = getManifestExtraBrand();
  const appName =
    trimToNull(runtimeBrand.appName) ??
    trimToNull(manifestBrand?.appName) ??
    DEFAULT_BRANDING.appName;
  return {
    appName,
    cloudName:
      trimToNull(runtimeBrand.cloudName) ??
      trimToNull(manifestBrand?.cloudName) ??
      `${appName} Cloud`,
    logoVariant:
      normalizeLogoVariant(runtimeBrand.logoVariant) ??
      normalizeLogoVariant(manifestBrand?.logoVariant) ??
      DEFAULT_BRANDING.logoVariant,
  };
}

export const APP_BRANDING = getAppBranding();
export const APP_NAME = APP_BRANDING.appName;
export const CLOUD_NAME = APP_BRANDING.cloudName;
export const DESKTOP_DEFAULT_KEY_NAME = `${APP_NAME} Desktop`;
