/**
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Sub2APIAuthState } from "@/hooks/use-sub2api-auth";
import { useSub2APILoginFlow } from "./use-sub2api-login-flow";

type AuthCallbackListener = (payload: { url: string }) => void;

const { mocks } = vi.hoisted(() => {
  let listener: AuthCallbackListener | null = null;
  return {
    mocks: {
      login: vi.fn(),
      logout: vi.fn(),
      openExternalUrl: vi.fn(),
      invokeDesktopCommand: vi.fn(),
      get auth() {
        return null as Sub2APIAuthState | null;
      },
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
    logout: mocks.logout,
    getAccessToken: vi.fn(),
  }),
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

vi.mock("@/utils/open-external-url", () => ({
  openExternalUrl: mocks.openExternalUrl,
}));

vi.mock("@/desktop/electron/invoke", () => ({
  invokeDesktopCommand: mocks.invokeDesktopCommand,
}));

describe("useSub2APILoginFlow", () => {
  beforeEach(() => {
    mocks.login.mockReset();
    mocks.logout.mockReset();
    mocks.openExternalUrl.mockReset();
    mocks.invokeDesktopCommand.mockReset();
    mocks.setListener(null);
  });

  it("persists auth from the callback without auto-writing device provider config", async () => {
    const onLoginSuccess = vi.fn();

    renderHook(() =>
      useSub2APILoginFlow({
        defaultEndpoint: "https://api.example.com",
        onLoginSuccess,
      }),
    );

    await waitFor(() => {
      expect(mocks.getListener()).not.toBeNull();
    });

    const callbackUrl =
      "https://desktop.example/auth/paseo#access_token=at&refresh_token=rt&api_key=sk-live&endpoint=https%3A%2F%2Fapi.example.com&expires_in=3600";

    mocks.getListener()?.({ url: callbackUrl });

    await waitFor(() => {
      expect(mocks.login).toHaveBeenCalledWith({
        accessToken: "at",
        refreshToken: "rt",
        expiresIn: 3600,
        endpoint: "https://api.example.com",
      });
    });

    expect(mocks.invokeDesktopCommand).not.toHaveBeenCalled();
    expect(onLoginSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "at",
        refreshToken: "rt",
        endpoint: "https://api.example.com",
      }),
    );
  });
});
