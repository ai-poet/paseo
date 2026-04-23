/**
 * Shared managed-service login flow hook (OAuth + default provider setup).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { getIsElectron } from "@/constants/platform";
import { getDesktopHost } from "@/desktop/host";
import { invokeDesktopCommand } from "@/desktop/electron/invoke";
import { openExternalUrl } from "@/utils/open-external-url";
import { useSub2APIAuth, type Sub2APIAuthState } from "@/hooks/use-sub2api-auth";
import {
  buildSub2APILoginBridgeUrl,
  isValidSub2APIEndpoint,
  parseSub2APIAuthCallback,
} from "@/screens/settings/sub2api-auth-bridge";

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

export interface UseSub2APILoginFlowOptions {
  /** Called after a successful OAuth callback + provider setup. */
  onLoginSuccess?: (auth: Sub2APIAuthState) => void;
  /** Called if the callback or provider setup fails. */
  onLoginError?: (error: unknown) => void;
  /** Fallback endpoint if the user has no saved auth yet. */
  defaultEndpoint?: string;
  /** Show an Alert dialog on error (defaults to true). */
  alertOnError?: boolean;
}

export interface UseSub2APILoginFlowReturn {
  /** Current endpoint in the input field. */
  endpoint: string;
  /** Setter for the endpoint input. */
  setEndpoint: (value: string) => void;
  /** Whether the endpoint parses as a valid http(s) URL. */
  canStartLogin: boolean;
  /** Whether an OAuth session is present. */
  isLoggedIn: boolean;
  /** Current persisted auth state (access token, endpoint, etc.). */
  auth: Sub2APIAuthState | null;
  /** Kick off GitHub OAuth (opens external URL). */
  handleGitHubLogin: () => Promise<void>;
  /** Clear persisted auth. */
  logout: () => Promise<void>;
  /** True between OAuth kickoff and callback resolution. */
  isInFlight: boolean;
  /** Whether the underlying auth query is still loading. */
  isLoading: boolean;
}

export function useSub2APILoginFlow(
  options: UseSub2APILoginFlowOptions = {},
): UseSub2APILoginFlowReturn {
  const { onLoginSuccess, onLoginError, defaultEndpoint = "", alertOnError = true } = options;
  const { auth, isLoggedIn, isLoading, login, logout } = useSub2APIAuth();
  const [endpoint, setEndpoint] = useState<string>(auth?.endpoint ?? defaultEndpoint);
  const [isInFlight, setIsInFlight] = useState(false);
  const lastHandledCallbackUrlRef = useRef<string | null>(null);
  const isElectron = getIsElectron();

  // Keep latest callbacks in refs so the auth-callback subscription effect
  // can remain stable across callback identity changes.
  const onLoginSuccessRef = useRef(onLoginSuccess);
  const onLoginErrorRef = useRef(onLoginError);
  const alertOnErrorRef = useRef(alertOnError);
  useEffect(() => {
    onLoginSuccessRef.current = onLoginSuccess;
  }, [onLoginSuccess]);
  useEffect(() => {
    onLoginErrorRef.current = onLoginError;
  }, [onLoginError]);
  useEffect(() => {
    alertOnErrorRef.current = alertOnError;
  }, [alertOnError]);

  // When the stored auth endpoint changes (e.g. after login), reflect it in
  // the local input so the user sees where they are authenticated.
  useEffect(() => {
    if (!auth?.endpoint) return;
    setEndpoint(auth.endpoint);
  }, [auth?.endpoint]);

  const canStartLogin = isValidSub2APIEndpoint(endpoint);

  const setupDefaultProviderWithKey = useCallback(
    async (apiKey: string, targetEndpoint: string, name?: string) => {
      if (!isValidSub2APIEndpoint(targetEndpoint)) {
        throw new Error("Service endpoint is invalid.");
      }
      await invokeDesktopCommand("setup_default_provider", {
        endpoint: targetEndpoint,
        apiKey,
        ...(name ? { name } : {}),
      });
    },
    [],
  );

  const handleAuthCallback = useCallback(
    async (payload: unknown) => {
      const url = extractAuthCallbackUrl(payload);
      if (!url) return;
      if (lastHandledCallbackUrlRef.current === url) return;
      lastHandledCallbackUrlRef.current = url;

      try {
        const session = parseSub2APIAuthCallback(url);
        await login({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresIn: session.expiresIn,
          endpoint: session.endpoint,
        });
        await setupDefaultProviderWithKey(session.apiKey, session.endpoint, "Default");
        setEndpoint(session.endpoint);

        const nextAuth: Sub2APIAuthState = {
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresAt: Date.now() + session.expiresIn * 1000,
          endpoint: session.endpoint,
        };
        onLoginSuccessRef.current?.(nextAuth);
      } catch (error) {
        console.error("[managed-login-flow] callback failed:", error);
        if (alertOnErrorRef.current) {
          Alert.alert("Login failed", getErrorMessage(error));
        }
        onLoginErrorRef.current?.(error);
      } finally {
        setIsInFlight(false);
      }
    },
    [login, setupDefaultProviderWithKey],
  );

  useEffect(() => {
    if (!isElectron) return;
    const subscribe = getDesktopHost()?.events?.on;
    if (typeof subscribe !== "function") return;

    let disposed = false;
    let cleanup: (() => void) | null = null;

    void Promise.resolve(subscribe("auth-callback", handleAuthCallback))
      .then((unsubscribe) => {
        if (disposed) {
          unsubscribe();
          return;
        }
        cleanup = unsubscribe;
      })
      .catch((error) => {
        console.error("[managed-login-flow] subscribe failed:", error);
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [handleAuthCallback, isElectron]);

  useEffect(() => {
    if (!isElectron) return;
    const getPendingAuthCallback = getDesktopHost()?.getPendingAuthCallback;
    if (typeof getPendingAuthCallback !== "function") return;

    void getPendingAuthCallback()
      .then((url) => {
        if (!url) return;
        void handleAuthCallback({ url });
      })
      .catch((error) => {
        console.error("[managed-login-flow] pending callback failed:", error);
      });
  }, [handleAuthCallback, isElectron]);

  const handleGitHubLogin = useCallback(async () => {
    try {
      setIsInFlight(true);
      const startURL = buildSub2APILoginBridgeUrl(endpoint);
      await openExternalUrl(startURL);
    } catch (error) {
      setIsInFlight(false);
      if (alertOnErrorRef.current) {
        Alert.alert("Unable to start login", getErrorMessage(error));
      }
      onLoginErrorRef.current?.(error);
    }
  }, [endpoint]);

  return {
    endpoint,
    setEndpoint,
    canStartLogin,
    isLoggedIn,
    auth,
    handleGitHubLogin,
    logout,
    isInFlight,
    isLoading,
  };
}
