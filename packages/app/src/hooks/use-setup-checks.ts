import { useCallback, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { getIsElectron } from "@/constants/platform";
import { useSub2APIAuth } from "@/hooks/use-sub2api-auth";
import { useAppSettings, type AccessMode } from "@/hooks/use-settings";
import { getManagedServiceUrlFromEnv } from "@/config/managed-service-env";
import { createSub2APIClient } from "@/lib/sub2api-client";
import {
  getModelCliRuntimeStatus,
  installAllModelClis,
  type ModelCliRuntimeStatus,
} from "@/desktop/daemon/desktop-daemon";
import { invokeDesktopCommand } from "@/desktop/electron/invoke";
import type { ProviderStore } from "@/screens/settings/sub2api-provider-types";
import { resolveScopedActiveProviderIds } from "@/screens/settings/desktop-providers-context";

export type CheckStatus = "pending" | "checking" | "passed" | "failed" | "skipped";

export interface CheckItem {
  id: "health" | "apiKeys" | "cliConfig";
  label: string;
  description: string;
  status: CheckStatus;
  error: string | null;
  fixLabel: string | null;
}

export interface UseSetupChecksReturn {
  checks: CheckItem[];
  allPassed: boolean;
  isRunning: boolean;
  runAllChecks: () => Promise<void>;
  fixCheck: (id: CheckItem["id"]) => Promise<void>;
}

const HEALTH_TIMEOUT_MS = 5000;

async function checkHealth(endpoint: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const resp = await fetch(`${endpoint}/health`, { signal: controller.signal });
    const data = (await resp.json()) as { status?: string };
    if (data?.status !== "ok") {
      throw new Error("Service returned unexpected status");
    }
  } finally {
    clearTimeout(timeout);
  }
}

function makeInitialChecks(accessMode: AccessMode | null): CheckItem[] {
  const isElectron = getIsElectron();
  return [
    {
      id: "health",
      label: "Backend Service",
      description: "Checking service reachability...",
      status: "pending",
      error: null,
      fixLabel: "Retry",
    },
    {
      id: "apiKeys",
      label: "API Key",
      description: accessMode === "byok" ? "BYOK mode — skipped" : "Checking API keys...",
      status: accessMode === "byok" ? "skipped" : "pending",
      error: null,
      fixLabel: "Create Key",
    },
    {
      id: "cliConfig",
      label: "Claude Code & Codex",
      description: isElectron ? "Checking CLI tools..." : "Desktop only — skipped",
      status: isElectron ? "pending" : "skipped",
      error: null,
      fixLabel: "Install",
    },
  ];
}

export function useSetupChecks(): UseSetupChecksReturn {
  const router = useRouter();
  const { settings } = useAppSettings();
  const { auth, getAccessToken } = useSub2APIAuth();
  const isElectron = getIsElectron();

  const clientRef = useRef(
    settings.accessMode === "builtin" && auth?.endpoint
      ? createSub2APIClient({ endpoint: auth.endpoint, getAccessToken })
      : null,
  );

  const [checks, setChecks] = useState<CheckItem[]>(() =>
    makeInitialChecks(settings.accessMode),
  );
  const [isRunning, setIsRunning] = useState(false);
  const cliStatusRef = useRef<ModelCliRuntimeStatus | null>(null);

  const updateCheck = useCallback(
    (id: CheckItem["id"], patch: Partial<CheckItem>) => {
      setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    },
    [],
  );

  const getEndpoint = useCallback(() => {
    return settings.accessMode === "builtin" && auth?.endpoint
      ? auth.endpoint
      : getManagedServiceUrlFromEnv();
  }, [auth?.endpoint, settings.accessMode]);

  const runHealthCheck = useCallback(async () => {
    updateCheck("health", { status: "checking", error: null });
    try {
      await checkHealth(getEndpoint());
      updateCheck("health", { status: "passed", description: "Service is reachable" });
    } catch (err) {
      updateCheck("health", {
        status: "failed",
        error: err instanceof Error ? err.message : "Connection failed",
        description: "Cannot reach backend service",
        fixLabel: "Retry",
      });
      throw err;
    }
  }, [getEndpoint, updateCheck]);

  const runApiKeyCheck = useCallback(async () => {
    if (settings.accessMode === "byok") {
      updateCheck("apiKeys", { status: "skipped", description: "BYOK mode — skipped" });
      return;
    }
    updateCheck("apiKeys", { status: "checking", error: null });
    try {
      const c = clientRef.current;
      if (!c) throw new Error("Not authenticated");
      const result = await c.listKeys(1, 1);
      if (result.total > 0) {
        updateCheck("apiKeys", {
          status: "passed",
          description: `${result.total} API key(s) found`,
        });
      } else {
        updateCheck("apiKeys", {
          status: "failed",
          error: "No API keys found",
          description: "You need at least one API key",
          fixLabel: "Create Key",
        });
        throw new Error("No API keys");
      }
    } catch (err) {
      if ((err as Error).message !== "No API keys") {
        updateCheck("apiKeys", {
          status: "failed",
          error: err instanceof Error ? err.message : "Check failed",
          description: "Failed to check API keys",
          fixLabel: "Create Key",
        });
      }
      throw err;
    }
  }, [settings.accessMode, updateCheck]);

  const runCliConfigCheck = useCallback(async () => {
    if (!isElectron) {
      updateCheck("cliConfig", { status: "skipped", description: "Desktop only — skipped" });
      return;
    }
    updateCheck("cliConfig", { status: "checking", error: null });
    try {
      const status = await getModelCliRuntimeStatus();
      cliStatusRef.current = status;
      const nodeOk = status.node.installed && status.node.satisfies;
      const claudeOk = status.claude.installed;
      const codexOk = status.codex.installed;

      if (!nodeOk || !claudeOk || !codexOk) {
        const missing: string[] = [];
        if (!nodeOk) missing.push("Node.js 22");
        if (!claudeOk) missing.push("Claude Code");
        if (!codexOk) missing.push("Codex");
        updateCheck("cliConfig", {
          status: "failed",
          error: `Missing: ${missing.join(", ")}`,
          description: "CLI tools not fully installed",
          fixLabel: "Install All",
        });
        throw new Error("CLI not installed");
      }

      // Check provider configuration
      const store = await invokeDesktopCommand<ProviderStore>("get_providers");
      const { claude, codex } = resolveScopedActiveProviderIds(store);
      if (!claude && !codex) {
        updateCheck("cliConfig", {
          status: "failed",
          error: "No providers configured for Claude Code or Codex",
          description: "CLI tools installed but not configured",
          fixLabel: "Configure",
        });
        throw new Error("Providers not configured");
      }
      const partial = !claude || !codex;
      if (partial) {
        const configured = claude ? "Claude Code" : "Codex";
        const unconfigured = !claude ? "Claude Code" : "Codex";
        updateCheck("cliConfig", {
          status: "failed",
          description: `Only ${configured} configured`,
          error: `${unconfigured} provider not configured`,
          fixLabel: "Configure",
        });
        throw new Error("Partial config");
      }
      updateCheck("cliConfig", {
        status: "passed",
        description: "Claude Code & Codex installed and configured",
      });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg !== "CLI not installed" && msg !== "Providers not configured" && msg !== "Partial config") {
        updateCheck("cliConfig", {
          status: "failed",
          error: err instanceof Error ? err.message : "Check failed",
          description: "Failed to check CLI configuration",
          fixLabel: "Retry",
        });
      }
      throw err;
    }
  }, [isElectron, updateCheck]);

  const runAllChecks = useCallback(async () => {
    setIsRunning(true);
    setChecks(makeInitialChecks(settings.accessMode));

    // Rebuild client ref in case auth changed
    if (settings.accessMode === "builtin" && auth?.endpoint) {
      clientRef.current = createSub2APIClient({ endpoint: auth.endpoint, getAccessToken });
    }

    try {
      await runHealthCheck();
    } catch {
      setIsRunning(false);
      return;
    }
    try {
      await runApiKeyCheck();
    } catch {
      // continue to CLI check
    }
    try {
      await runCliConfigCheck();
    } catch {
      // done
    }
    setIsRunning(false);
  }, [auth?.endpoint, getAccessToken, runApiKeyCheck, runCliConfigCheck, runHealthCheck, settings.accessMode]);

  const fixCheck = useCallback(
    async (id: CheckItem["id"]) => {
      switch (id) {
        case "health":
          updateCheck("health", { status: "checking", error: null });
          try {
            await checkHealth(getEndpoint());
            updateCheck("health", { status: "passed", description: "Service is reachable" });
          } catch (err) {
            updateCheck("health", {
              status: "failed",
              error: err instanceof Error ? err.message : "Connection failed",
            });
          }
          break;

        case "apiKeys":
          router.push("/settings/paseo-cloud");
          break;

        case "cliConfig": {
          const status = cliStatusRef.current;
          const needsInstall =
            status && (!status.node.satisfies || !status.claude.installed || !status.codex.installed);
          if (needsInstall) {
            updateCheck("cliConfig", {
              status: "checking",
              error: null,
              description: "Installing CLI tools...",
            });
            try {
              const result = await installAllModelClis();
              cliStatusRef.current = result.status;
              const allInstalled =
                result.status.node.satisfies &&
                result.status.claude.installed &&
                result.status.codex.installed;
              if (allInstalled) {
                await runCliConfigCheck();
              } else {
                updateCheck("cliConfig", {
                  status: "failed",
                  error: "Installation incomplete",
                  description: "Some tools failed to install",
                  fixLabel: "Retry",
                });
              }
            } catch (err) {
              updateCheck("cliConfig", {
                status: "failed",
                error: err instanceof Error ? err.message : "Install failed",
                fixLabel: "Retry",
              });
            }
          } else {
            router.push("/settings/managed-provider");
          }
          break;
        }
      }
    },
    [getEndpoint, router, runCliConfigCheck, updateCheck],
  );

  const allPassed = checks.every((c) => c.status === "passed" || c.status === "skipped");

  return { checks, allPassed, isRunning, runAllChecks, fixCheck };
}
