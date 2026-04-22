/**
 * Sub2API Provider Management section for Paseo settings.
 *
 * Allows users to:
 * - Log in via GitHub OAuth to sub2api
 * - View/switch/add/edit providers for Claude Code and Codex
 * - Auto-setup default provider after login
 */
import { useState, useCallback, useEffect } from "react";
import { View, Text, Pressable, TextInput, Alert } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { useSub2APIAuth } from "@/hooks/use-sub2api-auth";
import { SettingsSection } from "@/screens/settings/settings-section";
import { getIsElectron } from "@/constants/platform";

interface Provider {
  id: string;
  name: string;
  type: "sub2api" | "custom";
  endpoint: string;
  apiKey: string;
  isDefault: boolean;
}

interface ProviderStore {
  providers: Provider[];
  activeProviderId: string | null;
}

async function invokeDesktop(command: string, args?: Record<string, unknown>): Promise<unknown> {
  if (!window.paseoDesktop) return null;
  return window.paseoDesktop.invoke(command, args);
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

  // Load providers from Electron
  const loadProviders = useCallback(async () => {
    if (!isElectron) return;
    try {
      const store = (await invokeDesktop("get_providers")) as ProviderStore | null;
      if (store) {
        setProviders(store.providers);
        setActiveId(store.activeProviderId);
      }
    } catch {
      // ignore
    }
  }, [isElectron]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  // Listen for auth callback from Electron deep link
  useEffect(() => {
    if (!isElectron || !window.paseoDesktop) return;

    let cleanup: (() => void) | null = null;
    window.paseoDesktop.events
      .on("auth-callback", async (payload: unknown) => {
        const { url } = payload as { url: string };
        try {
          const hashStr = new URL(url).hash.slice(1);
          const params = new URLSearchParams(hashStr);
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");
          const expiresIn = parseInt(params.get("expires_in") ?? "0", 10);

          if (accessToken && refreshToken) {
            await login({
              accessToken,
              refreshToken,
              expiresIn,
              endpoint: sub2apiEndpoint,
            });

            // Auto-fetch API key and setup default provider
            const keysResp = await fetch(`${sub2apiEndpoint}/api/v1/keys`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            let apiKey = "";
            if (keysResp.ok) {
              const keys = (await keysResp.json()) as { data?: { key: string }[] };
              if (keys.data && keys.data.length > 0) {
                apiKey = keys.data[0].key;
              }
            }
            // If no key, create one
            if (!apiKey) {
              const createResp = await fetch(`${sub2apiEndpoint}/api/v1/keys`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ name: "Paseo Desktop" }),
              });
              if (createResp.ok) {
                const created = (await createResp.json()) as { data?: { key: string } };
                apiKey = created.data?.key ?? "";
              }
            }

            if (apiKey) {
              await invokeDesktop("setup_default_provider", {
                endpoint: sub2apiEndpoint,
                apiKey,
                name: "Sub2API",
              });
              await loadProviders();
            }
          }
        } catch (e) {
          console.error("[auth-callback] failed:", e);
        }
      })
      .then((unsub) => {
        cleanup = unsub;
      });

    return () => {
      cleanup?.();
    };
  }, [isElectron, sub2apiEndpoint, login, loadProviders]);

  const handleGitHubLogin = useCallback(() => {
    const startURL = `${sub2apiEndpoint}/api/v1/auth/oauth/github/start?redirect=paseo://auth/callback`;
    if (window.paseoDesktop) {
      window.paseoDesktop.opener.openUrl(startURL);
    }
  }, [sub2apiEndpoint]);

  const handleSwitchProvider = useCallback(
    async (id: string) => {
      try {
        await invokeDesktop("switch_provider", { id });
        setActiveId(id);
      } catch (e) {
        Alert.alert("Error", `Failed to switch provider: ${e}`);
      }
    },
    [],
  );

  const handleAddProvider = useCallback(async () => {
    if (!editName.trim() || !editEndpoint.trim() || !editApiKey.trim()) return;
    const provider: Provider = {
      id: `custom-${Date.now()}`,
      name: editName.trim(),
      type: "custom",
      endpoint: editEndpoint.trim().replace(/\/$/, ""),
      apiKey: editApiKey.trim(),
      isDefault: false,
    };
    await invokeDesktop("add_provider", provider as unknown as Record<string, unknown>);
    setShowAddForm(false);
    setEditName("");
    setEditEndpoint("");
    setEditApiKey("");
    await loadProviders();
  }, [editName, editEndpoint, editApiKey, loadProviders]);

  const handleRemoveProvider = useCallback(
    async (id: string) => {
      await invokeDesktop("remove_provider", { id });
      await loadProviders();
    },
    [loadProviders],
  );

  if (!isElectron) return null;

  return (
    <SettingsSection title="API Providers" subtitle="Manage Claude Code & Codex endpoints">
      {/* Login section */}
      <View style={{ padding: 12, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: 13, color: theme.colors.textSecondary, flex: 1 }}>
            Sub2API Endpoint
          </Text>
          <TextInput
            value={sub2apiEndpoint}
            onChangeText={setSub2apiEndpoint}
            placeholder="https://api.example.com"
            style={{
              flex: 2,
              fontSize: 13,
              color: theme.colors.text,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}
          />
        </View>

        {isLoggedIn ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: "#22c55e",
              }}
            />
            <Text style={{ fontSize: 13, color: theme.colors.text, flex: 1 }}>
              Logged in to {auth?.endpoint}
            </Text>
            <Pressable
              onPress={logout}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>Logout</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={handleGitHubLogin}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: "#24292e",
            }}
          >
            <Text style={{ fontSize: 14, color: "#fff", fontWeight: "600" }}>
              Login with GitHub
            </Text>
          </Pressable>
        )}
      </View>

      {/* Provider list */}
      {providers.length > 0 && (
        <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border }}>
          {providers.map((p) => (
            <View
              key={p.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 12,
                gap: 8,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: activeId === p.id ? "#22c55e" : theme.colors.border,
                }}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, color: theme.colors.text, fontWeight: "500" }}>
                  {p.name}
                </Text>
                <Text style={{ fontSize: 11, color: theme.colors.textSecondary }}>
                  {p.endpoint}
                </Text>
              </View>
              {activeId !== p.id && (
                <Pressable
                  onPress={() => handleSwitchProvider(p.id)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 6,
                    backgroundColor: theme.colors.accent,
                  }}
                >
                  <Text style={{ fontSize: 12, color: "#fff" }}>Switch</Text>
                </Pressable>
              )}
              {!p.isDefault && (
                <Pressable
                  onPress={() => handleRemoveProvider(p.id)}
                  style={{ paddingHorizontal: 6, paddingVertical: 4 }}
                >
                  <Text style={{ fontSize: 12, color: "#ef4444" }}>Remove</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Add custom provider */}
      <View style={{ padding: 12, gap: 8 }}>
        {showAddForm ? (
          <View style={{ gap: 8 }}>
            <TextInput
              value={editName}
              onChangeText={setEditName}
              placeholder="Provider name"
              style={{
                fontSize: 13,
                color: theme.colors.text,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            />
            <TextInput
              value={editEndpoint}
              onChangeText={setEditEndpoint}
              placeholder="https://api.example.com"
              style={{
                fontSize: 13,
                color: theme.colors.text,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            />
            <TextInput
              value={editApiKey}
              onChangeText={setEditApiKey}
              placeholder="API Key"
              secureTextEntry
              style={{
                fontSize: 13,
                color: theme.colors.text,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={handleAddProvider}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 6,
                  borderRadius: 6,
                  backgroundColor: theme.colors.accent,
                }}
              >
                <Text style={{ fontSize: 13, color: "#fff" }}>Add</Text>
              </Pressable>
              <Pressable
                onPress={() => setShowAddForm(false)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 6,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => setShowAddForm(true)}
            style={{
              alignItems: "center",
              paddingVertical: 6,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderStyle: "dashed",
            }}
          >
            <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>
              + Add Custom Provider
            </Text>
          </Pressable>
        )}
      </View>
    </SettingsSection>
  );
}
