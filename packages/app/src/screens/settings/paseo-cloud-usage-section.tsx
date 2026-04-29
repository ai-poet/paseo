import React from "react";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { CLOUD_NAME } from "@/config/branding";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useSub2APIAuth } from "@/hooks/use-sub2api-auth";
import { useSub2APIKeys, useSub2APIUsageLogs, useSub2APIUsageStats } from "@/hooks/use-sub2api-api";
import { useSub2APILocale } from "@/hooks/use-sub2api-locale";
import { getSub2APIMessages } from "@/i18n/sub2api";
import type { Sub2APIKey, Sub2APIUsageLog, Sub2APIUsageLogsQuery } from "@/lib/sub2api-client";
import { SettingsSection } from "@/screens/settings/settings-section";
import { formatUsd, getErrorMessage } from "@/screens/settings/managed-provider-settings-shared";
import { managedProviderSettingsStyles as sharedStyles } from "@/screens/settings/managed-provider-settings-styles";
import { settingsStyles } from "@/styles/settings";

type UsageDatePreset = "today" | "7d" | "30d";
type UsageText = ReturnType<typeof getSub2APIMessages>["paseoCloudUsage"];

const PAGE_SIZE = 20;
const DATE_PRESET_VALUES: UsageDatePreset[] = ["today", "7d", "30d"];

function formatLocalDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function buildDateRange(preset: UsageDatePreset): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date(end);
  if (preset === "7d") {
    start.setDate(start.getDate() - 6);
  } else if (preset === "30d") {
    start.setDate(start.getDate() - 29);
  }
  return {
    startDate: formatLocalDate(start),
    endDate: formatLocalDate(end),
  };
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function formatTokens(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }
  return value.toLocaleString();
}

function formatDuration(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }
  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }
  return `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)}s`;
}

function getRequestTypeLabel(log: Sub2APIUsageLog, text: UsageText): string {
  if (log.request_type === "ws_v2" || log.openai_ws_mode) {
    return text.requestTypes.ws;
  }
  if (log.request_type === "stream" || log.stream) {
    return text.requestTypes.stream;
  }
  if (log.request_type === "sync") {
    return text.requestTypes.sync;
  }
  return text.requestTypes.unknown;
}

function getBillingModeLabel(mode: string | null | undefined, text: UsageText): string {
  if (mode === "per_request") {
    return text.billingModes.perRequest;
  }
  if (mode === "image") {
    return text.billingModes.image;
  }
  return text.billingModes.token;
}

function getKeyLabel(
  keys: Sub2APIKey[],
  keyId: number | null | undefined,
  text: UsageText,
): string {
  if (typeof keyId !== "number") {
    return text.unknownKey;
  }
  return keys.find((key) => key.id === keyId)?.name ?? text.keyNumber(keyId);
}

function getUsageLogKeyName(log: Sub2APIUsageLog, keys: Sub2APIKey[], text: UsageText): string {
  const name = log.api_key?.name?.trim();
  if (name) {
    return name;
  }
  return getKeyLabel(keys, log.api_key_id, text);
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

function ApiKeyFilter({
  keys,
  selectedKeyId,
  onSelect,
  text,
}: {
  keys: Sub2APIKey[];
  selectedKeyId: number | null;
  onSelect: (keyId: number | null) => void;
  text: UsageText;
}) {
  const options = [
    { id: null, label: text.allApiKeys },
    ...keys.map((key) => ({ id: key.id, label: key.name })),
  ];
  return (
    <View style={styles.filterWrap}>
      {options.map((option) => {
        const selected = option.id === selectedKeyId;
        return (
          <Pressable
            key={option.id ?? "all"}
            onPress={() => onSelect(option.id)}
            style={({ pressed }) => [
              styles.filterPill,
              selected && styles.filterPillSelected,
              pressed && sharedStyles.buttonPressed,
            ]}
          >
            <Text style={[styles.filterPillText, selected && styles.filterPillTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function UsageLogCard({
  log,
  keys,
  text,
}: {
  log: Sub2APIUsageLog;
  keys: Sub2APIKey[];
  text: UsageText;
}) {
  const cacheTokens =
    log.cache_creation_tokens +
    log.cache_read_tokens +
    (log.cache_creation_5m_tokens ?? 0) +
    (log.cache_creation_1h_tokens ?? 0);
  const totalTokens =
    log.input_tokens + log.output_tokens + log.cache_creation_tokens + log.cache_read_tokens;

  return (
    <View style={styles.logCard}>
      <View style={styles.logHeader}>
        <View style={styles.logTitleBlock}>
          <Text style={styles.logModel} numberOfLines={1}>
            {log.model || text.unknownModel}
          </Text>
          <Text style={styles.logMeta} numberOfLines={1}>
            {getUsageLogKeyName(log, keys, text)} - {formatDateTime(log.created_at)}
          </Text>
        </View>
        <View style={styles.badgeRow}>
          <Text style={[sharedStyles.infoBadge, sharedStyles.infoBadgeAccent]}>
            {getRequestTypeLabel(log, text)}
          </Text>
          <Text style={[sharedStyles.infoBadge, sharedStyles.infoBadgeNeutral]}>
            {getBillingModeLabel(log.billing_mode, text)}
          </Text>
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>{text.tokens}</Text>
          <Text style={styles.metricValue}>{formatTokens(totalTokens)}</Text>
          <Text style={styles.metricHint}>
            {text.input} {formatTokens(log.input_tokens)} - {text.output}{" "}
            {formatTokens(log.output_tokens)}
          </Text>
        </View>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>{text.cache}</Text>
          <Text style={styles.metricValue}>{formatTokens(cacheTokens)}</Text>
          <Text style={styles.metricHint}>
            {text.write} {formatTokens(log.cache_creation_tokens)} - {text.read}{" "}
            {formatTokens(log.cache_read_tokens)}
          </Text>
        </View>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>{text.cost}</Text>
          <Text style={styles.metricValue}>{formatUsd(log.actual_cost)}</Text>
          <Text style={styles.metricHint}>
            {text.standard} {formatUsd(log.total_cost)}
          </Text>
        </View>
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>{text.latency}</Text>
          <Text style={styles.metricValue}>{formatDuration(log.duration_ms)}</Text>
          <Text style={styles.metricHint}>
            {text.first} {formatDuration(log.first_token_ms)}
          </Text>
        </View>
      </View>

      <Text style={styles.endpointText} numberOfLines={1}>
        {log.inbound_endpoint?.trim() || text.noInboundEndpoint}
      </Text>
    </View>
  );
}

export function PaseoCloudUsageSection() {
  const locale = useSub2APILocale();
  const text = useMemo(() => getSub2APIMessages(locale).paseoCloudUsage, [locale]);
  const { isLoggedIn } = useSub2APIAuth();
  const [preset, setPreset] = useState<UsageDatePreset>("7d");
  const [selectedKeyId, setSelectedKeyId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const dateRange = useMemo(() => buildDateRange(preset), [preset]);
  const usageStatsQueryInput = useMemo(
    () => ({
      period: "today" as const,
      apiKeyId: selectedKeyId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    }),
    [dateRange.endDate, dateRange.startDate, selectedKeyId],
  );
  const usageLogsQueryInput = useMemo<Sub2APIUsageLogsQuery>(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      apiKeyId: selectedKeyId,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    }),
    [dateRange.endDate, dateRange.startDate, page, selectedKeyId],
  );

  const keysQuery = useSub2APIKeys(1, 200);
  const statsQuery = useSub2APIUsageStats(usageStatsQueryInput, { enabled: isLoggedIn });
  const logsQuery = useSub2APIUsageLogs(usageLogsQueryInput, { enabled: isLoggedIn });
  const keys = keysQuery.data?.items ?? [];
  const logs = logsQuery.data?.items ?? [];
  const pages = logsQuery.data?.pages ?? 0;
  const total = logsQuery.data?.total ?? 0;
  const isLoading = keysQuery.isLoading || statsQuery.isLoading || logsQuery.isLoading;
  const error = keysQuery.error || statsQuery.error || logsQuery.error;
  const datePresetOptions = useMemo(
    () =>
      DATE_PRESET_VALUES.map((value) => ({
        value,
        label: text.datePresets[value],
      })),
    [text],
  );

  const handlePresetChange = (nextPreset: UsageDatePreset) => {
    setPreset(nextPreset);
    setPage(1);
  };

  const handleKeySelect = (keyId: number | null) => {
    setSelectedKeyId(keyId);
    setPage(1);
  };

  const handleRefresh = () => {
    void Promise.all([keysQuery.refetch(), statsQuery.refetch(), logsQuery.refetch()]);
  };

  return (
    <SettingsSection title={text.title}>
      {!isLoggedIn ? (
        <View style={[settingsStyles.card, styles.cardBody]}>
          <Text style={styles.hintText}>{text.signInHint(CLOUD_NAME)}</Text>
        </View>
      ) : null}

      {isLoggedIn ? (
        <View style={styles.sectionStack}>
          <View style={[settingsStyles.card, styles.cardBody]}>
            <View style={styles.toolbarHeader}>
              <View>
                <Text style={styles.cardTitle}>{text.rangeTitle}</Text>
                <Text style={styles.hintText}>
                  {text.rangeText(dateRange.startDate, dateRange.endDate)}
                </Text>
              </View>
              <Pressable
                onPress={handleRefresh}
                style={({ pressed }) => [
                  sharedStyles.secondaryButton,
                  pressed && sharedStyles.buttonPressed,
                ]}
              >
                <Text style={sharedStyles.secondaryButtonText}>{text.refresh}</Text>
              </Pressable>
            </View>
            <SegmentedControl
              options={datePresetOptions}
              value={preset}
              onValueChange={handlePresetChange}
              size="sm"
              style={styles.segmentedControl}
            />
            <ApiKeyFilter
              keys={keys}
              selectedKeyId={selectedKeyId}
              onSelect={handleKeySelect}
              text={text}
            />
          </View>

          {error ? (
            <View style={[settingsStyles.card, styles.cardBody]}>
              <Text style={styles.errorText}>{getErrorMessage(error)}</Text>
            </View>
          ) : null}

          <View style={styles.statsGrid}>
            <StatCard
              label={text.requests}
              value={isLoading ? "..." : String(statsQuery.data?.total_requests ?? 0)}
              hint={text.recordsInRange(total)}
            />
            <StatCard
              label={text.tokens}
              value={isLoading ? "..." : formatTokens(statsQuery.data?.total_tokens)}
              hint={`${text.cache} ${formatTokens(statsQuery.data?.total_cache_tokens)}`}
            />
            <StatCard
              label={text.actualCost}
              value={isLoading ? "..." : formatUsd(statsQuery.data?.total_actual_cost)}
              hint={`${text.standard} ${formatUsd(statsQuery.data?.total_cost)}`}
            />
            <StatCard
              label={text.avgDuration}
              value={isLoading ? "..." : formatDuration(statsQuery.data?.average_duration_ms)}
              hint={text.acrossMatchedRequests}
            />
          </View>

          <View style={[settingsStyles.card, styles.cardBody]}>
            <View style={styles.toolbarHeader}>
              <View>
                <Text style={styles.cardTitle}>{text.recordsTitle}</Text>
                <Text style={styles.hintText}>
                  {text.pageOf(logsQuery.data?.page ?? page, Math.max(pages, 1))}
                </Text>
              </View>
              <View style={styles.paginationButtons}>
                <Pressable
                  disabled={page <= 1}
                  onPress={() => setPage((current) => Math.max(1, current - 1))}
                  style={({ pressed }) => [
                    sharedStyles.secondaryButton,
                    page <= 1 && sharedStyles.disabledButton,
                    pressed && sharedStyles.buttonPressed,
                  ]}
                >
                  <Text style={sharedStyles.secondaryButtonText}>{text.prev}</Text>
                </Pressable>
                <Pressable
                  disabled={pages > 0 && page >= pages}
                  onPress={() => setPage((current) => current + 1)}
                  style={({ pressed }) => [
                    sharedStyles.secondaryButton,
                    pages > 0 && page >= pages && sharedStyles.disabledButton,
                    pressed && sharedStyles.buttonPressed,
                  ]}
                >
                  <Text style={sharedStyles.secondaryButtonText}>{text.next}</Text>
                </Pressable>
              </View>
            </View>

            {isLoading ? (
              <Text style={styles.hintText}>{text.loading}</Text>
            ) : logs.length === 0 ? (
              <Text style={styles.hintText}>{text.noRecords}</Text>
            ) : (
              <View style={styles.logList}>
                {logs.map((log) => (
                  <UsageLogCard key={log.id} log={log} keys={keys} text={text} />
                ))}
              </View>
            )}
          </View>
        </View>
      ) : null}
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  sectionStack: {
    gap: theme.spacing[4],
  },
  cardBody: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  toolbarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  cardTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  hintText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.xs,
  },
  segmentedControl: {
    alignSelf: "flex-start",
  },
  filterWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  filterPill: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 999,
    backgroundColor: theme.colors.surface0,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  filterPillSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: "rgba(59, 130, 246, 0.08)",
  },
  filterPillText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  filterPillTextSelected: {
    color: theme.colors.accent,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  statCard: {
    flexGrow: 1,
    minWidth: 150,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface1,
    padding: theme.spacing[3],
    gap: theme.spacing[1],
  },
  statLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  statValue: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
  },
  statHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  paginationButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  logList: {
    gap: theme.spacing[3],
  },
  logCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface0,
    padding: theme.spacing[3],
    gap: theme.spacing[3],
  },
  logHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  logTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  logModel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  logMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: theme.spacing[1],
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  metricCell: {
    flexGrow: 1,
    minWidth: 120,
    gap: theme.spacing[1],
  },
  metricLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  metricValue: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  metricHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  endpointText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
}));
