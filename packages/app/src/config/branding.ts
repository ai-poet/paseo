import Constants from "expo-constants";

export interface AppBranding {
  appName: string;
  cloudName: string;
}

const DEFAULT_BRANDING: AppBranding = {
  appName: "Paseo",
  cloudName: "Paseo Cloud",
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

export function getAppBranding(): AppBranding {
  const brand = getManifestExtraBrand();
  const appName = trimToNull(brand?.appName) ?? DEFAULT_BRANDING.appName;
  return {
    appName,
    cloudName: trimToNull(brand?.cloudName) ?? `${appName} Cloud`,
  };
}

export const APP_BRANDING = getAppBranding();
export const APP_NAME = APP_BRANDING.appName;
export const CLOUD_NAME = APP_BRANDING.cloudName;
export const DESKTOP_DEFAULT_KEY_NAME = `${APP_NAME} Desktop`;
