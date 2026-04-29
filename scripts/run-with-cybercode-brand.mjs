#!/usr/bin/env node
import { spawn } from "node:child_process";

const [, , ...args] = process.argv;

if (args.length === 0) {
  console.error("Usage: npm run with:cybercode -- <command> [...args]");
  process.exit(1);
}

const cybercodeEnv = {
  PASEO_APP_NAME: "CyberCode",
  PASEO_APP_NAME_DEVELOPMENT: "CyberCode",
  PASEO_CLOUD_NAME: "CyberCode Cloud",
  PASEO_EXPO_ICON: "./assets/images/cybercode-icon.png",
  PASEO_EXPO_ANDROID_FOREGROUND_ICON: "./assets/images/cybercode-android-icon-foreground.png",
  PASEO_EXPO_SPLASH_ICON: "./assets/images/cybercode-splash-icon.png",
  PASEO_EXPO_NOTIFICATION_ICON: "./assets/images/cybercode-notification-icon.png",
  PASEO_WEB_FAVICON: "./assets/images/cybercode-favicon.png",
  PASEO_DESKTOP_ICON_PNG: "assets/cybercode-icon.png",
  PASEO_DESKTOP_ICON_MAC: "assets/cybercode-icon.icns",
  PASEO_DESKTOP_ICON_WIN: "assets/cybercode-icon.ico",
  PASEO_DESKTOP_ICON_LINUX: "assets/cybercode",
};

const [command, ...commandArgs] = args;
const child = spawn(command, commandArgs, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    ...cybercodeEnv,
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
