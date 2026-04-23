/**
 * Maps platform strings to theme-aware colors for badges, dots, and accents.
 * React Native equivalent of sub2apipay's platform-style.ts.
 */

export interface PlatformColors {
  label: string;
  badge: { bg: string; text: string; border: string };
  dot: string;
  accent: string;
}

const COLORS: Record<string, Omit<PlatformColors, "label"> & { label: string }> = {
  claude: {
    label: "Claude",
    badge: { bg: "rgba(249,115,22,0.1)", text: "#ea580c", border: "rgba(249,115,22,0.3)" },
    dot: "#f97316",
    accent: "#ea580c",
  },
  anthropic: {
    label: "Anthropic",
    badge: { bg: "rgba(249,115,22,0.1)", text: "#ea580c", border: "rgba(249,115,22,0.3)" },
    dot: "#f97316",
    accent: "#ea580c",
  },
  openai: {
    label: "OpenAI",
    badge: { bg: "rgba(34,197,94,0.1)", text: "#16a34a", border: "rgba(34,197,94,0.3)" },
    dot: "#22c55e",
    accent: "#16a34a",
  },
  codex: {
    label: "Codex",
    badge: { bg: "rgba(34,197,94,0.1)", text: "#16a34a", border: "rgba(34,197,94,0.3)" },
    dot: "#22c55e",
    accent: "#16a34a",
  },
  gemini: {
    label: "Gemini",
    badge: { bg: "rgba(59,130,246,0.1)", text: "#2563eb", border: "rgba(59,130,246,0.3)" },
    dot: "#3b82f6",
    accent: "#2563eb",
  },
  google: {
    label: "Google",
    badge: { bg: "rgba(59,130,246,0.1)", text: "#2563eb", border: "rgba(59,130,246,0.3)" },
    dot: "#3b82f6",
    accent: "#2563eb",
  },
  sora: {
    label: "Sora",
    badge: { bg: "rgba(236,72,153,0.1)", text: "#db2777", border: "rgba(236,72,153,0.3)" },
    dot: "#ec4899",
    accent: "#db2777",
  },
  antigravity: {
    label: "Antigravity",
    badge: { bg: "rgba(168,85,247,0.1)", text: "#9333ea", border: "rgba(168,85,247,0.3)" },
    dot: "#a855f7",
    accent: "#9333ea",
  },
};

const FALLBACK: Omit<PlatformColors, "label"> = {
  badge: { bg: "rgba(100,116,139,0.1)", text: "#475569", border: "rgba(100,116,139,0.3)" },
  dot: "#64748b",
  accent: "#475569",
};

export function getPlatformColors(platform: string): PlatformColors {
  const key = platform.toLowerCase();
  const entry = COLORS[key];
  if (entry) return entry;
  return { ...FALLBACK, label: platform };
}

/** Status color mapping for group runtime status. */
export function getStatusColor(status: string): string {
  switch (status) {
    case "up":
      return "#22c55e";
    case "degraded":
      return "#f59e0b";
    case "down":
      return "#ef4444";
    default:
      return "#94a3b8";
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case "up":
      return "Online";
    case "degraded":
      return "Degraded";
    case "down":
      return "Offline";
    default:
      return "Unknown";
  }
}
