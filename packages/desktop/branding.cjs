function trimToNull(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveDesktopBrandingFromEnv(env = process.env) {
  const appName = trimToNull(env.PASEO_APP_NAME) ?? "Paseo";
  return {
    appName,
    desktopIconPng: trimToNull(env.PASEO_DESKTOP_ICON_PNG) ?? "assets/icon.png",
    desktopIconMac: trimToNull(env.PASEO_DESKTOP_ICON_MAC) ?? "assets/icon.icns",
    desktopIconWin: trimToNull(env.PASEO_DESKTOP_ICON_WIN) ?? "assets/icon.ico",
    desktopIconLinux: trimToNull(env.PASEO_DESKTOP_ICON_LINUX) ?? "assets",
  };
}

module.exports = {
  resolveDesktopBrandingFromEnv,
};
