#!/usr/bin/env node
import { spawn } from "node:child_process";

const [, , ...args] = process.argv;

if (args.length === 0) {
  console.error("Usage: npm run with:cheaprouter -- <command> [...args]");
  process.exit(1);
}

const cheapRouterEnv = {
  PASEO_APP_NAME: "CheapRouter",
  PASEO_APP_NAME_DEVELOPMENT: "CheapRouter",
  PASEO_CLOUD_NAME: "CheapRouter",
  PASEO_LOGO_VARIANT: "cheaprouter",
  EXPO_PUBLIC_PASEO_APP_NAME: "CheapRouter",
  EXPO_PUBLIC_PASEO_CLOUD_NAME: "CheapRouter",
  EXPO_PUBLIC_PASEO_LOGO_VARIANT: "cheaprouter",
  EXPO_PUBLIC_MANAGED_SERVICE_URL: "https://cheaprouter.org",
  PASEO_EXPO_ICON: "./assets/images/cheaprouter-icon.png",
  PASEO_EXPO_ANDROID_FOREGROUND_ICON: "./assets/images/cheaprouter-icon.png",
  PASEO_EXPO_SPLASH_ICON: "./assets/images/cheaprouter-icon.png",
  PASEO_EXPO_NOTIFICATION_ICON: "./assets/images/cheaprouter-icon.png",
  PASEO_WEB_FAVICON: "./assets/images/cheaprouter-icon.png",
  PASEO_DESKTOP_APP_ID: "org.cheaprouter.desktop",
  PASEO_DESKTOP_ICON_PNG: "assets/cheaprouter-icon.png",
  PASEO_DESKTOP_ICON_MAC: "assets/cheaprouter-icon.icns",
  PASEO_DESKTOP_ICON_WIN: "assets/cheaprouter-icon.ico",
  PASEO_DESKTOP_ICON_LINUX: "assets/cheaprouter",
};

const [command, ...commandArgs] = args;
const child = spawn(command, commandArgs, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    ...cheapRouterEnv,
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
