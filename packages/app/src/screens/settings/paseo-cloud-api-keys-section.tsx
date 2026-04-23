import React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ComboSelect } from "@/components/agent-form/agent-form-dropdowns";
import { AdaptiveModalSheet, AdaptiveTextInput } from "@/components/adaptive-modal-sheet";
import { invokeDesktopCommand } from "@/desktop/electron/invoke";
import {
  useCreateSub2APIKeyMutation,
  useDeleteSub2APIKeyMutation,
  useSub2APIAvailableGroups,
  useSub2APIKeys,
  useUpdateSub2APIKeyMutation,
} from "@/hooks/use-sub2api-api";
import type { Sub2APIKey } from "@/lib/sub2api-client";
import { SettingsSection } from "@/screens/settings/settings-section";
import { useDesktopProvidersStore } from "@/screens/settings/desktop-providers-context";
import {
  findReusableKey,
  formatUsd,
  getErrorMessage,
  maskApiKey,
  normalizeFilter,
} from "@/screens/settings/managed-provider-settings-shared";
import { managedProviderSettingsStyles as styles } from "@/screens/settings/managed-provider-settings-styles";
import {
  getManagedCloudMetaForScope,
  resolveManagedCloudRouteForGroup,
  resolveManagedCloudRouteForKey,
  type ManagedCloudDesktopScope,
} from "@/screens/settings/managed-cloud-scope";
import { settingsStyles } from "@/styles/settings";
import { isValidSub2APIEndpoint } from "./sub2api-auth-bridge";

type PaseoCloudApiKeysSectionProps = {
  authEndpoint?: string | null;
  serviceEndpoint: string;
};

const SCOPE_OPTIONS: Array<{
  value: ManagedCloudDesktopScope;
  label: string;
  testID: string;
}> = [
  { value: "claude", label: "Claude Code", testID: "sub2api-api-keys-tab-claude" },
  { value: "codex", label: "Codex", testID: "sub2api-api-keys-tab-codex" },
];

export function PaseoCloudApiKeysSection({
  authEndpoint,
  serviceEndpoint,
}: PaseoCloudApiKeysSectionProps) {
  const { theme } = useUnistyles();
  const { loadProviders, activeClaudeProvider, activeCodexProvider } = useDesktopProvidersStore();
  const [activeScope, setActiveScope] = useState<ManagedCloudDesktopScope>("claude");
  const [keyFilter, setKeyFilter] = useState("");
  const [groupFilterId, setGroupFilterId] = useState<number | null>(null);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editingKey, setEditingKey] = useState<Sub2APIKey | null>(null);
  const [draftName, setDraftName] = useState("Paseo Desktop");
  const [draftGroupId, setDraftGroupId] = useState<number | null>(null);
  const [switchingKeyId, setSwitchingKeyId] = useState<number | null>(null);

  const keysQuery = useSub2APIKeys(1, 200);
  const groupsQuery = useSub2APIAvailableGroups();
  const createKeyMutation = useCreateSub2APIKeyMutation();
  const updateKeyMutation = useUpdateSub2APIKeyMutation();
  const deleteKeyMutation = useDeleteSub2APIKeyMutation();

  const keys = useMemo(() => keysQuery.data?.items ?? [], [keysQuery.data?.items]);
  const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);
  const scopeMeta = getManagedCloudMetaForScope(activeScope);
  const activeScopeApiKey =
    activeScope === "claude"
      ? (activeClaudeProvider?.apiKey?.trim() ?? null)
      : (activeCodexProvider?.apiKey?.trim() ?? null);

  const groupsByScope = useMemo(
    () => ({
      claude: groups.filter((group) => {
        const route = resolveManagedCloudRouteForGroup(group);
        return route.ok && route.scope === "claude";
      }),
      codex: groups.filter((group) => {
        const route = resolveManagedCloudRouteForGroup(group);
        return route.ok && route.scope === "codex";
      }),
    }),
    [groups],
  );

  const scopedGroups = groupsByScope[activeScope];
  const groupFilterOptions = useMemo(
    () => [
      {
        id: "all",
        label: "All groups",
        description: `Show all ${scopeMeta.cliLabel} keys`,
      },
      ...scopedGroups.map((group) => ({
        id: String(group.id),
        label: group.name,
        description: `${group.platform} · ${group.rate_multiplier}x`,
      })),
    ],
    [scopeMeta.cliLabel, scopedGroups],
  );

  const keyRoutes = useMemo(
    () => new Map(keys.map((key) => [key.id, resolveManagedCloudRouteForKey(key, groups)])),
    [groups, keys],
  );

  const scopedKeys = useMemo(
    () =>
      keys.filter((key) => {
        const route = keyRoutes.get(key.id);
        return route?.ok && route.scope === activeScope;
      }),
    [activeScope, keyRoutes, keys],
  );

  const filteredKeys = useMemo(() => {
    const query = normalizeFilter(keyFilter);
    return scopedKeys.filter((key) => {
      if (groupFilterId !== null && key.group_id !== groupFilterId) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        key.name.toLowerCase().includes(query) ||
        (key.group?.name?.toLowerCase().includes(query) ?? false) ||
        maskApiKey(key.key).toLowerCase().includes(query)
      );
    });
  }, [groupFilterId, keyFilter, scopedKeys]);

  useEffect(() => {
    if (groupFilterId !== null && !scopedGroups.some((group) => group.id === groupFilterId)) {
      setGroupFilterId(null);
    }
  }, [groupFilterId, scopedGroups]);

  useEffect(() => {
    if (!createModalVisible && !editingKey) {
      return;
    }
    if (draftGroupId !== null && scopedGroups.some((group) => group.id === draftGroupId)) {
      return;
    }
    setDraftGroupId(scopedGroups[0]?.id ?? null);
  }, [createModalVisible, draftGroupId, editingKey, scopedGroups]);

  const setupDefaultProviderWithKey = useCallback(
    async (apiKey: string, scope: ManagedCloudDesktopScope, name?: string) => {
      const targetEndpoint = authEndpoint ?? serviceEndpoint;
      if (!isValidSub2APIEndpoint(targetEndpoint)) {
        throw new Error("Service endpoint is invalid.");
      }

      await invokeDesktopCommand("setup_default_provider", {
        endpoint: targetEndpoint,
        apiKey,
        scope,
        ...(name ? { name } : {}),
      });
      await loadProviders();
    },
    [authEndpoint, loadProviders, serviceEndpoint],
  );

  const closeModal = useCallback(() => {
    setCreateModalVisible(false);
    setEditingKey(null);
    setDraftName("Paseo Desktop");
    setDraftGroupId(scopedGroups[0]?.id ?? null);
  }, [scopedGroups]);

  const openCreateModal = useCallback(() => {
    setEditingKey(null);
    setDraftName("Paseo Desktop");
    setDraftGroupId(groupFilterId ?? scopedGroups[0]?.id ?? null);
    setCreateModalVisible(true);
  }, [groupFilterId, scopedGroups]);

  const openEditModal = useCallback(
    (key: Sub2APIKey) => {
      setCreateModalVisible(false);
      setEditingKey(key);
      setDraftName(key.name);
      setDraftGroupId(key.group_id ?? scopedGroups[0]?.id ?? null);
    },
    [scopedGroups],
  );

  const handleSaveKey = useCallback(async () => {
    const name = draftName.trim();
    if (!name) {
      Alert.alert("Missing name", "Please enter a key name.");
      return;
    }
    if (draftGroupId === null) {
      Alert.alert("Missing group", "Select a group for this key.");
      return;
    }

    try {
      if (editingKey) {
        await updateKeyMutation.mutateAsync({
          id: editingKey.id,
          patch: { name, group_id: draftGroupId },
        });
      } else {
        await createKeyMutation.mutateAsync({
          name,
          group_id: draftGroupId,
        });
      }
      closeModal();
    } catch (error) {
      Alert.alert(editingKey ? "Update failed" : "Create key failed", getErrorMessage(error));
    }
  }, [closeModal, createKeyMutation, draftGroupId, draftName, editingKey, updateKeyMutation]);

  const handleUseKey = useCallback(
    async (key: Sub2APIKey) => {
      const resolved = keyRoutes.get(key.id) ?? resolveManagedCloudRouteForKey(key, groups);
      if (!resolved.ok) {
        Alert.alert("Cannot apply key", resolved.reason);
        return;
      }
      if (resolved.scope !== activeScope) {
        const targetMeta = getManagedCloudMetaForScope(resolved.scope);
        Alert.alert(
          "Use the other tab",
          `Key "${key.name}" belongs to ${targetMeta.cliLabel}. Switch tabs to apply it there.`,
        );
        return;
      }

      setSwitchingKeyId(key.id);
      try {
        await setupDefaultProviderWithKey(key.key, activeScope, key.group?.name ?? key.name);
        Alert.alert(
          "Switched",
          `Paseo Cloud key "${key.name}" now configures ${scopeMeta.cliLabel} only. Updated ${scopeMeta.configTarget}.`,
        );
      } catch (error) {
        Alert.alert("Switch failed", getErrorMessage(error));
      } finally {
        setSwitchingKeyId(null);
      }
    },
    [
      activeScope,
      groups,
      keyRoutes,
      scopeMeta.cliLabel,
      scopeMeta.configTarget,
      setupDefaultProviderWithKey,
    ],
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

  const modalVisible = createModalVisible || editingKey !== null;

  return (
    <>
      <SettingsSection title="API Keys">
        <View style={[settingsStyles.card, styles.cardBody]}>
          <View style={styles.statusRow}>
            <View style={settingsStyles.rowContent}>
              <Text style={styles.formTitle}>{scopeMeta.cliLabel}</Text>
              <Text style={styles.sectionHint}>
                Manage only the {scopeMeta.platform} keys that can route{" "}
                <Text style={styles.sectionHintEm}>{scopeMeta.cliLabel}</Text> on this device.
              </Text>
            </View>
            <Pressable
              onPress={openCreateModal}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
                scopedGroups.length === 0 && styles.disabledButton,
              ]}
              disabled={scopedGroups.length === 0}
              testID="sub2api-open-create-key-modal"
            >
              <Text style={styles.primaryButtonText}>Create API key</Text>
            </Pressable>
          </View>

          <View style={styles.tabBar}>
            <SegmentedControl
              options={SCOPE_OPTIONS}
              value={activeScope}
              onValueChange={(value) => setActiveScope(value)}
              size="sm"
              testID="sub2api-api-key-tabs"
            />
          </View>

          <Text style={styles.usageHint}>
            This page only filters and manages keys. It does not change CLI routing until you press{" "}
            <Text style={styles.sectionHintEm}>Use key</Text>.
          </Text>

          <View style={styles.groupPickerBlock}>
            <Text style={styles.fieldLabel}>Search</Text>
            <TextInput
              value={keyFilter}
              onChangeText={setKeyFilter}
              placeholder={`Search ${scopeMeta.platform} keys by name or group`}
              placeholderTextColor={theme.colors.foregroundMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.textInput}
            />
            <View style={styles.groupComboWrap}>
              <ComboSelect
                label="Filter by group"
                title={`Filter ${scopeMeta.cliLabel} keys by group`}
                value={groupFilterId != null ? String(groupFilterId) : "all"}
                options={groupFilterOptions}
                placeholder="All groups"
                isLoading={groupsQuery.isFetching}
                onSelect={(id) => setGroupFilterId(id === "all" ? null : Number(id))}
                showLabel
                testID={`sub2api-key-filter-group-${activeScope}`}
              />
            </View>
          </View>

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
          ) : keysQuery.isLoading ? (
            <Text style={styles.usageHint}>Loading keys…</Text>
          ) : filteredKeys.length === 0 ? (
            <Text style={styles.usageHint}>
              No {scopeMeta.cliLabel} keys match this filter. Create a key above, or clear the
              current filters.
            </Text>
          ) : (
            <View style={styles.keyRowList}>
              {filteredKeys.map((key) => {
                const keyRoute =
                  keyRoutes.get(key.id) ?? resolveManagedCloudRouteForKey(key, groups);
                const trimmedKey = key.key.trim();
                const activeForScope = activeScopeApiKey === trimmedKey;
                const applying = switchingKeyId === key.id;
                return (
                  <View key={key.id} style={styles.keyRow}>
                    <View style={settingsStyles.rowContent}>
                      <Text style={settingsStyles.rowTitle}>{key.name}</Text>
                      <Text style={settingsStyles.rowHint}>
                        {maskApiKey(key.key)} · Group: {key.group?.name ?? key.group_id ?? "none"}
                      </Text>
                      <Text style={settingsStyles.rowHint}>Used: {formatUsd(key.quota_used)}</Text>
                      {keyRoute.ok ? (
                        <Text style={styles.usageHint}>
                          Writes <Text style={styles.sectionHintEm}>{scopeMeta.configTarget}</Text>
                        </Text>
                      ) : (
                        <Text style={styles.errorHint}>{keyRoute.reason}</Text>
                      )}
                      {activeForScope ? (
                        <Text style={styles.activeProviderText}>
                          Active for {scopeMeta.cliLabel} on this device
                        </Text>
                      ) : null}
                    </View>
                    <View style={[styles.keyActions, { maxWidth: 220 }]}>
                      <Pressable
                        onPress={() => openEditModal(key)}
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
                          activeForScope ? styles.useKeyButtonUsed : styles.primaryButton,
                          pressed && !activeForScope && styles.buttonPressed,
                          (applying || switchingKeyId !== null || !keyRoute.ok) &&
                            styles.disabledButton,
                        ]}
                        disabled={
                          activeForScope || applying || switchingKeyId !== null || !keyRoute.ok
                        }
                        testID={`sub2api-use-key-${activeScope}-${key.id}`}
                      >
                        <Text
                          style={
                            activeForScope ? styles.useKeyButtonUsedText : styles.primaryButtonText
                          }
                        >
                          {applying
                            ? "Applying…"
                            : activeForScope
                              ? `Active · ${scopeMeta.cliLabel}`
                              : "Use key"}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void handleDeleteKey(key.id)}
                        style={({ pressed }) => [
                          styles.removeButton,
                          pressed && styles.buttonPressed,
                        ]}
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
      </SettingsSection>

      <AdaptiveModalSheet
        title={editingKey ? "Edit API key" : "Create API key"}
        visible={modalVisible}
        onClose={closeModal}
        desktopMaxWidth={440}
        testID="sub2api-key-modal"
      >
        <Text style={styles.usageHint}>
          {editingKey
            ? `Update the ${scopeMeta.platform} key details used for ${scopeMeta.cliLabel}.`
            : `Create a new ${scopeMeta.platform} key for ${scopeMeta.cliLabel}.`}
        </Text>
        <Text style={styles.fieldLabel}>Name</Text>
        <AdaptiveTextInput
          value={draftName}
          onChangeText={setDraftName}
          placeholder="Key name"
          placeholderTextColor={theme.colors.foregroundMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.textInput}
        />
        <View style={styles.groupComboWrap}>
          <ComboSelect
            label="Group"
            title={`Select group for ${scopeMeta.cliLabel} key`}
            value={draftGroupId != null ? String(draftGroupId) : ""}
            options={scopedGroups.map((group) => ({
              id: String(group.id),
              label: group.name,
              description: `${group.platform} · ${group.rate_multiplier}x`,
            }))}
            placeholder={`Select a ${scopeMeta.platform} group…`}
            isLoading={groupsQuery.isFetching}
            onSelect={(id) => setDraftGroupId(Number(id))}
            showLabel
            testID={`sub2api-key-modal-group-${activeScope}`}
          />
        </View>
        <View style={styles.formActions}>
          <Pressable
            onPress={closeModal}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => void handleSaveKey()}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
              (draftGroupId === null ||
                createKeyMutation.isPending ||
                updateKeyMutation.isPending) &&
                styles.disabledButton,
            ]}
            disabled={
              draftGroupId === null || createKeyMutation.isPending || updateKeyMutation.isPending
            }
          >
            <Text style={styles.primaryButtonText}>
              {createKeyMutation.isPending || updateKeyMutation.isPending
                ? "Saving…"
                : editingKey
                  ? "Save"
                  : "Create"}
            </Text>
          </Pressable>
        </View>
      </AdaptiveModalSheet>
    </>
  );
}
