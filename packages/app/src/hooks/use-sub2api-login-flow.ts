/**
 * Shared managed-service login flow hook (OAuth + default provider setup).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { openExternalUrl } from "@/utils/open-external-url";
import { useSub2APIAuth, type Sub2APIAuthState } from "@/hooks/use-sub2api-auth";
import { buildSub2APILoginBridgeUrl, isValidSub2APIEndpoint } from "@/screens/settings/sub2api-auth-bridge";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface UseSub2APILoginFlowOptions {
  /** Called after a successful OAuth callback is persisted locally. */
  onLoginSuccess?: (auth: Sub2APIAuthState) => void;
  /** Called if the callback handling fails. */
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
  const { onLoginError, defaultEndpoint = "", alertOnError = true } = options;
  // onLoginSuccess in options: OAuth now completes in Sub2apiDesktopAuthBridge (me/usage refetch via query invalidation).
  const { auth, isLoggedIn, isLoading, logout } = useSub2APIAuth();
  const [endpoint, setEndpoint] = useState<string>(auth?.endpoint ?? defaultEndpoint);
  const [isInFlight, setIsInFlight] = useState(false);

  const onLoginErrorRef = useRef(onLoginError);
  const alertOnErrorRef = useRef(alertOnError);
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

  // After logout (or before first login), prefer build-time default when set.
  useEffect(() => {
    if (auth) return;
    const trimmed = defaultEndpoint.trim();
    if (trimmed.length > 0) {
      setEndpoint(trimmed);
    }
  }, [auth, defaultEndpoint]);

  // OAuth callback is handled by Sub2apiDesktopAuthBridge at root; clear in-flight when session appears.
  useEffect(() => {
    if (isLoggedIn) {
      setIsInFlight(false);
    }
  }, [isLoggedIn]);

  const canStartLogin = isValidSub2APIEndpoint(endpoint);

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
