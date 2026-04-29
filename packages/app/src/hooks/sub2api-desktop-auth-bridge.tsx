/**
 * Listens for Electron sub2api OAuth return (pending URL on cold start + auth-callback events).
 * Must mount at app root: when only / (startup) is shown, /login is not mounted and
 * useSub2APILoginFlow would never register the listeners otherwise.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { Alert } from "react-native";
import { getIsElectron } from "@/constants/platform";
import { invokeDesktopCommand } from "@/desktop/electron/invoke";
import { getDesktopHost } from "@/desktop/host";
import { useSub2APIAuth } from "@/hooks/use-sub2api-auth";
import { cloudServiceQueryKeys } from "@/hooks/use-sub2api-api";
import { parseSub2APIAuthCallback } from "@/screens/settings/sub2api-auth-bridge";
import { resolveScopedActiveProviderIds } from "@/screens/settings/desktop-providers-context";
import type { ProviderStore } from "@/screens/settings/sub2api-provider-types";
import { CLOUD_NAME } from "@/config/branding";

let lastHandledCallbackUrl: string | null = null;

interface AuthCallbackPayload {
  url: string;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function extractAuthCallbackUrl(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const url = (payload as AuthCallbackPayload).url;
  return typeof url === "string" && url.length > 0 ? url : null;
}

async function configureMissingManagedRoutes(session: ReturnType<typeof parseSub2APIAuthCallback>) {
  const store = await invokeDesktopCommand<ProviderStore>("get_providers");
  const active = resolveScopedActiveProviderIds(store);

  const commands: Array<Promise<unknown>> = [];
  if (!active.claude && session.claudeApiKey) {
    commands.push(
      invokeDesktopCommand("setup_default_provider", {
        endpoint: session.endpoint,
        apiKey: session.claudeApiKey,
        scope: "claude",
        name: CLOUD_NAME,
      }),
    );
  }
  if (!active.codex && session.codexApiKey) {
    commands.push(
      invokeDesktopCommand("setup_default_provider", {
        endpoint: session.endpoint,
        apiKey: session.codexApiKey,
        scope: "codex",
        name: CLOUD_NAME,
      }),
    );
  }

  if (
    commands.length === 0 &&
    !active.claude &&
    !active.codex &&
    !session.claudeApiKey &&
    !session.codexApiKey &&
    session.apiKey
  ) {
    commands.push(
      invokeDesktopCommand("setup_default_provider", {
        endpoint: session.endpoint,
        apiKey: session.apiKey,
        scope: "both",
        name: CLOUD_NAME,
      }),
    );
  }

  if (commands.length === 0) {
    return;
  }

  await Promise.all(commands);
}

export function Sub2apiDesktopAuthBridge(): null {
  const queryClient = useQueryClient();
  const { login } = useSub2APIAuth();
  const loginRef = useRef(login);
  loginRef.current = login;
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  const applyCallback = useCallback(async (payload: unknown) => {
    const url = extractAuthCallbackUrl(payload);
    if (!url) {
      return;
    }
    if (lastHandledCallbackUrl === url) {
      return;
    }
    lastHandledCallbackUrl = url;

    try {
      const session = parseSub2APIAuthCallback(url);
      await loginRef.current({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresIn: session.expiresIn,
        endpoint: session.endpoint,
      });
      try {
        await configureMissingManagedRoutes(session);
      } catch (error) {
        console.error("[sub2api-desktop-auth-bridge] auto-route setup failed:", error);
        Alert.alert(
          "Signed in",
          `Your account is connected, but automatic Claude/Codex setup did not finish. ${getErrorMessage(error)}`,
        );
      }
      void queryClientRef.current.invalidateQueries({ queryKey: cloudServiceQueryKeys.root });
    } catch (error) {
      lastHandledCallbackUrl = null;
      console.error("[sub2api-desktop-auth-bridge] callback failed:", error);
      Alert.alert("Login failed", getErrorMessage(error));
    }
  }, []);

  const applyCallbackRef = useRef(applyCallback);
  applyCallbackRef.current = applyCallback;

  useEffect(() => {
    if (!getIsElectron()) {
      return;
    }

    const run = (payload: unknown) => {
      void applyCallbackRef.current(payload);
    };

    const subscribe = getDesktopHost()?.events?.on;
    if (typeof subscribe !== "function") {
      return;
    }

    let disposed = false;
    let cleanup: (() => void) | null = null;

    void Promise.resolve(subscribe("auth-callback", run))
      .then((unsubscribe) => {
        if (disposed) {
          unsubscribe();
          return;
        }
        cleanup = unsubscribe;
      })
      .catch((error) => {
        console.error("[sub2api-desktop-auth-bridge] subscribe failed:", error);
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    if (!getIsElectron()) {
      return;
    }
    const getPendingAuthCallback = getDesktopHost()?.getPendingAuthCallback;
    if (typeof getPendingAuthCallback !== "function") {
      return;
    }

    void getPendingAuthCallback()
      .then((url) => {
        if (!url) {
          return;
        }
        void applyCallbackRef.current({ url });
      })
      .catch((error) => {
        console.error("[sub2api-desktop-auth-bridge] pending callback failed:", error);
      });
  }, []);

  return null;
}
