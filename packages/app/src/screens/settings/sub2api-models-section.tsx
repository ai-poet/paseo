import { useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { useSub2APIAuth } from "@/hooks/use-sub2api-auth";
import { useSub2APIGroupStatuses, useSub2APIModelCatalog } from "@/hooks/use-sub2api-api";
import { ModelCard } from "@/components/model-square/group-card";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function Sub2APIModelsSection() {
  const { isLoggedIn } = useSub2APIAuth();
  const statusesQuery = useSub2APIGroupStatuses();
  const catalogQuery = useSub2APIModelCatalog();

  const statuses = statusesQuery.data ?? [];
  const catalogItems = catalogQuery.data?.items ?? [];
  const summary = catalogQuery.data?.summary;

  const statusMap = useMemo(() => {
    const map = new Map<number, (typeof statuses)[0]>();
    for (const s of statuses) {
      map.set(s.group_id, s);
    }
    return map;
  }, [statuses]);

  const isLoading = catalogQuery.isLoading || statusesQuery.isLoading;
  const error = catalogQuery.error || statusesQuery.error;

  return (
    <SettingsSection title="Model catalog">
      {!isLoggedIn ? (
        <View style={[settingsStyles.card, styles.cardBody]}>
          <Text style={styles.hintText}>Sign in to Paseo Cloud to browse the model catalog.</Text>
        </View>
      ) : null}

      {isLoggedIn ? (
        <>
          {isLoading ? (
            <View style={[settingsStyles.card, styles.cardBody]}>
              <Text style={styles.hintText}>Loading catalog...</Text>
            </View>
          ) : error ? (
            <View style={[settingsStyles.card, styles.cardBody]}>
              <Text style={styles.errorText}>{getErrorMessage(error)}</Text>
            </View>
          ) : (
            <>
              {/* Summary */}
              {summary ? (
                <View style={[settingsStyles.card, styles.cardBody]}>
                  <View style={styles.summaryGrid}>
                    <Text style={styles.summaryCell}>Models: {summary.total_models}</Text>
                    <Text style={styles.summaryCell}>Token: {summary.token_models}</Text>
                    <Text style={styles.summaryCell}>Non-token: {summary.non_token_models}</Text>
                    <Text style={styles.summaryCell}>
                      Best savings: {summary.max_savings_percent.toFixed(1)}%
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Model cards */}
              {catalogItems.length === 0 ? (
                <View style={[settingsStyles.card, styles.cardBody]}>
                  <Text style={styles.hintText}>No models available.</Text>
                </View>
              ) : (
                <View style={styles.cardGrid}>
                  {catalogItems.map((item) => (
                    <ModelCard
                      key={`${item.model}-${item.best_group.id}`}
                      item={item}
                      status={statusMap.get(item.best_group.id)}
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </>
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
  cardGrid: {
    gap: theme.spacing[3],
  },
}));
