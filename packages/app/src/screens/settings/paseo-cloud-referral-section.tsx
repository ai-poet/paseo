import { useCallback, useState } from "react";
import { Pressable, Share, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import * as Clipboard from "expo-clipboard";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { useSub2APIReferralInfo, useSub2APIReferralHistory } from "@/hooks/use-sub2api-api";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function maskUsername(name: string): string {
  if (name.length <= 3) return name;
  return name.slice(0, 2) + "***" + name.slice(-1);
}

export function PaseoCloudReferralSection() {
  const referralQuery = useSub2APIReferralInfo();
  const historyQuery = useSub2APIReferralHistory(1, 20);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const info = referralQuery.data;
  const history = historyQuery.data?.items ?? [];

  const handleCopy = useCallback(async (text: string, field: string) => {
    await Clipboard.setStringAsync(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  const handleShare = useCallback(async () => {
    if (!info?.referral_link) return;
    try {
      await Share.share({ message: info.referral_link });
    } catch {
      // user cancelled
    }
  }, [info?.referral_link]);

  return (
    <>
      {/* Referral Code & Link */}
      <SettingsSection title="Referral">
        {referralQuery.isLoading ? (
          <View style={[settingsStyles.card, styles.cardBody]}>
            <Text style={styles.hintText}>Loading referral info...</Text>
          </View>
        ) : referralQuery.error ? (
          <View style={[settingsStyles.card, styles.cardBody]}>
            <Text style={styles.errorText}>{getErrorMessage(referralQuery.error)}</Text>
          </View>
        ) : info ? (
          <View style={[settingsStyles.card, styles.cardBody]}>
            {/* Referral code */}
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Referral Code</Text>
              <View style={styles.fieldValueRow}>
                <Text style={styles.fieldValue} selectable>
                  {info.referral_code}
                </Text>
                <Pressable
                  onPress={() => void handleCopy(info.referral_code, "code")}
                  style={({ pressed }) => [styles.copyButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.copyButtonText}>
                    {copiedField === "code" ? "Copied" : "Copy"}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Referral link */}
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Referral Link</Text>
              <View style={styles.fieldValueRow}>
                <Text style={styles.fieldValue} numberOfLines={1} selectable>
                  {info.referral_link}
                </Text>
                <Pressable
                  onPress={() => void handleShare()}
                  style={({ pressed }) => [styles.copyButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.copyButtonText}>Share</Text>
                </Pressable>
              </View>
            </View>

            {/* Stats */}
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{info.stats.total_count}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{info.stats.rewarded_count}</Text>
                <Text style={styles.statLabel}>Rewarded</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{info.stats.pending_count}</Text>
                <Text style={styles.statLabel}>Pending</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>${info.stats.total_balance_earn.toFixed(2)}</Text>
                <Text style={styles.statLabel}>Earned</Text>
              </View>
            </View>

            {/* Rewards info */}
            {info.rewards?.enabled ? (
              <View style={styles.rewardsInfo}>
                <Text style={styles.hintText}>
                  Referrer: ${info.rewards.referrer_balance_reward.toFixed(2)} balance
                  {info.rewards.referrer_subscription_days > 0
                    ? ` + ${info.rewards.referrer_subscription_days}d subscription`
                    : ""}
                </Text>
                <Text style={styles.hintText}>
                  Referee: ${info.rewards.referee_balance_reward.toFixed(2)} balance
                  {info.rewards.referee_subscription_days > 0
                    ? ` + ${info.rewards.referee_subscription_days}d subscription`
                    : ""}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </SettingsSection>

      {/* Referral History */}
      {history.length > 0 ? (
        <SettingsSection title="Referral history">
          <View style={settingsStyles.card}>
            {history.map((item, index) => (
              <View
                key={item.id}
                style={[settingsStyles.row, index > 0 && settingsStyles.rowBorder]}
              >
                <View style={settingsStyles.rowContent}>
                  <Text style={settingsStyles.rowTitle}>{maskUsername(item.referee_username)}</Text>
                  <Text style={settingsStyles.rowHint}>
                    {item.status} · ${item.referrer_balance_reward.toFixed(2)} ·{" "}
                    {new Date(item.created_at).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </SettingsSection>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  cardBody: {
    padding: theme.spacing[4],
    gap: theme.spacing[4],
  },
  hintText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.xs,
  },
  fieldRow: {
    gap: theme.spacing[1],
  },
  fieldLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  fieldValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  fieldValue: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    flexShrink: 1,
  },
  copyButton: {
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
  },
  copyButtonText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  statCard: {
    flex: 1,
    minWidth: 70,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface0,
    padding: theme.spacing[3],
    alignItems: "center",
    gap: theme.spacing[1],
  },
  statValue: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
  },
  statLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  rewardsInfo: {
    gap: theme.spacing[1],
  },
}));
