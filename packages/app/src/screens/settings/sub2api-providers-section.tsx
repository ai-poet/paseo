import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { SettingsSection } from "@/screens/settings/settings-section";
import { getIsElectron } from "@/constants/platform";
import { settingsStyles } from "@/styles/settings";
import { invokeDesktopCommand } from "@/desktop/electron/invoke";
import { getDesktopHost } from "@/desktop/host";
import { openExternalUrl } from "@/utils/open-external-url";
import { useSub2APIAuth } from "@/hooks/use-sub2api-auth";
import {
  useCreateSub2APIKeyMutation,
  useDeleteSub2APIKeyMutation,
  useSub2APIAvailableGroups,
  useSub2APIKeys,
  useSub2APIMe,
  useSub2APIUsageStats,
} from "@/hooks/use-sub2api-api";
import type { Sub2APIGroup, Sub2APIKey } from "@/lib/sub2api-client";
import {
  buildSub2APILoginBridgeUrl,
  isValidSub2APIEndpoint,
  parseSub2APIAuthCallback,
} from "./sub2api-auth-bridge";
import { Sub2APIPayModal } from "./sub2api-pay-modal";

interface Provider {
  id: string;
  name: string;
  type: "default" | "custom";
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

function formatUsd(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }
  return `$${value.toFixed(2)}`;
}

function maskApiKey(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 12) {
    return trimmed;
  }
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-4)}`;
}

function extractAuthCallbackUrl(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const url = (payload as AuthCallbackPayload).url;
  return typeof url === "string" && url.length > 0 ? url : null;
}

function findReusableKey(keys: Sub2APIKey[], groupId: number): Sub2APIKey | null {
  return (
    keys.find((entry) => entry.group_id === groupId && entry.status === "active") ??
    keys.find((entry) => entry.group_id === groupId) ??
    null
  );
}

export function Sub2APIProvidersSection() {
  const { theme } = useUnistyles();
  const { isLoggedIn, auth, login, logout, getAccessToken } = useSub2APIAuth();
  const isElectron = getIsElectron();

  const [providers, setProviders] = useState<Provider[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showAddProviderForm, setShowAddProviderForm] = useState(false);
  const [editProviderName, setEditProviderName] = useState("");
  const [editProviderEndpoint, setEditProviderEndpoint] = useState("");
  const [editProviderApiKey, setEditProviderApiKey] = useState("");
  const [sub2apiEndpoint, setSub2apiEndpoint] = useState("");
  const [newKeyName, setNewKeyName] = useState("Paseo Desktop");
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [switchingGroupId, setSwitchingGroupId] = useState<number | null>(null);
  const [switchingKeyId, setSwitchingKeyId] = useState<number | null>(null);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payToken, setPayToken] = useState<string | null>(null);
  const lastHandledCallbackUrlRef = useRef<string | null>(null);

  const meQuery = useSub2APIMe();
  const keysQuery = useSub2APIKeys(1, 200);
  const groupsQuery = useSub2APIAvailableGroups();
  const usageTodayQuery = useSub2APIUsageStats("today");
  const usageWeekQuery = useSub2APIUsageStats("week");
  const usageMonthQuery = useSub2APIUsageStats("month");
  const createKeyMutation = useCreateSub2APIKeyMutation();
  const deleteKeyMutation = useDeleteSub2APIKeyMutation();

  const keys = useMemo(() => keysQuery.data?.items ?? [], [keysQuery.data?.items]);
  const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);
  const canStartLogin = isValidSub2APIEndpoint(sub2apiEndpoint);

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

  const setupDefaultProviderWithKey = useCallback(
    async (apiKey: string, name?: string) => {
      const targetEndpoint = auth?.endpoint ?? sub2apiEndpoint;
      if (!isValidSub2APIEndpoint(targetEndpoint)) {
        throw new Error("Sub2API endpoint is invalid.");
      }

      await invokeDesktopCommand("setup_default_provider", {
        endpoint: targetEndpoint,
        apiKey,
        ...(name ? { name } : {}),
      });
      await loadProviders();
    },
    [auth?.endpoint, loadProviders, sub2apiEndpoint],
  );

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

        await setupDefaultProviderWithKey(session.apiKey, "Default");
        setSub2apiEndpoint(session.endpoint);

        await Promise.all([
          keysQuery.refetch(),
          groupsQuery.refetch(),
          meQuery.refetch(),
          usageTodayQuery.refetch(),
          usageWeekQuery.refetch(),
          usageMonthQuery.refetch(),
        ]);
      } catch (error) {
        console.error("[sub2api-auth] callback failed:", error);
        Alert.alert("Login failed", getErrorMessage(error));
      }
    },
    [
      groupsQuery,
      keysQuery,
      login,
      meQuery,
      setupDefaultProviderWithKey,
      usageMonthQuery,
      usageTodayQuery,
      usageWeekQuery,
    ],
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
        console.error("[sub2api-auth] subscribe failed:", error);
      });

    return () => {
      disposed = true;
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
        console.error("[sub2api-auth] pending callback failed:", error);
      });
  }, [handleAuthCallback, isElectron]);

  useEffect(() => {
    if (selectedGroupId !== null || groups.length === 0) {
      return;
    }
    setSelectedGroupId(groups[0]?.id ?? null);
  }, [groups, selectedGroupId]);

  const handleGitHubLogin = useCallback(async () => {
    try {
      const startURL = buildSub2APILoginBridgeUrl(sub2apiEndpoint);
      await openExternalUrl(startURL);
    } catch (error) {
      Alert.alert("Unable to start login", getErrorMessage(error));
    }
  }, [sub2apiEndpoint]);

  const handleOpenPayModal = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) {
        Alert.alert("Session expired", "Please log in again before opening payment.");
        return;
      }
      setPayToken(token);
      setIsPayModalOpen(true);
    } catch (error) {
      Alert.alert("Unable to open payment", getErrorMessage(error));
    }
  }, [getAccessToken]);

  const handlePayCompleted = useCallback(() => {
    void Promise.all([meQuery.refetch(), usageTodayQuery.refetch(), usageMonthQuery.refetch()]);
  }, [meQuery, usageMonthQuery, usageTodayQuery]);

  const handleSwitchProvider = useCallback(async (id: string) => {
    try {
      await invokeDesktopCommand("switch_provider", { id });
      setActiveId(id);
    } catch (error) {
      Alert.alert("Switch failed", getErrorMessage(error));
    }
  }, []);

  const handleAddProvider = useCallback(async () => {
    const name = editProviderName.trim();
    const endpoint = editProviderEndpoint.trim().replace(/\/+$/, "");
    const apiKey = editProviderApiKey.trim();

    if (!name || !endpoint || !apiKey) {
      Alert.alert("Missing information", "Name, endpoint and API key are required.");
      return;
    }
    if (!isValidSub2APIEndpoint(endpoint)) {
      Alert.alert("Invalid endpoint", "Please enter a valid http(s) endpoint.");
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
      setShowAddProviderForm(false);
      setEditProviderName("");
      setEditProviderEndpoint("");
      setEditProviderApiKey("");
      await loadProviders();
    } catch (error) {
      Alert.alert("Add provider failed", getErrorMessage(error));
    }
  }, [editProviderApiKey, editProviderEndpoint, editProviderName, loadProviders]);

  const handleRemoveProvider = useCallback(
    async (id: string) => {
      try {
        await invokeDesktopCommand("remove_provider", { id });
        await loadProviders();
      } catch (error) {
        Alert.alert("Remove provider failed", getErrorMessage(error));
      }
    },
    [loadProviders],
  );

  const handleUseKey = useCallback(
    async (key: Sub2APIKey) => {
      setSwitchingKeyId(key.id);
      try {
        await setupDefaultProviderWithKey(key.key, key.group?.name ?? key.name);
        Alert.alert("Switched", `Now using key "${key.name}".`);
      } catch (error) {
        Alert.alert("Switch failed", getErrorMessage(error));
      } finally {
        setSwitchingKeyId(null);
      }
    },
    [setupDefaultProviderWithKey],
  );

  const handleDeleteKey = useCallback(
    async (keyId: number) => {
      try {
        await deleteKeyMutation.mutateAsync(keyId);
      } catch (error) {
        Alert.alert("Delete failed", getErrorMessage(error));
      }
    },
    [deleteKeyMutation],
  );

  const handleCreateKeyAndSwitch = useCallback(async () => {
    if (selectedGroupId === null) {
      Alert.alert("Missing group", "Please select a target group.");
      return;
    }
    const name = newKeyName.trim();
    if (!name) {
      Alert.alert("Missing name", "Please enter a key name.");
      return;
    }

    const selectedGroup = groups.find((entry) => entry.id === selectedGroupId) ?? null;
    setSwitchingGroupId(selectedGroupId);
    try {
      const created = await createKeyMutation.mutateAsync({
        name,
        group_id: selectedGroupId,
      });
      await setupDefaultProviderWithKey(created.key, selectedGroup?.name ?? "Default");
      setNewKeyName("Paseo Desktop");
      await keysQuery.refetch();
      Alert.alert("Created", `Key "${created.name}" is now active in Claude/Codex.`);
    } catch (error) {
      Alert.alert("Create key failed", getErrorMessage(error));
    } finally {
      setSwitchingGroupId(null);
    }
  }, [
    createKeyMutation,
    groups,
    keysQuery,
    newKeyName,
    selectedGroupId,
    setupDefaultProviderWithKey,
  ]);

  const handleQuickSwitchGroup = useCallback(
    async (group: Sub2APIGroup) => {
      setSwitchingGroupId(group.id);
      try {
        const reusable = findReusableKey(keys, group.id);
        const keyToUse =
          reusable ??
          (await createKeyMutation.mutateAsync({
            name: `${group.name} Key`,
            group_id: group.id,
          }));

        await setupDefaultProviderWithKey(keyToUse.key, group.name);
        await keysQuery.refetch();
        Alert.alert("Switched", `Now routing through "${group.name}".`);
      } catch (error) {
        Alert.alert("Switch failed", getErrorMessage(error));
      } finally {
        setSwitchingGroupId(null);
      }
    },
    [createKeyMutation, keys, keysQuery, setupDefaultProviderWithKey],
  );

  if (!isElectron) {
    return null;
  }

  return (
    <SettingsSection title="Sub2API Providers">
      <View style={[settingsStyles.card, styles.cardBody]}>
        <Text style={styles.sectionHint}>
          OAuth login, key management, group switching and payment are managed here.
        </Text>

        <View style={styles.endpointRow}>
          <Text style={styles.fieldLabel}>Sub2API Endpoint</Text>
          <TextInput
            value={sub2apiEndpoint}
            onChangeText={setSub2apiEndpoint}
            placeholder="https://your-sub2api.com"
            placeholderTextColor={theme.colors.foregroundMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.textInput}
          />
          {!canStartLogin ? (
            <Text style={styles.errorHint}>Enter a valid http(s) endpoint before login.</Text>
          ) : null}
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
            style={({ pressed }) => [
              styles.githubButton,
              pressed && styles.buttonPressed,
              !canStartLogin && styles.disabledButton,
            ]}
            disabled={!canStartLogin}
          >
            <Text style={styles.githubButtonText}>Login with GitHub</Text>
          </Pressable>
        )}
      </View>

      {isLoggedIn ? (
        <View style={[settingsStyles.card, styles.cardBody]}>
          <View style={styles.balanceHeader}>
            <View>
              <Text style={styles.balanceLabel}>Balance</Text>
              <Text style={styles.balanceValue}>{formatUsd(meQuery.data?.balance)}</Text>
            </View>
            <Pressable
              onPress={() => void handleOpenPayModal()}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.primaryButtonText}>Recharge</Text>
            </Pressable>
          </View>
          <Text style={styles.usageHint}>
            Today: {formatUsd(usageTodayQuery.data?.total_cost)} ({usageTodayQuery.data?.total_requests ?? 0} req)
          </Text>
          <Text style={styles.usageHint}>
            Week: {formatUsd(usageWeekQuery.data?.total_cost)} ({usageWeekQuery.data?.total_requests ?? 0} req)
          </Text>
          <Text style={styles.usageHint}>
            Month: {formatUsd(usageMonthQuery.data?.total_cost)} ({usageMonthQuery.data?.total_requests ?? 0} req)
          </Text>
        </View>
      ) : null}

      {isLoggedIn ? (
        <View style={[settingsStyles.card, styles.cardBody]}>
          <Text style={styles.formTitle}>Create Key + Switch Provider</Text>
          <TextInput
            value={newKeyName}
            onChangeText={setNewKeyName}
            placeholder="Paseo Desktop"
            placeholderTextColor={theme.colors.foregroundMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.textInput}
          />
          {groupsQuery.isLoading ? <Text style={styles.usageHint}>Loading groups...</Text> : null}
          {groupsQuery.error ? (
            <Text style={styles.errorHint}>{getErrorMessage(groupsQuery.error)}</Text>
          ) : null}
          <View style={styles.groupList}>
            {groups.map((group) => (
              <Pressable
                key={group.id}
                onPress={() => setSelectedGroupId(group.id)}
                style={({ pressed }) => [
                  styles.groupChip,
                  selectedGroupId === group.id && styles.groupChipSelected,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text
                  style={[
                    styles.groupChipText,
                    selectedGroupId === group.id && styles.groupChipTextSelected,
                  ]}
                >
                  {group.name} · {group.platform} · {group.rate_multiplier}x
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={() => void handleCreateKeyAndSwitch()}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
              (switchingGroupId !== null || createKeyMutation.isPending) && styles.disabledButton,
            ]}
            disabled={switchingGroupId !== null || createKeyMutation.isPending}
          >
            <Text style={styles.primaryButtonText}>
              {createKeyMutation.isPending ? "Creating..." : "Create and Switch"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {isLoggedIn && groups.length > 0 ? (
        <View style={settingsStyles.card}>
          {groups.map((group, index) => (
            <View key={group.id} style={[settingsStyles.row, index > 0 && settingsStyles.rowBorder]}>
              <View style={settingsStyles.rowContent}>
                <Text style={settingsStyles.rowTitle}>{group.name}</Text>
                <Text style={settingsStyles.rowHint}>
                  {group.platform} · multiplier {group.rate_multiplier}x
                </Text>
              </View>
              <Pressable
                onPress={() => void handleQuickSwitchGroup(group)}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.buttonPressed,
                  switchingGroupId === group.id && styles.disabledButton,
                ]}
                disabled={switchingGroupId === group.id}
              >
                <Text style={styles.primaryButtonText}>
                  {switchingGroupId === group.id ? "Switching..." : "Use Group"}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {isLoggedIn && keys.length > 0 ? (
        <View style={settingsStyles.card}>
          {keys.map((key, index) => (
            <View key={key.id} style={[settingsStyles.row, index > 0 && settingsStyles.rowBorder]}>
              <View style={settingsStyles.rowContent}>
                <Text style={settingsStyles.rowTitle}>{key.name}</Text>
                <Text style={settingsStyles.rowHint}>
                  {maskApiKey(key.key)} · Group: {key.group?.name ?? key.group_id ?? "none"}
                </Text>
                <Text style={settingsStyles.rowHint}>Used: {formatUsd(key.quota_used)}</Text>
              </View>
              <View style={styles.keyActions}>
                <Pressable
                  onPress={() => void handleUseKey(key)}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.buttonPressed,
                    switchingKeyId === key.id && styles.disabledButton,
                  ]}
                  disabled={switchingKeyId === key.id}
                >
                  <Text style={styles.primaryButtonText}>
                    {switchingKeyId === key.id ? "Using..." : "Use"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleDeleteKey(key.id)}
                  style={({ pressed }) => [styles.removeButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.removeButtonText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}

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
        {showAddProviderForm ? (
          <View style={styles.formBody}>
            <TextInput
              value={editProviderName}
              onChangeText={setEditProviderName}
              placeholder="Provider name"
              placeholderTextColor={theme.colors.foregroundMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.textInput}
            />
            <TextInput
              value={editProviderEndpoint}
              onChangeText={setEditProviderEndpoint}
              placeholder="https://api.example.com"
              placeholderTextColor={theme.colors.foregroundMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.textInput}
            />
            <TextInput
              value={editProviderApiKey}
              onChangeText={setEditProviderApiKey}
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
                onPress={() => setShowAddProviderForm(false)}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => setShowAddProviderForm(true)}
            style={({ pressed }) => [styles.addProviderButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.addProviderButtonText}>+ Add Custom Provider</Text>
          </Pressable>
        )}
      </View>

      <Sub2APIPayModal
        visible={isPayModalOpen}
        endpoint={auth?.endpoint ?? sub2apiEndpoint}
        accessToken={payToken}
        onClose={() => setIsPayModalOpen(false)}
        onCompleted={handlePayCompleted}
      />
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
  errorHint: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.xs,
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
  disabledButton: {
    opacity: 0.6,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  balanceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  balanceLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  balanceValue: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
  },
  usageHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  formTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  groupList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  groupChip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    backgroundColor: theme.colors.surface1,
  },
  groupChipSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: "rgba(59,130,246,0.12)",
  },
  groupChipText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  groupChipTextSelected: {
    color: theme.colors.foreground,
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
  keyActions: {
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
    gap: theme.spacing[3],
  },
  formActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  addProviderButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    paddingVertical: theme.spacing[3],
  },
  addProviderButtonText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
}));
