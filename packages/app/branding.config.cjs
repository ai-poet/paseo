function trimToNull(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveBrandingFromEnv(env = process.env) {
  const appName = trimToNull(env.PASEO_APP_NAME) ?? "Paseo";
  return {
    appName,
    developmentAppName: trimToNull(env.PASEO_APP_NAME_DEVELOPMENT) ?? `${appName} Debug`,
    cloudName: trimToNull(env.PASEO_CLOUD_NAME) ?? `${appName} Cloud`,
    logoVariant: trimToNull(env.PASEO_LOGO_VARIANT) ?? "paseo",
    expoIcon: trimToNull(env.PASEO_EXPO_ICON) ?? "./assets/images/icon.png",
    expoAndroidForegroundIcon:
      trimToNull(env.PASEO_EXPO_ANDROID_FOREGROUND_ICON) ??
      "./assets/images/android-icon-foreground.png",
    expoSplashIcon: trimToNull(env.PASEO_EXPO_SPLASH_ICON) ?? "./assets/images/splash-icon.png",
    expoNotificationIcon:
      trimToNull(env.PASEO_EXPO_NOTIFICATION_ICON) ?? "./assets/images/notification-icon.png",
    webFavicon: trimToNull(env.PASEO_WEB_FAVICON) ?? "./assets/images/favicon.png",
  };
}

module.exports = {
  resolveBrandingFromEnv,
};
