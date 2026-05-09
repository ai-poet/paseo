import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rootPackageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const script = readFileSync(new URL("./run-with-cheaprouter-brand.mjs", import.meta.url), "utf8");

describe("CheapRouter brand script", () => {
  it("is exposed from root package scripts", () => {
    expect(rootPackageJson.scripts["with:cheaprouter"]).toBe(
      "node scripts/run-with-cheaprouter-brand.mjs",
    );
    expect(rootPackageJson.scripts["build:desktop:cheaprouter"]).toBe(
      "node scripts/run-with-cheaprouter-brand.mjs npm run build:desktop",
    );
  });

  it("sets CheapRouter app, icon, desktop, and cloud endpoint environment", () => {
    expect(script).toContain('PASEO_APP_NAME: "CheapRouter"');
    expect(script).toContain('PASEO_CLOUD_NAME: "CheapRouter"');
    expect(script).toContain('PASEO_LOGO_VARIANT: "cheaprouter"');
    expect(script).toContain('EXPO_PUBLIC_MANAGED_SERVICE_URL: "https://cheaprouter.org"');
    expect(script).toContain('PASEO_EXPO_ICON: "./assets/images/cheaprouter-icon.png"');
    expect(script).toContain('PASEO_WEB_FAVICON: "./assets/images/cheaprouter-icon.png"');
    expect(script).toContain('PASEO_DESKTOP_APP_ID: "org.cheaprouter.desktop"');
    expect(script).toContain('PASEO_DESKTOP_ICON_PNG: "assets/cheaprouter-icon.png"');
    expect(script).toContain('PASEO_DESKTOP_ICON_MAC: "assets/cheaprouter-icon.icns"');
    expect(script).toContain('PASEO_DESKTOP_ICON_WIN: "assets/cheaprouter-icon.ico"');
    expect(script).toContain('PASEO_DESKTOP_ICON_LINUX: "assets/cheaprouter"');
  });
});
