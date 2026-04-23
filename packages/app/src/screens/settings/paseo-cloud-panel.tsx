import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useUnistyles } from "react-native-unistyles";
import { Cloud } from "lucide-react-native";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { useAppSettings } from "@/hooks/use-settings";
import { useSub2APIAuth } from "@/hooks/use-sub2api-auth";
import { useSub2APILoginFlow } from "@/hooks/use-sub2api-login-flow";
import {
  useCreateSub2APIKeyMutation,
  useDeleteSub2APIKeyMutation,
  useUpdateSub2APIKeyMutation,
  useSub2APIAvailableGroups,
  useSub2APIKeys,
  useSub2APIMe,
  useSub2APIUsageStats,
} from "@/hooks/use-sub2api-api";
import type { Sub2APIGroup, Sub2APIKey } from "@/lib/sub2api-client";
import { isValidSub2APIEndpoint } from "./sub2api-auth-bridge";
import { ComboSelect } from "@/components/agent-form/agent-form-dropdowns";
import { AdaptiveModalSheet, AdaptiveTextInput } from "@/components/adaptive-modal-sheet";
import { Sub2APIPayModal } from "./sub2api-pay-modal";
import { getManagedServiceUrlFromEnv } from "@/config/managed-service-env";
import { invokeDesktopCommand } from "@/desktop/electron/invoke";
import { useDesktopProvidersStore } from "@/screens/settings/desktop-providers-context";
import { managedProviderSettingsStyles as styles } from "@/screens/settings/managed-provider-settings-styles";
import {
  findReusableKey,
  formatUsd,
  getErrorMessage,
  maskApiKey,
  normalizeFilter,
} from "@/screens/settings/managed-provider-settings-shared";
import { Sub2APIModelsSection } from "@/screens/settings/sub2api-models-section";

export function PaseoCloudPanel() {
  const { theme } = useUnistyles();
  const router = useRouter();
  const { settings } = useAppSettings();
  const { getAccessToken } = useSub2APIAuth();
  const { loadProviders, activeRouteApiKeys } = useDesktopProvidersStore();

  const [newKeyName, setNewKeyName] = useState("Paseo Desktop");
  const [createKeyGroupId, setCreateKeyGroupId] = useState<number | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [switchingGroupId, setSwitchingGroupId] = useState<number | null>(null);
  const [switchingKeyId, setSwitchingKeyId] = useState<number | null>(null);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payToken, setPayToken] = useState<string | null>(null);
  const [keyFilter, setKeyFilter] = useState("");
  const [editingKey, setEditingKey] = useState<Sub2APIKey | null>(null);
  const [editKeyName, setEditKeyName] = useState("");
  const [editKeyGroupId, setEditKeyGroupId] = useState<number | null>(null);

  const meQuery = useSub2APIMe();
  const keysQuery = useSub2APIKeys(1, 200);
  const groupsQuery = useSub2APIAvailableGroups();
  const usageTodayQuery = useSub2APIUsageStats("today");
  const usageWeekQuery = useSub2APIUsageStats("week");
  const usageMonthQuery = useSub2APIUsageStats("month");
  const createKeyMutation = useCreateSub2APIKeyMutation();
  const deleteKeyMutation = useDeleteSub2APIKeyMutation();
  const updateKeyMutation = useUpdateSub2APIKeyMutation();

  const keys = useMemo(() => keysQuery.data?.items ?? [], [keysQuery.data?.items]);
  const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);

  const groupSelectOptions = useMemo(
    () =>
      groups.map((g) => ({
        id: String(g.id),
        label: g.name,
        description: `${g.platform} · ${g.rate_multiplier}x`,
      })),
    [groups],
  );

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

  const {
    endpoint: serviceEndpoint,
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
    if (selectedGroupId !== null || groups.length === 0) {
      return;
    }
    setSelectedGroupId(groups[0]?.id ?? null);
  }, [groups, selectedGroupId]);

  useEffect(() => {
    if (selectedGroupId !== null) {
      setCreateKeyGroupId(selectedGroupId);
    }
  }, [selectedGroupId]);

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

  const closeEditKey = useCallback(() => {
    setEditingKey(null);
    setEditKeyName("");
    setEditKeyGroupId(null);
  }, []);

  const openEditKey = useCallback(
    (key: Sub2APIKey) => {
      setEditingKey(key);
      setEditKeyName(key.name);
      setEditKeyGroupId(key.group_id ?? selectedGroupId ?? groups[0]?.id ?? null);
    },
    [groups, selectedGroupId],
  );

  const handleSaveEditKey = useCallback(async () => {
    if (!editingKey) {
      return;
    }
    const name = editKeyName.trim();
    if (!name) {
      Alert.alert("Missing name", "Please enter a key name.");
      return;
    }
    if (editKeyGroupId == null) {
      Alert.alert("Missing group", "Select a group for this key.");
      return;
    }
    try {
      await updateKeyMutation.mutateAsync({
        id: editingKey.id,
        patch: { name, group_id: editKeyGroupId },
      });
      closeEditKey();
    } catch (error) {
      Alert.alert("Update failed", getErrorMessage(error));
    }
  }, [closeEditKey, editKeyGroupId, editKeyName, editingKey, updateKeyMutation]);

  const handleCreateKey = useCallback(async () => {
    if (createKeyGroupId === null) {
      Alert.alert("Missing group", "Select a group for the new key.");
      return;
    }
    const name = newKeyName.trim();
    if (!name) {
      Alert.alert("Missing name", "Please enter a key name.");
      return;
    }

    try {
      await createKeyMutation.mutateAsync({
        name,
        group_id: createKeyGroupId,
      });
      setNewKeyName("Paseo Desktop");
      Alert.alert(
        "Created",
        `Key "${name}" was created. Tap "Use key" or "Use group" below to switch Claude/Codex to it.`,
      );
    } catch (error) {
      Alert.alert("Create key failed", getErrorMessage(error));
    }
  }, [createKeyGroupId, createKeyMutation, newKeyName]);

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

  const showCloudDataPanels = isLoggedIn;

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
              Connect with GitHub for Paseo Cloud billing, API keys, and group routing. You can still
              use BYOK on this device; signing in is optional for account management.
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

      {showCloudDataPanels ? (
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
      ) : null}

      {showCloudDataPanels ? (
        <>
          <SettingsSection title="Routing & API keys">
            <View style={[settingsStyles.card, styles.cardBody]}>
              <Text style={styles.sectionHint}>
                Choose a <Text style={styles.sectionHintEm}>routing group</Text> below for new keys.{" "}
                <Text style={styles.sectionHintEm}>Use group</Text> routes through that group (reusing a
                key when possible). <Text style={styles.sectionHintEm}>Use key</Text> switches the desktop
                to a specific credential. API keys stay in the list under this block.
              </Text>
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
              ) : groupsQuery.isLoading && groups.length === 0 ? (
                <Text style={styles.usageHint}>Loading groups…</Text>
              ) : groups.length === 0 ? (
                <Text style={styles.usageHint}>No groups available.</Text>
              ) : (
                <View style={styles.groupPickerBlock}>
                  <View style={styles.groupComboWrap}>
                    <ComboSelect
                      label="Routing group"
                      title="Select routing group"
                      value={selectedGroupId != null ? String(selectedGroupId) : ""}
                      options={groupSelectOptions}
                      placeholder="Select a group…"
                      isLoading={groupsQuery.isFetching}
                      onSelect={(id) => setSelectedGroupId(Number(id))}
                      showLabel
                      testID="sub2api-routing-group-select"
                    />
                  </View>
                  <Pressable
                    onPress={() => {
                      const group =
                        selectedGroupId != null
                          ? (groups.find((g) => g.id === selectedGroupId) ?? null)
                          : null;
                      if (group) void handleQuickSwitchGroup(group);
                    }}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      pressed && styles.buttonPressed,
                      (selectedGroupId === null || switchingGroupId !== null) && styles.disabledButton,
                    ]}
                    disabled={selectedGroupId === null || switchingGroupId !== null}
                  >
                    <Text style={styles.primaryButtonText}>
                      {switchingGroupId !== null ? "Routing…" : "Use group"}
                    </Text>
                  </Pressable>
                </View>
              )}

              <View style={styles.createKeyBlock}>
                <Text style={styles.formTitle}>Create API key</Text>
                <Text style={styles.usageHint}>
                  Defaults to the routing group above; change the group here if the new key should
                  belong elsewhere. Creating does not switch the desktop route.
                </Text>
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput
                  value={newKeyName}
                  onChangeText={setNewKeyName}
                  placeholder="Key name (e.g. Paseo Desktop)"
                  placeholderTextColor={theme.colors.foregroundMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.textInput}
                />
                <View style={styles.groupComboWrap}>
                  <ComboSelect
                    label="Group"
                    title="Select group for new key"
                    value={createKeyGroupId != null ? String(createKeyGroupId) : ""}
                    options={groupSelectOptions}
                    placeholder="Select a group…"
                    isLoading={groupsQuery.isFetching}
                    onSelect={(id) => setCreateKeyGroupId(Number(id))}
                    showLabel
                    testID="sub2api-create-key-group-select"
                  />
                </View>
                <Pressable
                  onPress={() => void handleCreateKey()}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    pressed && styles.buttonPressed,
                    createKeyMutation.isPending && styles.disabledButton,
                  ]}
                  disabled={createKeyMutation.isPending}
                >
                  <Text style={styles.primaryButtonText}>
                    {createKeyMutation.isPending ? "Creating…" : "Create"}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.keysSubsection}>
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
                  <Text style={styles.usageHint}>
                    No keys yet — use Create API key above, or tap Use group to route (a key may be
                    created automatically).
                  </Text>
                ) : (
                  <View style={styles.keyRowList}>
                    {filteredKeys.map((key) => {
                      const matchesSelectedGroup =
                        selectedGroupId != null && key.group_id === selectedGroupId;
                      const trimmedKey = key.key.trim();
                      const isKeyInUse = activeRouteApiKeys.some((k) => k === trimmedKey);
                      return (
                        <View key={key.id} style={styles.keyRow}>
                          <View style={settingsStyles.rowContent}>
                            <Text style={settingsStyles.rowTitle}>{key.name}</Text>
                            {matchesSelectedGroup ? (
                              <Text style={styles.keyMatchBadge}>Matches selected group</Text>
                            ) : null}
                            <Text style={settingsStyles.rowHint}>
                              {maskApiKey(key.key)} · Group: {key.group?.name ?? key.group_id ?? "none"}
                            </Text>
                            <Text style={settingsStyles.rowHint}>Used: {formatUsd(key.quota_used)}</Text>
                          </View>
                          <View style={styles.keyActions}>
                            <Pressable
                              onPress={() => openEditKey(key)}
                              style={({ pressed }) => [
                                styles.secondaryButton,
                                pressed && styles.buttonPressed,
                                updateKeyMutation.isPending && styles.disabledButton,
                              ]}
                              disabled={updateKeyMutation.isPending}
                            >
                              <Text style={styles.secondaryButtonText}>Edit</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => void handleUseKey(key)}
                              style={({ pressed }) => [
                                isKeyInUse ? styles.useKeyButtonUsed : styles.primaryButton,
                                pressed && !isKeyInUse && styles.buttonPressed,
                                !isKeyInUse && switchingKeyId === key.id && styles.disabledButton,
                              ]}
                              disabled={isKeyInUse || switchingKeyId === key.id}
                            >
                              <Text
                                style={isKeyInUse ? styles.useKeyButtonUsedText : styles.primaryButtonText}
                              >
                                {isKeyInUse
                                  ? "Used"
                                  : switchingKeyId === key.id
                                    ? "Applying…"
                                    : "Use key"}
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
                      );
                    })}
                  </View>
                )}
              </View>
            </View>
          </SettingsSection>

          <AdaptiveModalSheet
            title="Edit API key"
            visible={editingKey !== null}
            onClose={closeEditKey}
            desktopMaxWidth={440}
          >
            <Text style={styles.fieldLabel}>Name</Text>
            <AdaptiveTextInput
              value={editKeyName}
              onChangeText={setEditKeyName}
              placeholder="Key name"
              placeholderTextColor={theme.colors.foregroundMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.textInput}
            />
            <Text style={styles.fieldLabel}>Group</Text>
            {groups.map((group) => {
              const selected = editKeyGroupId === group.id;
              return (
                <Pressable
                  key={group.id}
                  onPress={() => setEditKeyGroupId(group.id)}
                  style={({ pressed }) => [
                    styles.editKeyGroupRow,
                    selected && styles.editKeyGroupRowSelected,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Text style={settingsStyles.rowTitle}>{group.name}</Text>
                  <Text style={settingsStyles.rowHint}>
                    {group.platform} · {group.rate_multiplier}x
                  </Text>
                </Pressable>
              );
            })}
            <View style={styles.formActions}>
              <Pressable
                onPress={closeEditKey}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleSaveEditKey()}
                style={({ pressed }) => [
                  styles.primaryButton,
                  pressed && styles.buttonPressed,
                  updateKeyMutation.isPending && styles.disabledButton,
                ]}
                disabled={updateKeyMutation.isPending}
              >
                <Text style={styles.primaryButtonText}>
                  {updateKeyMutation.isPending ? "Saving…" : "Save"}
                </Text>
              </Pressable>
            </View>
          </AdaptiveModalSheet>
        </>
      ) : null}

      <Sub2APIModelsSection />

      {isLoggedIn ? (
        <Sub2APIPayModal
          visible={isPayModalOpen}
          endpoint={auth?.endpoint ?? serviceEndpoint}
          accessToken={payToken}
          onClose={() => setIsPayModalOpen(false)}
          onCompleted={handlePayCompleted}
        />
      ) : null}
    </>
  );
}
