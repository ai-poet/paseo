export interface AppBrandingEnv {
  [key: string]: string | undefined;
}

export interface ResolvedBranding {
  appName: string;
  developmentAppName: string;
  cloudName: string;
  expoIcon: string;
  expoAndroidForegroundIcon: string;
  expoSplashIcon: string;
  expoNotificationIcon: string;
  webFavicon: string;
}

export function resolveBrandingFromEnv(env?: AppBrandingEnv): ResolvedBranding;
