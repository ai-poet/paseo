/**
 * Sub2API Provider Management section for Paseo settings.
 *
 * Allows users to:
 * - Log in via GitHub OAuth to sub2api
 * - View/switch/add/edit providers for Claude Code and Codex
 * - Auto-setup default provider after login
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, Pressable, TextInput, Alert } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useSub2APIAuth } from "@/hooks/use-sub2api-auth";
import { SettingsSection } from "@/screens/settings/settings-section";
import { getIsElectron } from "@/constants/platform";
import { settingsStyles } from "@/styles/settings";
import { invokeDesktopCommand } from "@/desktop/electron/invoke";
import { getDesktopHost } from "@/desktop/host";
import { openExternalUrl } from "@/utils/open-external-url";
import { buildSub2APILoginBridgeUrl, parseSub2APIAuthCallback } from "./sub2api-auth-bridge";

interface Provider {
  id: string;
  name: string;
  type: "default" | "sub2api" | "custom";
  endpoint: string;
  apiKey: string;
  isDefault: boolean;
}

interface ProviderStore {
  providers: Provider[];
  activeProviderId: string | null;
}

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

export function Sub2APIProvidersSection() {
  const { theme } = useUnistyles();
  const { isLoggedIn, auth, login, logout } = useSub2APIAuth();
  const isElectron = getIsElectron();

  const [providers, setProviders] = useState<Provider[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEndpoint, setEditEndpoint] = useState("");
  const [editApiKey, setEditApiKey] = useState("");
  const [sub2apiEndpoint, setSub2apiEndpoint] = useState("https://api.example.com");
  const lastHandledCallbackUrlRef = useRef<string | null>(null);

  const loadProviders = useCallback(async () => {
    if (!isElectron) {
      return;
    }

    try {
      const store = await invokeDesktopCommand<ProviderStore>("get_providers");
      setProviders(store.providers);
      setActiveId(store.activeProviderId);
    } catch {
      setProviders([]);
      setActiveId(null);
    }
  }, [isElectron]);

  const handleAuthCallback = useCallback(
    async (payload: unknown) => {
      const url = extractAuthCallbackUrl(payload);
      if (!url) {
        return;
      }
      if (lastHandledCallbackUrlRef.current === url) {
        return;
      }
      lastHandledCallbackUrlRef.current = url;

      try {
        const session = parseSub2APIAuthCallback(url);

        await login({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresIn: session.expiresIn,
          endpoint: session.endpoint,
        });

        await invokeDesktopCommand("setup_default_provider", {
          endpoint: session.endpoint,
          apiKey: session.apiKey,
        });
        setSub2apiEndpoint(session.endpoint);
        await loadProviders();
      } catch (error) {
        console.error("[auth-callback] failed:", error);
        Alert.alert("Login failed", getErrorMessage(error));
      }
    },
    [loadProviders, login],
  );

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    if (!auth?.endpoint) {
      return;
    }
    setSub2apiEndpoint(auth.endpoint);
  }, [auth?.endpoint]);

  useEffect(() => {
    if (!isElectron) {
      return;
    }

    const subscribe = getDesktopHost()?.events?.on;
    if (typeof subscribe !== "function") {
      return;
    }

    let isDisposed = false;
    let cleanup: (() => void) | null = null;

    void Promise.resolve(subscribe("auth-callback", handleAuthCallback))
      .then((unsubscribe) => {
        if (isDisposed) {
          unsubscribe();
          return;
        }
        cleanup = unsubscribe;
      })
      .catch((error) => {
        console.error("[auth-callback] subscribe failed:", error);
      });

    return () => {
      isDisposed = true;
      cleanup?.();
    };
  }, [handleAuthCallback, isElectron]);

  useEffect(() => {
    if (!isElectron) {
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
        void handleAuthCallback({ url });
      })
      .catch((error) => {
        console.error("[auth-callback] pending read failed:", error);
      });
  }, [handleAuthCallback, isElectron]);

  const handleGitHubLogin = useCallback(async () => {
    const startURL = buildSub2APILoginBridgeUrl(sub2apiEndpoint);
    try {
      await openExternalUrl(startURL);
    } catch (error) {
      Alert.alert("Error", `Failed to open login page: ${getErrorMessage(error)}`);
    }
  }, [sub2apiEndpoint]);

  const handleSwitchProvider = useCallback(async (id: string) => {
    try {
      await invokeDesktopCommand("switch_provider", { id });
      setActiveId(id);
    } catch (error) {
      Alert.alert("Error", `Failed to switch provider: ${getErrorMessage(error)}`);
    }
  }, []);

  const handleAddProvider = useCallback(async () => {
    const name = editName.trim();
    const endpoint = editEndpoint.trim().replace(/\/$/, "");
    const apiKey = editApiKey.trim();

    if (!name || !endpoint || !apiKey) {
      Alert.alert("Missing information", "Name, endpoint, and API key are required.");
      return;
    }

    const provider: Provider = {
      id: `custom-${Date.now()}`,
      name,
      type: "custom",
      endpoint,
      apiKey,
      isDefault: false,
    };

    try {
      await invokeDesktopCommand("add_provider", provider as unknown as Record<string, unknown>);
      setShowAddForm(false);
      setEditName("");
      setEditEndpoint("");
      setEditApiKey("");
      await loadProviders();
    } catch (error) {
      Alert.alert("Error", `Failed to add provider: ${getErrorMessage(error)}`);
    }
  }, [editApiKey, editEndpoint, editName, loadProviders]);

  const handleRemoveProvider = useCallback(
    async (id: string) => {
      try {
        await invokeDesktopCommand("remove_provider", { id });
        await loadProviders();
      } catch (error) {
        Alert.alert("Error", `Failed to remove provider: ${getErrorMessage(error)}`);
      }
    },
    [loadProviders],
  );

  if (!isElectron) {
    return null;
  }

  return (
    <SettingsSection title="API Providers">
      <View style={[settingsStyles.card, styles.cardBody]}>
        <Text style={styles.sectionHint}>Manage Claude Code and Codex endpoints.</Text>

        <View style={styles.endpointRow}>
          <Text style={styles.fieldLabel}>Sub2API Endpoint</Text>
          <TextInput
            value={sub2apiEndpoint}
            onChangeText={setSub2apiEndpoint}
            placeholder="https://api.example.com"
            placeholderTextColor={theme.colors.foregroundMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.textInput}
          />
        </View>

        {isLoggedIn ? (
          <View style={styles.statusRow}>
            <View style={styles.statusBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Logged in to {auth?.endpoint}</Text>
            </View>
            <Pressable
              onPress={() => void logout()}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.secondaryButtonText}>Logout</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => void handleGitHubLogin()}
            style={({ pressed }) => [styles.githubButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.githubButtonText}>Login with GitHub</Text>
          </Pressable>
        )}
      </View>

      {providers.length > 0 ? (
        <View style={settingsStyles.card}>
          {providers.map((provider, index) => (
            <View
              key={provider.id}
              style={[settingsStyles.row, index > 0 && settingsStyles.rowBorder]}
            >
              <View style={settingsStyles.rowContent}>
                <View style={styles.providerTitleRow}>
                  <View
                    style={[
                      styles.providerDot,
                      activeId === provider.id ? styles.providerDotActive : styles.providerDotIdle,
                    ]}
                  />
                  <Text style={settingsStyles.rowTitle}>{provider.name}</Text>
                </View>
                <Text style={settingsStyles.rowHint}>{provider.endpoint}</Text>
              </View>

              <View style={styles.providerActions}>
                {activeId !== provider.id ? (
                  <Pressable
                    onPress={() => void handleSwitchProvider(provider.id)}
                    style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
                  >
                    <Text style={styles.primaryButtonText}>Switch</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.activeProviderText}>Active</Text>
                )}

                {!provider.isDefault ? (
                  <Pressable
                    onPress={() => void handleRemoveProvider(provider.id)}
                    style={({ pressed }) => [styles.removeButton, pressed && styles.buttonPressed]}
                  >
                    <Text style={styles.removeButtonText}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View style={[settingsStyles.card, styles.cardBody]}>
        {showAddForm ? (
          <View style={styles.formBody}>
            <TextInput
              value={editName}
              onChangeText={setEditName}
              placeholder="Provider name"
              placeholderTextColor={theme.colors.foregroundMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.textInput}
            />
            <TextInput
              value={editEndpoint}
              onChangeText={setEditEndpoint}
              placeholder="https://api.example.com"
              placeholderTextColor={theme.colors.foregroundMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.textInput}
            />
            <TextInput
              value={editApiKey}
              onChangeText={setEditApiKey}
              placeholder="API key"
              placeholderTextColor={theme.colors.foregroundMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={styles.textInput}
            />
            <View style={styles.formActions}>
              <Pressable
                onPress={() => void handleAddProvider()}
                style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.primaryButtonText}>Add</Text>
              </Pressable>
              <Pressable
                onPress={() => setShowAddForm(false)}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => setShowAddForm(true)}
            style={({ pressed }) => [styles.addProviderButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.addProviderButtonText}>+ Add Custom Provider</Text>
          </Pressable>
        )}
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  cardBody: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  sectionHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  endpointRow: {
    gap: theme.spacing[2],
  },
  fieldLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  textInput: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface1,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  statusBadge: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.palette.green[400],
  },
  statusText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    flexShrink: 1,
  },
  githubButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    backgroundColor: "#24292e",
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  githubButtonText: {
    color: theme.colors.palette.white,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  primaryButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.accent,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  primaryButtonText: {
    color: theme.colors.accentForeground,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  secondaryButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  secondaryButtonText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  providerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  providerDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  providerDotActive: {
    backgroundColor: theme.colors.palette.green[400],
  },
  providerDotIdle: {
    backgroundColor: theme.colors.border,
  },
  providerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  activeProviderText: {
    color: theme.colors.palette.green[400],
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  removeButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[1],
  },
  removeButtonText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  formBody: {
    gap: theme.spacing[2],
  },
  formActions: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  addProviderButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  addProviderButtonText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
