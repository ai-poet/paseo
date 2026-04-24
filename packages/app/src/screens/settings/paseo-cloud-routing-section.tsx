import React from "react";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { invokeDesktopCommand } from "@/desktop/electron/invoke";
import {
  useCreateSub2APIKeyMutation,
  useSub2APIAvailableGroups,
  useSub2APIGroupStatuses,
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

function normalizeRuntimeStatus(
  status: string | null | undefined,
): "up" | "degraded" | "down" | "unknown" {
  switch (status) {
    case "up":
    case "degraded":
    case "down":
      return status;
    default:
      return "unknown";
  }
}

function getRuntimeStatusRank(status: string | null | undefined): number {
  switch (normalizeRuntimeStatus(status)) {
    case "up":
      return 3;
    case "degraded":
      return 2;
    case "down":
      return 1;
    default:
      return 0;
  }
}

function formatAvailability(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return `${value.toFixed(value >= 99 ? 2 : 1)}%`;
}

function formatLatency(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }
  return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)} s`;
}

export function PaseoCloudRoutingSection({
  authEndpoint,
  serviceEndpoint,
}: PaseoCloudRoutingSectionProps) {
  const { loadProviders, activeClaudeProvider, activeCodexProvider } = useDesktopProvidersStore();
  const [activeScope, setActiveScope] = useState<ManagedCloudDesktopScope>("claude");
  const [switchingGroupId, setSwitchingGroupId] = useState<number | null>(null);
  const groupsQuery = useSub2APIAvailableGroups();
  const keysQuery = useSub2APIKeys(1, 200);
  const statusesQuery = useSub2APIGroupStatuses();
  const createKeyMutation = useCreateSub2APIKeyMutation();

  const keys = useMemo(() => keysQuery.data?.items ?? [], [keysQuery.data?.items]);
  const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);
  const statuses = useMemo(() => statusesQuery.data ?? [], [statusesQuery.data]);
  const scopeMeta = getManagedCloudMetaForScope(activeScope);
  const activeScopeApiKey =
    activeScope === "claude"
      ? (activeClaudeProvider?.apiKey?.trim() ?? null)
      : (activeCodexProvider?.apiKey?.trim() ?? null);
  const statusByGroupId = useMemo(
    () => new Map(statuses.map((item) => [item.group_id, item])),
    [statuses],
  );

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
    const sorted = scopedGroups
      .map((group) => {
        const groupKeys = scopedKeys.filter((key) => key.group_id === group.id);
        const activeKey =
          activeScopeApiKey == null
            ? null
            : (groupKeys.find((key) => key.key.trim() === activeScopeApiKey) ?? null);
        const status = statusByGroupId.get(group.id) ?? null;
        return {
          group,
          groupKeys,
          activeKey,
          status,
        };
      })
      .sort((a, b) => {
        const activeDelta = Number(b.activeKey !== null) - Number(a.activeKey !== null);
        if (activeDelta !== 0) {
          return activeDelta;
        }
        const statusDelta =
          getRuntimeStatusRank(b.status?.stable_status ?? b.status?.latest_status) -
          getRuntimeStatusRank(a.status?.stable_status ?? a.status?.latest_status);
        if (statusDelta !== 0) {
          return statusDelta;
        }
        const availabilityDelta =
          (b.status?.availability_24h ?? -1) - (a.status?.availability_24h ?? -1);
        if (availabilityDelta !== 0) {
          return availabilityDelta;
        }
        const priceDelta = a.group.rate_multiplier - b.group.rate_multiplier;
        if (priceDelta !== 0) {
          return priceDelta;
        }
        return (
          (a.status?.latency_ms ?? Number.MAX_SAFE_INTEGER) -
          (b.status?.latency_ms ?? Number.MAX_SAFE_INTEGER)
        );
      });

    const recommendedGroupId =
      sorted.find(
        (card) =>
          card.activeKey === null &&
          getRuntimeStatusRank(card.status?.stable_status ?? card.status?.latest_status) > 0,
      )?.group.id ?? null;

    return sorted.map((card) => ({
      ...card,
      recommended: card.group.id === recommendedGroupId,
    }));
  }, [activeScopeApiKey, scopedGroups, scopedKeys, statusByGroupId]);

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
            {groupCards.map(({ group, groupKeys, activeKey, recommended, status }) => {
              const isApplying = switchingGroupId === group.id;
              const stableStatus = normalizeRuntimeStatus(
                status?.stable_status ?? status?.latest_status,
              );
              return (
                <View key={group.id} style={styles.keyRow}>
                  <View style={settingsStyles.rowContent}>
                    <View style={styles.scopeActionsRow}>
                      <Text style={settingsStyles.rowTitle}>{group.name}</Text>
                      {recommended ? (
                        <Text style={[styles.infoBadge, styles.infoBadgeAccent]}>Recommended</Text>
                      ) : null}
                      {status ? (
                        <Text
                          style={[
                            styles.infoBadge,
                            stableStatus === "up"
                              ? styles.infoBadgeSuccess
                              : stableStatus === "degraded"
                                ? styles.infoBadgeWarning
                                : stableStatus === "down"
                                  ? styles.infoBadgeDanger
                                  : styles.infoBadgeNeutral,
                          ]}
                        >
                          {stableStatus.toUpperCase()}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={settingsStyles.rowHint}>
                      {group.platform} · {group.rate_multiplier}x
                    </Text>
                    {status ? (
                      <View style={styles.scopeActionsRow}>
                        <Text style={styles.usageHint}>
                          24h {formatAvailability(status.availability_24h)}
                        </Text>
                        <Text style={styles.usageHint}>
                          7d {formatAvailability(status.availability_7d)}
                        </Text>
                        <Text style={styles.usageHint}>
                          Latency {formatLatency(status.latency_ms)}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.usageHint}>
                        Runtime status has not been observed yet for this group.
                      </Text>
                    )}
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
                    {recommended ? (
                      <Text style={styles.routeInsightText}>
                        Best available option right now for {scopeMeta.cliLabel} based on health,
                        latency, and price.
                      </Text>
                    ) : null}
                    {stableStatus === "down" ? (
                      <Text style={styles.errorHint}>
                        Recent probes look unhealthy. Prefer another group unless you specifically
                        need this route.
                      </Text>
                    ) : null}
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
