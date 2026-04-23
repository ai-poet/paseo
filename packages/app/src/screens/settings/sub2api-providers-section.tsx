import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Cloud } from "lucide-react-native";
import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/segmented-control";
import { SettingsSection } from "@/screens/settings/settings-section";
import { getIsElectron } from "@/constants/platform";
import { settingsStyles } from "@/styles/settings";
import { invokeDesktopCommand } from "@/desktop/electron/invoke";
import { useSub2APIAuth } from "@/hooks/use-sub2api-auth";
import { useSub2APILoginFlow } from "@/hooks/use-sub2api-login-flow";
import { useAppSettings } from "@/hooks/use-settings";
import {
  useCreateSub2APIKeyMutation,
  useDeleteSub2APIKeyMutation,
  useSub2APIAvailableGroups,
  useSub2APIKeys,
  useSub2APIMe,
  useSub2APIUsageStats,
} from "@/hooks/use-sub2api-api";
import type { Sub2APIGroup, Sub2APIKey } from "@/lib/sub2api-client";
import { isValidSub2APIEndpoint } from "./sub2api-auth-bridge";
import { Sub2APIPayModal } from "./sub2api-pay-modal";
import { getManagedServiceUrlFromEnv } from "@/config/managed-service-env";
import type {
  CodexWireApi,
  DesktopProviderPayload,
  ManagedProviderTarget,
  ProviderStore,
} from "@/screens/settings/sub2api-provider-types";

function providerTargetHint(p: DesktopProviderPayload): string {
  if (p.isDefault || p.target === undefined) {
    return "Claude Code + Codex";
  }
  if (p.target === "claude") {
    return "Claude Code · Anthropic";
  }
  return `Codex · ${p.codexWireApi === "chat" ? "Chat" : "Responses"}`;
}

const CUSTOM_TARGET_SEGMENT_OPTIONS: SegmentedControlOption<ManagedProviderTarget>[] = [
  { value: "claude", label: "Claude Code" },
  { value: "codex", label: "Codex" },
];

const CODEX_WIRE_SEGMENT_OPTIONS: SegmentedControlOption<CodexWireApi>[] = [
  { value: "responses", label: "Responses" },
  { value: "chat", label: "Chat" },
];

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

function findReusableKey(keys: Sub2APIKey[], groupId: number): Sub2APIKey | null {
  return (
    keys.find((entry) => entry.group_id === groupId && entry.status === "active") ??
    keys.find((entry) => entry.group_id === groupId) ??
    null
  );
}

function normalizeFilter(s: string): string {
  return s.trim().toLowerCase();
}

export function Sub2APIProvidersSection() {
  const { theme } = useUnistyles();
  const router = useRouter();
  const { settings } = useAppSettings();
  const { getAccessToken } = useSub2APIAuth();
  const isElectron = getIsElectron();

  const [providers, setProviders] = useState<DesktopProviderPayload[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showAddProviderForm, setShowAddProviderForm] = useState(false);
  const [editProviderName, setEditProviderName] = useState("");
  const [editProviderEndpoint, setEditProviderEndpoint] = useState("");
  const [editProviderApiKey, setEditProviderApiKey] = useState("");
  const [customTarget, setCustomTarget] = useState<ManagedProviderTarget>("claude");
  const [codexWireApi, setCodexWireApi] = useState<CodexWireApi>("responses");
  const [newKeyName, setNewKeyName] = useState("Paseo Desktop");
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [switchingGroupId, setSwitchingGroupId] = useState<number | null>(null);
  const [switchingKeyId, setSwitchingKeyId] = useState<number | null>(null);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payToken, setPayToken] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState("");
  const [keyFilter, setKeyFilter] = useState("");

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

  const filteredGroups = useMemo(() => {
    const q = normalizeFilter(groupFilter);
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.platform.toLowerCase().includes(q) ||
        String(g.rate_multiplier).includes(q),
    );
  }, [groups, groupFilter]);

  const filteredKeys = useMemo(() => {
    const q = normalizeFilter(keyFilter);
    if (!q) return keys;
    return keys.filter(
      (k) =>
        k.name.toLowerCase().includes(q) ||
        (k.group?.name?.toLowerCase().includes(q) ?? false) ||
        maskApiKey(k.key).toLowerCase().includes(q),
    );
  }, [keys, keyFilter]);

  const signedInAccountLabel = useMemo(() => {
    const u = meQuery.data;
    if (u) {
      const name = u.username?.trim();
      if (name) return name;
      const email = u.email?.trim();
      if (email) return email;
    }
    if (meQuery.isPending || meQuery.isFetching) return "…";
    return "Account";
  }, [meQuery.data, meQuery.isPending, meQuery.isFetching]);

  const activeProvider = useMemo(
    () => providers.find((p) => p.id === activeId) ?? null,
    [providers, activeId],
  );

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

  const {
    endpoint: serviceEndpoint,
    setEndpoint: setServiceEndpoint,
    canStartLogin,
    isLoggedIn,
    auth,
    handleGitHubLogin,
    logout,
  } = useSub2APILoginFlow({
    defaultEndpoint: getManagedServiceUrlFromEnv(),
    onLoginSuccess: () => {
      void loadProviders();
      void Promise.all([
        keysQuery.refetch(),
        groupsQuery.refetch(),
        meQuery.refetch(),
        usageTodayQuery.refetch(),
        usageWeekQuery.refetch(),
        usageMonthQuery.refetch(),
      ]);
    },
  });

  const handleLogout = useCallback(async () => {
    await logout();
    if (settings.accessMode === "builtin") {
      router.replace("/login");
    }
  }, [logout, router, settings.accessMode]);

  const setupDefaultProviderWithKey = useCallback(
    async (apiKey: string, name?: string) => {
      const targetEndpoint = auth?.endpoint ?? serviceEndpoint;
      if (!isValidSub2APIEndpoint(targetEndpoint)) {
        throw new Error("Service endpoint is invalid.");
      }

      await invokeDesktopCommand("setup_default_provider", {
        endpoint: targetEndpoint,
        apiKey,
        ...(name ? { name } : {}),
      });
      await loadProviders();
    },
    [auth?.endpoint, loadProviders, serviceEndpoint],
  );

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const openCustomProviderForm = useCallback(() => {
    setShowAddProviderForm(true);
    setEditProviderName("");
    setEditProviderEndpoint("");
    setEditProviderApiKey("");
    setCustomTarget("claude");
    setCodexWireApi("responses");
  }, []);

  const closeCustomProviderForm = useCallback(() => {
    setShowAddProviderForm(false);
    setEditProviderName("");
    setEditProviderEndpoint("");
    setEditProviderApiKey("");
    setCustomTarget("claude");
    setCodexWireApi("responses");
  }, []);

  useEffect(() => {
    if (selectedGroupId !== null || groups.length === 0) {
      return;
    }
    setSelectedGroupId(groups[0]?.id ?? null);
  }, [groups, selectedGroupId]);

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

    const provider: DesktopProviderPayload = {
      id: `custom-${Date.now()}`,
      name,
      type: "custom",
      endpoint,
      apiKey,
      isDefault: false,
      target: customTarget,
      ...(customTarget === "claude"
        ? { claudeApiFormat: "anthropic" as const }
        : { codexWireApi }),
    };

    try {
      await invokeDesktopCommand("add_provider", provider as unknown as Record<string, unknown>);
      closeCustomProviderForm();
      await loadProviders();
    } catch (error) {
      Alert.alert("Add provider failed", getErrorMessage(error));
    }
  }, [
    closeCustomProviderForm,
    codexWireApi,
    customTarget,
    editProviderApiKey,
    editProviderEndpoint,
    editProviderName,
    loadProviders,
  ]);

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
      Alert.alert("Missing group", "Select a group from the list below.");
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
      setSelectedGroupId(group.id);
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
  if (settings.accessMode === "byok") {
    return null;
  }

  return (
    <>
      <SettingsSection title="Account">
        {!isLoggedIn ? (
          <View style={styles.dashedCard}>
            <View style={styles.emptyIconWrap}>
              <Cloud size={theme.iconSize.lg} color={theme.colors.foregroundMuted} />
            </View>
            <Text style={styles.emptyTitle}>Sign in</Text>
            <Text style={styles.emptyBody}>
              Connect with GitHub to manage balance, routing, and API keys for Claude Code / Codex.
            </Text>
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
          </View>
        ) : (
          <View style={[settingsStyles.card, styles.cardBody]}>
            <Text style={styles.sectionHint}>
              Your Paseo Cloud session, billing, and routing for Claude Code / Codex.
            </Text>
            <View style={styles.statusRow}>
              <View style={styles.statusBadge}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText} numberOfLines={2}>
                  Signed in as {signedInAccountLabel}
                </Text>
              </View>
              <Pressable
                onPress={() => void handleLogout()}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.secondaryButtonText}>Logout</Text>
              </Pressable>
            </View>
          </View>
        )}
      </SettingsSection>

      {isLoggedIn ? (
        <>
          <SettingsSection title="Balance & usage">
            <View style={[settingsStyles.card, styles.cardBody]}>
              {meQuery.error ? (
                <View style={styles.errorBlock}>
                  <Text style={styles.errorHint}>{getErrorMessage(meQuery.error)}</Text>
                  <Pressable
                    onPress={() => void meQuery.refetch()}
                    style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                  >
                    <Text style={styles.secondaryButtonText}>Retry</Text>
                  </Pressable>
                </View>
              ) : (
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
              )}
              <Text style={styles.usageHint}>
                Today: {formatUsd(usageTodayQuery.data?.total_cost)} (
                {usageTodayQuery.data?.total_requests ?? 0} req)
              </Text>
              <Text style={styles.usageHint}>
                Week: {formatUsd(usageWeekQuery.data?.total_cost)} (
                {usageWeekQuery.data?.total_requests ?? 0} req)
              </Text>
              <Text style={styles.usageHint}>
                Month: {formatUsd(usageMonthQuery.data?.total_cost)} (
                {usageMonthQuery.data?.total_requests ?? 0} req)
              </Text>
            </View>
          </SettingsSection>

          <SettingsSection title="Active route">
            <View
              style={[
                settingsStyles.card,
                styles.cardBody,
                activeProvider ? styles.heroCardActive : null,
              ]}
            >
              {activeProvider ? (
                <>
                  <View style={styles.heroTitleRow}>
                    <View
                      style={[styles.providerDotHero, styles.providerDotActive]}
                      accessibilityLabel="Active"
                    />
                    <Text style={styles.heroLabel}>Active route</Text>
                  </View>
                  <Text style={styles.heroName}>{activeProvider.name}</Text>
                  <Text style={styles.heroEndpoint}>{activeProvider.endpoint}</Text>
                  <Text style={styles.heroKeyHint}>Key {maskApiKey(activeProvider.apiKey)}</Text>
                  <Text style={styles.heroMetaHint}>{providerTargetHint(activeProvider)}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.heroName}>No active route</Text>
                  <Text style={styles.sectionHint}>
                    Choose a group below or pick a saved endpoint. Claude Code and Codex use the
                    active route according to each entry&apos;s target (see Custom endpoint).
                  </Text>
                </>
              )}
            </View>
          </SettingsSection>

          <SettingsSection title="Group routing">
            <View style={[settingsStyles.card, styles.cardBody]}>
              <Text style={styles.sectionHint}>
                Switch reuses an existing key for that group when possible; otherwise a new key is
                created. Tap a row to select it for “Create new key” below.
              </Text>
              <Text style={styles.fieldLabel}>Filter groups</Text>
              <TextInput
                value={groupFilter}
                onChangeText={setGroupFilter}
                placeholder="Search by name or platform"
                placeholderTextColor={theme.colors.foregroundMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.textInput}
              />
              {groupsQuery.isLoading ? (
                <Text style={styles.usageHint}>Loading groups…</Text>
              ) : null}
              {groupsQuery.error ? (
                <View style={styles.errorBlock}>
                  <Text style={styles.errorHint}>{getErrorMessage(groupsQuery.error)}</Text>
                  <Pressable
                    onPress={() => void groupsQuery.refetch()}
                    style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                  >
                    <Text style={styles.secondaryButtonText}>Retry</Text>
                  </Pressable>
                </View>
              ) : filteredGroups.length === 0 && !groupsQuery.isLoading ? (
                <Text style={styles.usageHint}>No groups match your filter.</Text>
              ) : (
                <View style={styles.groupRowList}>
                  {filteredGroups.map((group) => {
                    const selected = selectedGroupId === group.id;
                    const busy = switchingGroupId === group.id;
                    return (
                      <View
                        key={group.id}
                        style={[styles.groupRouteRow, selected && styles.groupRouteRowSelected]}
                      >
                        <Pressable
                          onPress={() => setSelectedGroupId(group.id)}
                          style={styles.groupRouteRowMain}
                        >
                          <Text style={settingsStyles.rowTitle}>{group.name}</Text>
                          <Text style={settingsStyles.rowHint}>
                            {group.platform} · {group.rate_multiplier}x
                          </Text>
                          {selected ? (
                            <Text style={styles.selectedPillText}>Selected for new key</Text>
                          ) : null}
                        </Pressable>
                        <Pressable
                          onPress={() => void handleQuickSwitchGroup(group)}
                          style={({ pressed }) => [
                            styles.primaryButton,
                            pressed && styles.buttonPressed,
                            busy && styles.disabledButton,
                          ]}
                          disabled={busy}
                        >
                          <Text style={styles.primaryButtonText}>
                            {busy ? "Switching…" : "Switch"}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}

              <View style={styles.createKeyBlock}>
                <Text style={styles.formTitle}>Create new key &amp; switch</Text>
                <TextInput
                  value={newKeyName}
                  onChangeText={setNewKeyName}
                  placeholder="Key label (e.g. Paseo Desktop)"
                  placeholderTextColor={theme.colors.foregroundMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.textInput}
                />
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
                    {createKeyMutation.isPending ? "Creating…" : "Create key & switch"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </SettingsSection>

          <SettingsSection title="API keys">
            <View style={[settingsStyles.card, styles.cardBody]}>
              {keysQuery.error ? (
                <View style={styles.errorBlock}>
                  <Text style={styles.errorHint}>{getErrorMessage(keysQuery.error)}</Text>
                  <Pressable
                    onPress={() => void keysQuery.refetch()}
                    style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                  >
                    <Text style={styles.secondaryButtonText}>Retry</Text>
                  </Pressable>
                </View>
              ) : null}
              <Text style={styles.fieldLabel}>Filter keys</Text>
              <TextInput
                value={keyFilter}
                onChangeText={setKeyFilter}
                placeholder="Search by name or group"
                placeholderTextColor={theme.colors.foregroundMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.textInput}
              />
              {keysQuery.isLoading ? (
                <Text style={styles.usageHint}>Loading keys…</Text>
              ) : filteredKeys.length === 0 ? (
                <Text style={styles.usageHint}>No keys yet — use group routing to create one.</Text>
              ) : (
                <View style={styles.keyRowList}>
                  {filteredKeys.map((key) => (
                    <View key={key.id} style={styles.keyRow}>
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
                            {switchingKeyId === key.id ? "Using…" : "Use"}
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
              )}
            </View>
          </SettingsSection>

          <SettingsSection title="Saved endpoints">
            {providers.length === 0 ? (
              <View style={styles.dashedCard}>
                <Text style={styles.emptyTitle}>No saved endpoints</Text>
                <Text style={styles.emptyBody}>
                  After sign-in, your default cloud route appears here. Add custom Claude Code or Codex
                  endpoints below when you use another base URL or wire format.
                </Text>
              </View>
            ) : (
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
                      <Text style={styles.providerMetaHint}>{providerTargetHint(provider)}</Text>
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
            )}
          </SettingsSection>

          <SettingsSection title="Custom endpoint">
            <View style={[settingsStyles.card, styles.cardBody]}>
              {showAddProviderForm ? (
                <View style={styles.formBody}>
                  <Text style={styles.fieldLabel}>Target</Text>
                  <SegmentedControl
                    options={CUSTOM_TARGET_SEGMENT_OPTIONS}
                    value={customTarget}
                    onValueChange={setCustomTarget}
                    size="sm"
                  />
                  {customTarget === "claude" ? (
                    <Text style={styles.usageHint}>
                      Claude Code is configured as native Anthropic Messages only (ANTHROPIC_BASE_URL).
                      OpenAI-compatible upstreams will be supported via a separate gateway later.
                    </Text>
                  ) : (
                    <>
                      <Text style={styles.fieldLabel}>Wire API</Text>
                      <SegmentedControl
                        options={CODEX_WIRE_SEGMENT_OPTIONS}
                        value={codexWireApi}
                        onValueChange={setCodexWireApi}
                        size="sm"
                      />
                      <Text style={styles.usageHint}>
                        Matches Codex CLI wire expectations (OpenAI-compatible).
                      </Text>
                    </>
                  )}
                  <Text style={styles.fieldLabel}>Name</Text>
                  <TextInput
                    value={editProviderName}
                    onChangeText={setEditProviderName}
                    placeholder="Provider name"
                    placeholderTextColor={theme.colors.foregroundMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.textInput}
                  />
                  <Text style={styles.fieldLabel}>Endpoint</Text>
                  <TextInput
                    value={editProviderEndpoint}
                    onChangeText={setEditProviderEndpoint}
                    placeholder="https://api.example.com"
                    placeholderTextColor={theme.colors.foregroundMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.textInput}
                  />
                  <Text style={styles.fieldLabel}>API key</Text>
                  <Text style={styles.usageHint}>
                    {customTarget === "claude"
                      ? "Anthropic-style credential for Claude Code; the desktop app maps it into the right env vars."
                      : "OpenAI-style credential (Codex / OPENAI_API_KEY semantics)."}
                  </Text>
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
                      onPress={closeCustomProviderForm}
                      style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                    >
                      <Text style={styles.secondaryButtonText}>Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={openCustomProviderForm}
                  style={({ pressed }) => [styles.addProviderButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.addProviderButtonText}>+ Add custom provider</Text>
                </Pressable>
              )}
            </View>
          </SettingsSection>
        </>
      ) : null}

      <Sub2APIPayModal
        visible={isPayModalOpen}
        endpoint={auth?.endpoint ?? serviceEndpoint}
        accessToken={payToken}
        onClose={() => setIsPayModalOpen(false)}
        onCompleted={handlePayCompleted}
      />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  cardBody: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  dashedCard: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
    padding: theme.spacing[6],
    alignItems: "center",
    gap: theme.spacing[2],
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: theme.colors.surface0,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing[1],
  },
  emptyTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
    textAlign: "center",
  },
  emptyBody: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    textAlign: "center",
    maxWidth: 320,
    marginBottom: theme.spacing[2],
  },
  heroCardActive: {
    borderColor: theme.colors.palette.green[400],
    borderWidth: 1,
  },
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    marginBottom: theme.spacing[1],
  },
  providerDotHero: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  heroLabel: {
    color: theme.colors.palette.green[400],
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  heroName: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
  },
  heroEndpoint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[1],
  },
  heroKeyHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing[2],
  },
  heroMetaHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing[1],
  },
  providerMetaHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing[1],
  },
  sectionHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  endpointRow: {
    gap: theme.spacing[2],
    alignSelf: "stretch",
    width: "100%",
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
  errorBlock: {
    gap: theme.spacing[2],
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
    alignSelf: "stretch",
    width: "100%",
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
  groupRowList: {
    gap: theme.spacing[2],
  },
  groupRouteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[2],
    backgroundColor: theme.colors.surface0,
  },
  groupRouteRowSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: "rgba(59,130,246,0.08)",
  },
  groupRouteRowMain: {
    flex: 1,
    gap: theme.spacing[1],
  },
  selectedPillText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    marginTop: theme.spacing[1],
  },
  createKeyBlock: {
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
    paddingTop: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  keyRowList: {
    gap: theme.spacing[2],
  },
  keyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
    backgroundColor: theme.colors.surface0,
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
