/**
 * @vitest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaseoCloudPanel } from "./paseo-cloud-panel";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    getAccessToken: vi.fn(),
    loadProviders: vi.fn(),
    handleGitHubLogin: vi.fn(),
    logout: vi.fn(),
  },
}));

const { theme } = vi.hoisted(() => ({
  theme: {
    colors: {
      foreground: "#111",
      foregroundMuted: "#666",
      border: "#ddd",
      surface0: "#fff",
      surface1: "#fafafa",
      surface2: "#f0f0f0",
      accent: "#2563eb",
      accentForeground: "#fff",
      destructive: "#dc2626",
      palette: {
        green: { 400: "#22c55e" },
        white: "#fff",
      },
    },
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24 },
    borderRadius: { md: 8, lg: 12, xl: 16 },
    fontSize: { xs: 12, sm: 14, base: 16, lg: 20 },
    fontWeight: { normal: "400", medium: "600" },
    opacity: { 50: 0.5 },
    iconSize: { sm: 16, md: 20, lg: 24 },
  },
}));

vi.mock("react-native-unistyles", () => ({
  useUnistyles: () => ({ theme, rt: { breakpoint: "lg" } }),
  StyleSheet: {
    create: (factory: any) => factory(theme),
    absoluteFillObject: {},
  },
}));

vi.mock("@/constants/layout", () => ({
  useIsCompactFormFactor: () => false,
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/hooks/use-settings", () => ({
  useAppSettings: () => ({
    settings: {
      accessMode: "byok",
    },
  }),
}));

vi.mock("@/hooks/use-sub2api-auth", () => ({
  useSub2APIAuth: () => ({
    getAccessToken: mocks.getAccessToken,
  }),
}));

vi.mock("@/hooks/use-sub2api-login-flow", () => ({
  useSub2APILoginFlow: () => ({
    endpoint: "https://api.example.com",
    canStartLogin: true,
    isLoggedIn: true,
    auth: { endpoint: "https://api.example.com" },
    handleGitHubLogin: mocks.handleGitHubLogin,
    logout: mocks.logout,
  }),
}));

vi.mock("@/hooks/use-sub2api-api", () => ({
  useSub2APIMe: () => ({
    data: { balance: 12.34, username: "alice" },
    isPending: false,
    isFetching: false,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useSub2APIUsageStats: () => ({
    data: { total_cost: 1.23, total_requests: 5 },
    refetch: vi.fn(),
  }),
}));

vi.mock("@/screens/settings/desktop-providers-context", () => ({
  useDesktopProvidersStore: () => ({
    loadProviders: mocks.loadProviders,
  }),
}));

vi.mock("@/screens/settings/settings-section", () => ({
  SettingsSection: ({ title, children }: any) =>
    React.createElement("section", null, React.createElement("h2", null, title), children),
}));

vi.mock("@/screens/settings/paseo-cloud-api-keys-section", () => ({
  PaseoCloudApiKeysSection: () => React.createElement("div", null, "API keys section content"),
}));

vi.mock("@/screens/settings/paseo-cloud-routing-section", () => ({
  PaseoCloudRoutingSection: () => React.createElement("div", null, "Routing section content"),
}));

vi.mock("@/screens/settings/sub2api-models-section", () => ({
  Sub2APIModelsSection: () => React.createElement("div", null, "Model catalog section content"),
}));

vi.mock("@/screens/settings/sub2api-pay-modal", () => ({
  Sub2APIPayModal: () => null,
}));

describe("PaseoCloudPanel", () => {
  beforeEach(() => {
    mocks.getAccessToken.mockReset();
    mocks.loadProviders.mockReset();
    mocks.handleGitHubLogin.mockReset();
    mocks.logout.mockReset();
  });

  it("switches between internal Paseo Cloud sections from the left menu", () => {
    render(<PaseoCloudPanel />);

    expect(screen.queryByText("Signed in as alice")).not.toBeNull();

    fireEvent.click(screen.getByTestId("paseo-cloud-section-keys"));
    expect(screen.queryByText("API keys section content")).not.toBeNull();

    fireEvent.click(screen.getByTestId("paseo-cloud-section-routing"));
    expect(screen.queryByText("Routing section content")).not.toBeNull();

    fireEvent.click(screen.getByTestId("paseo-cloud-section-catalog"));
    expect(screen.queryByText("Model catalog section content")).not.toBeNull();
  });
});
