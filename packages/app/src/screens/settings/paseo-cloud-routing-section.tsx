import React from "react";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { invokeDesktopCommand } from "@/desktop/electron/invoke";
import {
  useCreateSub2APIKeyMutation,
  useSub2APIAvailableGroups,
  useSub2APIKeys,
} from "@/hooks/use-sub2api-api";
import { SettingsSection } from "@/screens/settings/settings-section";
import { useDesktopProvidersStore } from "@/screens/settings/desktop-providers-context";
import {
  findReusableKey,
  getErrorMessage,
  maskApiKey,
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

type PaseoCloudRoutingSectionProps = {
  authEndpoint?: string | null;
  serviceEndpoint: string;
};

const SCOPE_OPTIONS: Array<{
  value: ManagedCloudDesktopScope;
  label: string;
  testID: string;
}> = [
  { value: "claude", label: "Claude Code", testID: "sub2api-routing-tab-claude" },
  { value: "codex", label: "Codex", testID: "sub2api-routing-tab-codex" },
];

export function PaseoCloudRoutingSection({
  authEndpoint,
  serviceEndpoint,
}: PaseoCloudRoutingSectionProps) {
  const { loadProviders, activeClaudeProvider, activeCodexProvider } = useDesktopProvidersStore();
  const [activeScope, setActiveScope] = useState<ManagedCloudDesktopScope>("claude");
  const [switchingGroupId, setSwitchingGroupId] = useState<number | null>(null);
  const groupsQuery = useSub2APIAvailableGroups();
  const keysQuery = useSub2APIKeys(1, 200);
  const createKeyMutation = useCreateSub2APIKeyMutation();

  const keys = useMemo(() => keysQuery.data?.items ?? [], [keysQuery.data?.items]);
  const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);
  const scopeMeta = getManagedCloudMetaForScope(activeScope);
  const activeScopeApiKey =
    activeScope === "claude"
      ? (activeClaudeProvider?.apiKey?.trim() ?? null)
      : (activeCodexProvider?.apiKey?.trim() ?? null);

  const scopedGroups = useMemo(
    () =>
      groups.filter((group) => {
        const route = resolveManagedCloudRouteForGroup(group);
        return route.ok && route.scope === activeScope;
      }),
    [activeScope, groups],
  );

  const scopedKeys = useMemo(
    () =>
      keys.filter((key) => {
        const route = resolveManagedCloudRouteForKey(key, groups);
        return route.ok && route.scope === activeScope;
      }),
    [activeScope, groups, keys],
  );

  const groupCards = useMemo(() => {
    return scopedGroups
      .map((group) => {
        const groupKeys = scopedKeys.filter((key) => key.group_id === group.id);
        const activeKey =
          activeScopeApiKey == null
            ? null
            : (groupKeys.find((key) => key.key.trim() === activeScopeApiKey) ?? null);
        return {
          group,
          groupKeys,
          activeKey,
        };
      })
      .sort((a, b) => Number(b.activeKey !== null) - Number(a.activeKey !== null));
  }, [activeScopeApiKey, scopedGroups, scopedKeys]);

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

  const handleUseGroup = useCallback(
    async (groupId: number) => {
      const group = groups.find((entry) => entry.id === groupId);
      if (!group) {
        Alert.alert("Cannot use group", "The selected group is no longer available.");
        return;
      }

      const resolved = resolveManagedCloudRouteForGroup(group);
      if (!resolved.ok) {
        Alert.alert("Cannot use group", resolved.reason);
        return;
      }
      if (resolved.scope !== activeScope) {
        const targetMeta = getManagedCloudMetaForScope(resolved.scope);
        Alert.alert(
          "Use the other tab",
          `Group "${group.name}" belongs to ${targetMeta.cliLabel}. Switch tabs to apply it there.`,
        );
        return;
      }

      setSwitchingGroupId(group.id);
      try {
        const reusable = findReusableKey(keys, group.id);
        const keyToUse =
          reusable ??
          (await createKeyMutation.mutateAsync({
            name: `${group.name} Key`,
            group_id: group.id,
          }));

        await setupDefaultProviderWithKey(keyToUse.key, activeScope, group.name);
        await keysQuery.refetch();
        Alert.alert(
          "Switched",
          `Group "${group.name}" now configures ${scopeMeta.cliLabel} only. Updated ${scopeMeta.configTarget}.`,
        );
      } catch (error) {
        Alert.alert("Switch failed", getErrorMessage(error));
      } finally {
        setSwitchingGroupId(null);
      }
    },
    [
      activeScope,
      createKeyMutation,
      groups,
      keys,
      keysQuery,
      scopeMeta.cliLabel,
      scopeMeta.configTarget,
      setupDefaultProviderWithKey,
    ],
  );

  return (
    <SettingsSection title="Routing">
      <View style={[settingsStyles.card, styles.cardBody]}>
        <Text style={styles.sectionHint}>
          Select a routing group explicitly for one CLI at a time. There is no route selector in the
          key list anymore.
        </Text>

        <View style={styles.tabBar}>
          <SegmentedControl
            options={SCOPE_OPTIONS}
            value={activeScope}
            onValueChange={(value) => setActiveScope(value)}
            size="sm"
            testID="sub2api-routing-tabs"
          />
        </View>

        <Text style={styles.usageHint}>
          Current tab: <Text style={styles.sectionHintEm}>{scopeMeta.cliLabel}</Text> using{" "}
          <Text style={styles.sectionHintEm}>{scopeMeta.platform}</Text> groups only.
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
        ) : groupsQuery.isLoading ? (
          <Text style={styles.usageHint}>Loading groups…</Text>
        ) : groupCards.length === 0 ? (
          <Text style={styles.usageHint}>
            No {scopeMeta.platform} routing groups are available for {scopeMeta.cliLabel}.
          </Text>
        ) : (
          <View style={styles.keyRowList}>
            {groupCards.map(({ group, groupKeys, activeKey }) => {
              const isApplying = switchingGroupId === group.id;
              return (
                <View key={group.id} style={styles.keyRow}>
                  <View style={settingsStyles.rowContent}>
                    <Text style={settingsStyles.rowTitle}>{group.name}</Text>
                    <Text style={settingsStyles.rowHint}>
                      {group.platform} · {group.rate_multiplier}x
                    </Text>
                    {activeKey ? (
                      <Text style={styles.activeProviderText}>
                        Active route via {maskApiKey(activeKey.key)}
                      </Text>
                    ) : groupKeys.length > 0 ? (
                      <Text style={styles.usageHint}>
                        {groupKeys.length} key{groupKeys.length === 1 ? "" : "s"} available for
                        reuse
                      </Text>
                    ) : (
                      <Text style={styles.usageHint}>
                        No existing key yet. Use group will create one automatically.
                      </Text>
                    )}
                    <Text style={styles.usageHint}>
                      Writes <Text style={styles.sectionHintEm}>{scopeMeta.configTarget}</Text>
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => void handleUseGroup(group.id)}
                    style={({ pressed }) => [
                      activeKey ? styles.useKeyButtonUsed : styles.primaryButton,
                      pressed && !activeKey && styles.buttonPressed,
                      (activeKey || isApplying || switchingGroupId !== null) &&
                        styles.disabledButton,
                    ]}
                    disabled={activeKey !== null || isApplying || switchingGroupId !== null}
                    testID={`sub2api-use-group-${activeScope}-${group.id}`}
                  >
                    <Text
                      style={activeKey ? styles.useKeyButtonUsedText : styles.primaryButtonText}
                    >
                      {isApplying
                        ? "Applying…"
                        : activeKey
                          ? `Active · ${scopeMeta.cliLabel}`
                          : "Use group"}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </SettingsSection>
  );
}
