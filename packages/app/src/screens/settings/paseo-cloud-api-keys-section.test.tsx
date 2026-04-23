/**
 * @vitest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaseoCloudApiKeysSection } from "./paseo-cloud-api-keys-section";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    loadProviders: vi.fn(),
    createKey: vi.fn(),
    updateKey: vi.fn(),
    deleteKey: vi.fn(),
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

vi.mock("@/desktop/electron/invoke", () => ({
  invokeDesktopCommand: vi.fn(),
}));

vi.mock("@/screens/settings/settings-section", () => ({
  SettingsSection: ({ title, children }: any) =>
    React.createElement("section", null, React.createElement("h2", null, title), children),
}));

vi.mock("@/components/ui/segmented-control", () => ({
  SegmentedControl: ({ options, value, onValueChange, testID }: any) => (
    <div data-testid={testID}>
      {options.map((option: any) => (
        <button
          key={option.value}
          data-testid={option.testID}
          data-selected={option.value === value}
          onClick={() => onValueChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("@/components/agent-form/agent-form-dropdowns", () => ({
  ComboSelect: ({ label, value, options, onSelect, testID }: any) =>
    React.createElement(
      "label",
      null,
      React.createElement("span", null, label),
      React.createElement(
        "select",
        {
          "data-testid": testID,
          value,
          onChange: (event: any) => onSelect(event.target.value),
        },
        options.map((option: any) =>
          React.createElement("option", { key: option.id, value: option.id }, option.label),
        ),
      ),
    ),
}));

vi.mock("@/components/adaptive-modal-sheet", () => ({
  AdaptiveModalSheet: ({ title, visible, children }: any) =>
    visible ? (
      <div>
        <h3>{title}</h3>
        {children}
      </div>
    ) : null,
  AdaptiveTextInput: ({ value, onChangeText, placeholder }: any) => (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChangeText(event.target.value)}
    />
  ),
}));

vi.mock("@/screens/settings/desktop-providers-context", () => ({
  useDesktopProvidersStore: () => ({
    loadProviders: mocks.loadProviders,
    activeClaudeProvider: { apiKey: "sk-claude" },
    activeCodexProvider: { apiKey: "sk-codex" },
  }),
}));

vi.mock("@/hooks/use-sub2api-api", () => ({
  useSub2APIKeys: () => ({
    data: {
      items: [
        {
          id: 1,
          name: "Claude Key",
          key: "sk-claude",
          group_id: 11,
          quota_used: 1,
          group: { id: 11, name: "Anthropic Group", platform: "anthropic" },
        },
        {
          id: 2,
          name: "Codex Key",
          key: "sk-codex",
          group_id: 22,
          quota_used: 2,
          group: { id: 22, name: "OpenAI Group", platform: "openai" },
        },
      ],
    },
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  useSub2APIAvailableGroups: () => ({
    data: [
      { id: 11, name: "Anthropic Group", platform: "anthropic", rate_multiplier: 1 },
      { id: 22, name: "OpenAI Group", platform: "openai", rate_multiplier: 1.5 },
    ],
    isFetching: false,
    error: null,
  }),
  useCreateSub2APIKeyMutation: () => ({
    isPending: false,
    mutateAsync: mocks.createKey,
  }),
  useUpdateSub2APIKeyMutation: () => ({
    isPending: false,
    mutateAsync: mocks.updateKey,
  }),
  useDeleteSub2APIKeyMutation: () => ({
    mutateAsync: mocks.deleteKey,
  }),
}));

describe("PaseoCloudApiKeysSection", () => {
  beforeEach(() => {
    mocks.loadProviders.mockReset();
    mocks.createKey.mockReset();
    mocks.updateKey.mockReset();
    mocks.deleteKey.mockReset();
  });

  it("filters keys by CLI tab and opens create in a modal instead of inline", () => {
    render(
      <PaseoCloudApiKeysSection
        authEndpoint="https://api.example.com"
        serviceEndpoint="https://api.example.com"
      />,
    );

    expect(screen.queryByText("Claude Key")).not.toBeNull();
    expect(screen.queryByText("Codex Key")).toBeNull();
    expect(screen.queryByText("Create API key")).not.toBeNull();
    expect(screen.queryByText("Routing group")).toBeNull();

    fireEvent.click(screen.getByTestId("sub2api-api-keys-tab-codex"));
    expect(screen.queryByText("Codex Key")).not.toBeNull();
    expect(screen.queryByText("Claude Key")).toBeNull();

    fireEvent.click(screen.getByTestId("sub2api-open-create-key-modal"));
    expect(screen.getAllByText("Create API key").length).toBeGreaterThan(1);
    expect(screen.queryByText("Group")).not.toBeNull();
  });
});
