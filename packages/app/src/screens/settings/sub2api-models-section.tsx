import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { getIsElectron } from "@/constants/platform";
import { invokeDesktopCommand } from "@/desktop/electron/invoke";
import { useSub2APIAuth } from "@/hooks/use-sub2api-auth";
import { useAppSettings } from "@/hooks/use-settings";
import {
  useCreateSub2APIKeyMutation,
  useSub2APIKeys,
  useSub2APIModelCatalog,
} from "@/hooks/use-sub2api-api";
import type { Sub2APIKey, Sub2APIModelCatalogItem } from "@/lib/sub2api-client";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }
  return `${value.toFixed(1)}%`;
}

function formatUSD(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }
  return `$${value.toFixed(4)}`;
}

function pickUsableKey(keys: Sub2APIKey[], groupId: number): Sub2APIKey | null {
  return (
    keys.find((entry) => entry.group_id === groupId && entry.status === "active") ??
    keys.find((entry) => entry.group_id === groupId) ??
    null
  );
}

export function Sub2APIModelsSection() {
  const isElectron = getIsElectron();
  const { settings } = useAppSettings();
  const { isLoggedIn, auth } = useSub2APIAuth();
  const modelsQuery = useSub2APIModelCatalog();
  const keysQuery = useSub2APIKeys(1, 200);
  const createKeyMutation = useCreateSub2APIKeyMutation();
  const [switchingModel, setSwitchingModel] = useState<string | null>(null);

  const models = modelsQuery.data?.items ?? [];
  const keys = useMemo(() => keysQuery.data?.items ?? [], [keysQuery.data?.items]);

  const handleSwitchBestGroup = useCallback(
    async (item: Sub2APIModelCatalogItem) => {
      if (!auth?.endpoint) {
        Alert.alert("Missing endpoint", "Please sign in to the managed service first.");
        return;
      }

      const targetGroupId = item.best_group.id;
      setSwitchingModel(item.model);
      try {
        let keyToUse = pickUsableKey(keys, targetGroupId);
        if (!keyToUse) {
          keyToUse = await createKeyMutation.mutateAsync({
            name: `${item.best_group.name} (${item.model})`,
            group_id: targetGroupId,
          });
        }

        await invokeDesktopCommand("setup_default_provider", {
          endpoint: auth.endpoint,
          apiKey: keyToUse.key,
          name: item.best_group.name,
        });

        Alert.alert("Switched", `Provider is now using group "${item.best_group.name}".`);
      } catch (error) {
        Alert.alert("Switch failed", getErrorMessage(error));
      } finally {
        setSwitchingModel(null);
      }
    },
    [auth?.endpoint, createKeyMutation, keys],
  );

  if (!isElectron) {
    return null;
  }
  if (settings.accessMode === "byok") {
    return null;
  }

  return (
    <SettingsSection title="Model Catalog">
      {!isLoggedIn ? (
        <View style={[settingsStyles.card, styles.cardBody]}>
          <Text style={styles.hintText}>Sign in to browse the model catalog.</Text>
        </View>
      ) : null}

      {isLoggedIn ? (
        <>
          <View style={[settingsStyles.card, styles.cardBody]}>
            <Text style={styles.summaryTitle}>Catalog Summary</Text>
            {modelsQuery.isLoading ? (
              <Text style={styles.hintText}>Loading model catalog...</Text>
            ) : modelsQuery.error ? (
              <Text style={styles.errorText}>{getErrorMessage(modelsQuery.error)}</Text>
            ) : (
              <View style={styles.summaryGrid}>
                <Text style={styles.summaryCell}>
                  Models: {modelsQuery.data?.summary.total_models ?? 0}
                </Text>
                <Text style={styles.summaryCell}>
                  Token: {modelsQuery.data?.summary.token_models ?? 0}
                </Text>
                <Text style={styles.summaryCell}>
                  Non-token: {modelsQuery.data?.summary.non_token_models ?? 0}
                </Text>
                <Text style={styles.summaryCell}>
                  Best savings: {formatPercent(modelsQuery.data?.summary.max_savings_percent ?? 0)}
                </Text>
              </View>
            )}
          </View>

          {models.length > 0 ? (
            <View style={settingsStyles.card}>
              {models.map((item, index) => {
                const isSwitching = switchingModel === item.model;
                const savings = formatPercent(item.comparison.savings_percent ?? null);
                const officialPrice = formatUSD(
                  item.official_pricing.input_per_mtok_usd ?? item.official_pricing.per_request_usd,
                );
                const effectivePrice = formatUSD(
                  item.effective_pricing_usd.input_per_mtok_usd ??
                    item.effective_pricing_usd.per_request_usd,
                );

                return (
                  <View
                    key={`${item.model}-${item.best_group.id}`}
                    style={[settingsStyles.row, index > 0 && settingsStyles.rowBorder]}
                  >
                    <View style={settingsStyles.rowContent}>
                      <Text style={settingsStyles.rowTitle}>{item.display_name || item.model}</Text>
                      <Text style={settingsStyles.rowHint}>
                        {item.platform} · Best: {item.best_group.name} ({item.best_group.rate_multiplier}
                        x)
                      </Text>
                      <Text style={settingsStyles.rowHint}>
                        Official {officialPrice} · Effective {effectivePrice} · Savings {savings}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => void handleSwitchBestGroup(item)}
                      style={({ pressed }) => [
                        styles.switchButton,
                        pressed && styles.buttonPressed,
                        isSwitching && styles.switchButtonDisabled,
                      ]}
                      disabled={isSwitching}
                    >
                      <Text style={styles.switchButtonText}>
                        {isSwitching ? "Switching..." : "Use"}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : null}
        </>
      ) : null}
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  cardBody: {
    padding: theme.spacing[4],
    gap: theme.spacing[2],
  },
  hintText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.xs,
  },
  summaryTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  summaryGrid: {
    gap: theme.spacing[1],
  },
  summaryCell: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  switchButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  switchButtonDisabled: {
    opacity: 0.75,
  },
  switchButtonText: {
    color: theme.colors.accentForeground,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  buttonPressed: {
    opacity: 0.85,
  },
}));
