import { describe, expect, it } from "vitest";
import { resolveBrandingFromEnv } from "../../branding.config.cjs";

describe("resolveBrandingFromEnv", () => {
  it("keeps Paseo defaults when brand env vars are unset", () => {
    expect(resolveBrandingFromEnv({})).toEqual({
      appName: "Paseo",
      developmentAppName: "Paseo Debug",
      cloudName: "Paseo Cloud",
      expoIcon: "./assets/images/icon.png",
      expoAndroidForegroundIcon: "./assets/images/android-icon-foreground.png",
      expoSplashIcon: "./assets/images/splash-icon.png",
      expoNotificationIcon: "./assets/images/notification-icon.png",
      webFavicon: "./assets/images/favicon.png",
    });
  });

  it("trims and applies brand env var overrides", () => {
    expect(
      resolveBrandingFromEnv({
        PASEO_APP_NAME: "  cheapRouter  ",
        PASEO_APP_NAME_DEVELOPMENT: " cheapRouter Dev ",
        PASEO_CLOUD_NAME: " cheapRouter Cloud ",
        PASEO_EXPO_ICON: " ./brand/icon.png ",
      }),
    ).toMatchObject({
      appName: "cheapRouter",
      developmentAppName: "cheapRouter Dev",
      cloudName: "cheapRouter Cloud",
      expoIcon: "./brand/icon.png",
    });
  });
});
