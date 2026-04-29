import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { useSub2APIAuth } from "@/hooks/use-sub2api-auth";
import { useSub2APIGroupStatuses, useSub2APIModelCatalog } from "@/hooks/use-sub2api-api";
import { CLOUD_NAME } from "@/config/branding";
import {
  buildGroupFirstModelCatalog,
  type GroupFirstCatalogGroup,
} from "@/screens/settings/paseo-cloud-catalog-utils";

type PlatformFilter = "anthropic" | "openai";
type SelectedGroup = number | "all" | null;

const PLATFORM_OPTIONS = [
  {
    value: "anthropic" as const,
    label: "Claude",
    testID: "paseo-cloud-catalog-tab-claude",
  },
  {
    value: "openai" as const,
    label: "Codex",
    testID: "paseo-cloud-catalog-tab-codex",
  },
];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatUsd(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return `$${value.toFixed(value >= 10 ? 2 : 4)}`;
}

function formatAvailability(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }
  return `${value.toFixed(value >= 99 ? 2 : 1)}%`;
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function matchesModelSearch(
  input: { model: string; display_name: string; platform: string },
  query: string,
): boolean {
  if (!query) {
    return true;
  }
  return [input.model, input.display_name, input.platform].some((value) =>
    value.toLowerCase().includes(query),
  );
}

function GroupStatusLine({ group }: { group: GroupFirstCatalogGroup }) {
  const status = group.status;
  if (!status) {
    return <Text style={styles.usageHint}>Runtime status has not been observed yet.</Text>;
  }
  return (
    <View style={styles.statusMetricsRow}>
      <Text style={styles.usageHint}>
        Status {(status.stable_status || status.latest_status || "unknown").toUpperCase()}
      </Text>
      <Text style={styles.usageHint}>24h {formatAvailability(status.availability_24h)}</Text>
      <Text style={styles.usageHint}>7d {formatAvailability(status.availability_7d)}</Text>
    </View>
  );
}

export function Sub2APIModelsSection() {
  const { theme } = useUnistyles();
  const { isLoggedIn } = useSub2APIAuth();
  const statusesQuery = useSub2APIGroupStatuses();
  const catalogQuery = useSub2APIModelCatalog();
  const [platform, setPlatform] = useState<PlatformFilter>("anthropic");
  const [selectedGroup, setSelectedGroup] = useState<SelectedGroup>(null);
  const [search, setSearch] = useState("");

  const catalogItems = catalogQuery.data?.items ?? [];
  const summary = catalogQuery.data?.summary;

  const groupCatalog = useMemo(
    () =>
      buildGroupFirstModelCatalog({
        catalog: catalogQuery.data,
        statuses: statusesQuery.data,
        platform,
      }),
    [catalogQuery.data, platform, statusesQuery.data],
  );

  useEffect(() => {
    if (selectedGroup === "all") {
      return;
    }
    if (
      typeof selectedGroup === "number" &&
      groupCatalog.groups.some((group) => group.group.id === selectedGroup)
    ) {
      return;
    }
    setSelectedGroup(groupCatalog.groups[0]?.group.id ?? "all");
  }, [groupCatalog.groups, selectedGroup]);

  const selectedGroupRecord =
    typeof selectedGroup === "number"
      ? (groupCatalog.groups.find((group) => group.group.id === selectedGroup) ?? null)
      : null;
  const normalizedSearch = useMemo(() => normalizeSearch(search), [search]);
  const selectedModels = useMemo(() => {
    if (selectedGroup === "all") {
      return groupCatalog.allModels.filter((item) => matchesModelSearch(item, normalizedSearch));
    }
    return (selectedGroupRecord?.models ?? []).filter((entry) =>
      matchesModelSearch(entry.item, normalizedSearch),
    );
  }, [groupCatalog.allModels, normalizedSearch, selectedGroup, selectedGroupRecord?.models]);
  const isLoading = catalogQuery.isLoading || statusesQuery.isLoading;
  const error = catalogQuery.error || statusesQuery.error;

  return (
    <SettingsSection title="Model catalog">
      {!isLoggedIn ? (
        <View style={[settingsStyles.card, styles.cardBody]}>
          <Text style={styles.hintText}>Sign in to {CLOUD_NAME} to browse the model catalog.</Text>
        </View>
      ) : null}

      {isLoggedIn ? (
        <View style={[settingsStyles.card, styles.cardBody]}>
          {isLoading ? (
            <Text style={styles.hintText}>Loading catalog...</Text>
          ) : error ? (
            <View style={styles.errorBlock}>
              <Text style={styles.errorText}>{getErrorMessage(error)}</Text>
            </View>
          ) : catalogItems.length === 0 ? (
            <Text style={styles.hintText}>No models available.</Text>
          ) : (
            <>
              {summary ? (
                <View style={styles.summaryGrid}>
                  <Text style={styles.summaryCell}>Models: {summary.total_models}</Text>
                  <Text style={styles.summaryCell}>Token: {summary.token_models}</Text>
                  <Text style={styles.summaryCell}>Non-token: {summary.non_token_models}</Text>
                  <Text style={styles.summaryCell}>
                    Best savings: {summary.max_savings_percent.toFixed(1)}%
                  </Text>
                </View>
              ) : null}

              <SegmentedControl
                options={PLATFORM_OPTIONS}
                value={platform}
                onValueChange={(value) => setPlatform(value)}
                size="sm"
                testID="paseo-cloud-catalog-platform-tabs"
              />

              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search models in this group"
                placeholderTextColor={theme.colors.foregroundMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.textInput}
              />

              <View style={styles.groupLayout}>
                <View style={styles.groupList}>
                  {groupCatalog.groups.map((group) => {
                    const selected = selectedGroup === group.group.id;
                    const statusLabel = group.status?.stable_status || group.status?.latest_status;
                    return (
                      <Pressable
                        key={group.group.id}
                        onPress={() => setSelectedGroup(group.group.id)}
                        style={({ pressed }) => [
                          styles.groupButton,
                          selected && styles.groupButtonActive,
                          pressed && !selected && styles.groupButtonPressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.groupButtonTitle,
                            selected && styles.groupButtonTitleActive,
                          ]}
                          numberOfLines={1}
                        >
                          {group.group.name}
                        </Text>
                        <Text style={styles.groupButtonHint} numberOfLines={1}>
                          {group.models.length} models · {group.group.rate_multiplier}x
                          {statusLabel ? ` · ${statusLabel}` : ""}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    onPress={() => setSelectedGroup("all")}
                    style={({ pressed }) => [
                      styles.groupButton,
                      selectedGroup === "all" && styles.groupButtonActive,
                      pressed && selectedGroup !== "all" && styles.groupButtonPressed,
                    ]}
                    testID="paseo-cloud-catalog-all-models"
                  >
                    <Text
                      style={[
                        styles.groupButtonTitle,
                        selectedGroup === "all" && styles.groupButtonTitleActive,
                      ]}
                    >
                      All models
                    </Text>
                    <Text style={styles.groupButtonHint}>
                      {groupCatalog.allModels.length} platform models
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.modelList}>
                  {selectedGroupRecord ? (
                    <View style={styles.selectedGroupHeader}>
                      <Text style={styles.selectedGroupTitle}>
                        {selectedGroupRecord.group.name}
                      </Text>
                      <Text style={styles.usageHint}>
                        {platform} · {selectedGroupRecord.group.rate_multiplier}x
                      </Text>
                      <GroupStatusLine group={selectedGroupRecord} />
                    </View>
                  ) : (
                    <View style={styles.selectedGroupHeader}>
                      <Text style={styles.selectedGroupTitle}>All models</Text>
                      <Text style={styles.usageHint}>
                        Fallback view across all {platform} groups.
                      </Text>
                    </View>
                  )}

                  {selectedModels.length === 0 ? (
                    <Text style={styles.hintText}>No models match this search.</Text>
                  ) : (
                    selectedModels.map((entry) => {
                      const item = "item" in entry ? entry.item : entry;
                      const pricing =
                        "effectivePricing" in entry
                          ? entry.effectivePricing
                          : item.effective_pricing_usd;
                      const comparison = "comparison" in entry ? entry.comparison : item.comparison;
                      return (
                        <View
                          key={`${item.model}-${"group" in entry ? entry.group.id : "all"}`}
                          style={styles.modelRow}
                        >
                          <View style={styles.modelRowMain}>
                            <Text style={styles.modelTitle}>{item.display_name}</Text>
                            <Text style={styles.usageHint}>{item.model}</Text>
                            <Text style={styles.usageHint}>
                              Input {formatUsd(pricing.input_per_mtok_usd)} / MTok · Output{" "}
                              {formatUsd(pricing.output_per_mtok_usd)} / MTok
                            </Text>
                          </View>
                          <View style={styles.modelMeta}>
                            <Text style={styles.modelBadge}>{item.billing_mode}</Text>
                            {typeof comparison.savings_percent === "number" ? (
                              <Text style={styles.savingsText}>
                                {comparison.savings_percent.toFixed(1)}% savings
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              </View>
            </>
          )}
        </View>
      ) : null}
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  cardBody: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  hintText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  usageHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  errorBlock: {
    padding: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.destructive,
    borderRadius: theme.borderRadius.md,
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.xs,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  summaryCell: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  textInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  groupLayout: {
    flexDirection: "row",
    gap: theme.spacing[3],
    alignItems: "flex-start",
  },
  groupList: {
    width: 240,
    gap: theme.spacing[2],
  },
  groupButton: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    gap: theme.spacing[1],
  },
  groupButtonActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface2,
  },
  groupButtonPressed: {
    backgroundColor: theme.colors.surface1,
  },
  groupButtonTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  groupButtonTitleActive: {
    color: theme.colors.accent,
  },
  groupButtonHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  modelList: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[2],
  },
  selectedGroupHeader: {
    gap: theme.spacing[1],
    paddingBottom: theme.spacing[2],
  },
  selectedGroupTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  statusMetricsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  modelRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
  },
  modelRowMain: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  modelTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  modelMeta: {
    alignItems: "flex-end",
    gap: theme.spacing[1],
  },
  modelBadge: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  savingsText: {
    color: theme.colors.palette.green[400],
    fontSize: theme.fontSize.xs,
  },
}));
