import { useCallback, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowRight, Cloud, KeyRound } from "lucide-react-native";
import { PaseoLogo } from "@/components/icons/paseo-logo";
import { useAppSettings, type AccessMode } from "@/hooks/use-settings";

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  scrollView: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    padding: theme.spacing[6],
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    width: "100%",
    maxWidth: 560,
    alignItems: "center",
    gap: theme.spacing[6],
  },
  copyBlock: {
    alignItems: "center",
    gap: theme.spacing[2],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.medium,
    textAlign: "center",
  },
  subtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  cards: {
    width: "100%",
    gap: theme.spacing[4],
  },
  card: {
    padding: theme.spacing[4],
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing[3],
  },
  cardRecommended: {
    borderColor: theme.colors.accent,
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardDisabled: {
    opacity: 0.5,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  cardIconBox: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface0,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
  },
  cardBadge: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.accent,
  },
  cardBadgeText: {
    color: theme.colors.accentForeground,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  cardDescription: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.5,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: theme.spacing[2],
  },
  cardMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  cardMetaAccent: {
    color: theme.colors.accent,
  },
}));

export function ModeSelectScreen() {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { updateSettings } = useAppSettings();
  const [pending, setPending] = useState<AccessMode | null>(null);

  const pickMode = useCallback(
    async (mode: AccessMode) => {
      if (pending) return;
      setPending(mode);
      try {
        await updateSettings({ accessMode: mode });
        if (mode === "builtin") {
          router.replace("/login");
        } else {
          router.replace("/");
        }
      } catch (error) {
        console.error("[mode-select] failed to save mode", error);
        setPending(null);
      }
    },
    [pending, router, updateSettings],
  );

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: theme.spacing[6] + insets.top,
            paddingBottom: theme.spacing[6] + insets.bottom,
          },
        ]}
        showsVerticalScrollIndicator={false}
        testID="mode-select-screen"
      >
        <View style={styles.content}>
          <PaseoLogo size={96} />
          <View style={styles.copyBlock}>
            <Text style={styles.title}>How do you want to connect?</Text>
            <Text style={styles.subtitle}>
              Use Paseo Cloud, or bring your own API keys (BYOK) for model access.
            </Text>
          </View>

          <View style={styles.cards}>
            <ModeCard
              icon={<Cloud size={20} color={theme.colors.accent} />}
              title="Paseo Cloud"
              description="Sign in for managed Claude Code / Codex routing, usage-based billing, and quick setup."
              metaText="Sign in · Recommended"
              metaAccent
              recommended
              disabled={pending !== null && pending !== "builtin"}
              loading={pending === "builtin"}
              testID="mode-select-builtin"
              onPress={() => void pickMode("builtin")}
            />
            <ModeCard
              icon={<KeyRound size={20} color={theme.colors.foreground} />}
              title="BYOK"
              description="Use your own Anthropic / OpenAI keys and add providers in Settings. No cloud sign-in."
              metaText="No sign-in"
              disabled={pending !== null && pending !== "byok"}
              loading={pending === "byok"}
              testID="mode-select-byok"
              onPress={() => void pickMode("byok")}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

interface ModeCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  metaText: string;
  metaAccent?: boolean;
  recommended?: boolean;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  onPress: () => void;
}

function ModeCard({
  icon,
  title,
  description,
  metaText,
  metaAccent,
  recommended,
  disabled,
  loading,
  testID,
  onPress,
}: ModeCardProps) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.card,
        recommended && styles.cardRecommended,
        pressed && styles.cardPressed,
        (disabled || loading) && styles.cardDisabled,
      ]}
      testID={testID}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardIconBox}>{icon}</View>
        <Text style={styles.cardTitle}>{title}</Text>
        {recommended ? (
          <View style={styles.cardBadge}>
            <Text style={styles.cardBadgeText}>Recommended</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.cardDescription}>{description}</Text>
      <View style={styles.cardFooter}>
        <Text style={[styles.cardMeta, metaAccent ? styles.cardMetaAccent : null]}>{metaText}</Text>
        {loading ? (
          <ActivityIndicator size="small" color={theme.colors.accent} />
        ) : (
          <ArrowRight size={16} color={theme.colors.foregroundMuted} />
        )}
      </View>
    </Pressable>
  );
}
