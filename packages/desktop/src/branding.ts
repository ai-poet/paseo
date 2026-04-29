export interface DesktopBranding {
  appName: string;
  desktopIconPng: string;
  desktopIconMac: string;
  desktopIconWin: string;
  desktopIconLinux: string;
}

function trimToNull(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getDesktopBranding(): DesktopBranding {
  const appName = trimToNull(process.env.PASEO_APP_NAME) ?? "Paseo";
  return {
    appName,
    desktopIconPng: trimToNull(process.env.PASEO_DESKTOP_ICON_PNG) ?? "assets/icon.png",
    desktopIconMac: trimToNull(process.env.PASEO_DESKTOP_ICON_MAC) ?? "assets/icon.icns",
    desktopIconWin: trimToNull(process.env.PASEO_DESKTOP_ICON_WIN) ?? "assets/icon.ico",
    desktopIconLinux: trimToNull(process.env.PASEO_DESKTOP_ICON_LINUX) ?? "assets",
  };
}
