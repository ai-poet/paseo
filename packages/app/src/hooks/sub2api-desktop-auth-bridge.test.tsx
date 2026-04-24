/**
 * @vitest-environment jsdom
 */
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Sub2apiDesktopAuthBridge } from "./sub2api-desktop-auth-bridge";

type AuthCallbackListener = (payload: { url: string }) => void;

const { mocks } = vi.hoisted(() => {
  let listener: AuthCallbackListener | null = null;
  return {
    mocks: {
      login: vi.fn(),
      invokeDesktopCommand: vi.fn(),
      setListener(next: AuthCallbackListener | null) {
        listener = next;
      },
      getListener() {
        return listener;
      },
    },
  };
});

vi.mock("@/constants/platform", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/constants/platform")>();
  return {
    ...actual,
    getIsElectron: () => true,
  };
});

vi.mock("@/hooks/use-sub2api-auth", () => ({
  useSub2APIAuth: () => ({
    auth: null,
    isLoggedIn: false,
    isLoading: false,
    login: mocks.login,
    logout: vi.fn(),
    getAccessToken: vi.fn(),
  }),
}));

vi.mock("@/desktop/electron/invoke", () => ({
  invokeDesktopCommand: (...args: unknown[]) => mocks.invokeDesktopCommand(...args),
}));

vi.mock("@/desktop/host", () => ({
  getDesktopHost: () => ({
    events: {
      on: async (_event: string, cb: AuthCallbackListener) => {
        mocks.setListener(cb);
        return () => mocks.setListener(null);
      },
    },
    getPendingAuthCallback: async () => null,
  }),
}));

describe("Sub2apiDesktopAuthBridge", () => {
  beforeEach(() => {
    mocks.login.mockReset();
    mocks.invokeDesktopCommand.mockReset();
    mocks.invokeDesktopCommand.mockImplementation(async (command: string) => {
      if (command === "get_providers") {
        return {
          providers: [],
          activeProviderId: null,
          activeClaudeProviderId: null,
          activeCodexProviderId: null,
        };
      }
      return null;
    });
    mocks.setListener(null);
  });

  it("persists auth and auto-configures missing scoped routes from the Electron auth-callback", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <Sub2apiDesktopAuthBridge />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(mocks.getListener()).not.toBeNull();
    });

    const callbackUrl =
      "https://desktop.example/auth/paseo#access_token=at&refresh_token=rt&api_key=sk-live&claude_api_key=sk-claude&codex_api_key=sk-codex&endpoint=https%3A%2F%2Fapi.example.com&expires_in=3600";

    mocks.getListener()?.({ url: callbackUrl });

    await waitFor(() => {
      expect(mocks.login).toHaveBeenCalledWith({
        accessToken: "at",
        refreshToken: "rt",
        expiresIn: 3600,
        endpoint: "https://api.example.com",
      });
    });

    await waitFor(() => {
      expect(mocks.invokeDesktopCommand).toHaveBeenCalledWith("setup_default_provider", {
        endpoint: "https://api.example.com",
        apiKey: "sk-claude",
        scope: "claude",
        name: "Paseo Cloud",
      });
      expect(mocks.invokeDesktopCommand).toHaveBeenCalledWith("setup_default_provider", {
        endpoint: "https://api.example.com",
        apiKey: "sk-codex",
        scope: "codex",
        name: "Paseo Cloud",
      });
    });
  });
});
