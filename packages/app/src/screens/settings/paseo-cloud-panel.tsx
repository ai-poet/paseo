import React from "react";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useUnistyles } from "react-native-unistyles";
import { Cloud } from "lucide-react-native";
import { useIsCompactFormFactor } from "@/constants/layout";
import { getManagedServiceUrlFromEnv } from "@/config/managed-service-env";
import { useSub2APIAuth } from "@/hooks/use-sub2api-auth";
import { useSub2APILoginFlow } from "@/hooks/use-sub2api-login-flow";
import { useAppSettings } from "@/hooks/use-settings";
import {
  useSub2APIMe,
  useSub2APIUsageStats,
} from "@/hooks/use-sub2api-api";
import { SettingsSection } from "@/screens/settings/settings-section";
import { useDesktopProvidersStore } from "@/screens/settings/desktop-providers-context";
import { managedProviderSettingsStyles as styles } from "@/screens/settings/managed-provider-settings-styles";
import { Sub2APIPayModal } from "@/screens/settings/sub2api-pay-modal";
import { Sub2APIModelsSection } from "@/screens/settings/sub2api-models-section";
import { PaseoCloudApiKeysSection } from "@/screens/settings/paseo-cloud-api-keys-section";
import { PaseoCloudRoutingSection } from "@/screens/settings/paseo-cloud-routing-section";
import { settingsStyles } from "@/styles/settings";
import { formatUsd, getErrorMessage } from "./managed-provider-settings-shared";

type PaseoCloudSection = "overview" | "keys" | "routing" | "catalog";

const SECTION_OPTIONS: Array<{ id: PaseoCloudSection; label: string; testID: string }> = [
  { id: "overview", label: "Overview", testID: "paseo-cloud-section-overview" },
  { id: "keys", label: "API Keys", testID: "paseo-cloud-section-keys" },
  { id: "routing", label: "Routing", testID: "paseo-cloud-section-routing" },
  { id: "catalog", label: "Model Catalog", testID: "paseo-cloud-section-catalog" },
];

function PaseoCloudOverviewSection(props: {
  isLoggedIn: boolean;
  canStartLogin: boolean;
  signedInAccountLabel: string;
  handleGitHubLogin: () => Promise<void>;
  handleLogout: () => Promise<void>;
  handleOpenPayModal: () => Promise<void>;
  meError: unknown;
  meIsLoading: boolean;
  meBalance: number | null | undefined;
  refetchMe: () => Promise<unknown>;
  usageTodayCost: number | null | undefined;
  usageTodayRequests: number | null | undefined;
  usageWeekCost: number | null | undefined;
  usageWeekRequests: number | null | undefined;
  usageMonthCost: number | null | undefined;
  usageMonthRequests: number | null | undefined;
}) {
  const { theme } = useUnistyles();

  return (
    <>
      <SettingsSection title="Account">
        {!props.isLoggedIn ? (
          <View style={styles.dashedCard}>
            <View style={styles.emptyIconWrap}>
              <Cloud size={theme.iconSize.lg} color={theme.colors.foregroundMuted} />
            </View>
            <Text style={styles.emptyTitle}>Sign in</Text>
            <Text style={styles.emptyBody}>
              Connect with GitHub for Paseo Cloud billing, API keys, routing groups, and the model
              catalog. Device routing changes happen only when you explicitly use a key, group, or
              model.
            </Text>
            <Pressable
              onPress={() => void props.handleGitHubLogin()}
              style={({ pressed }) => [
                styles.githubButton,
                pressed && styles.buttonPressed,
                !props.canStartLogin && styles.disabledButton,
              ]}
              disabled={!props.canStartLogin}
              testID="paseo-cloud-login-button"
            >
              <Text style={styles.githubButtonText}>Login with GitHub</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[settingsStyles.card, styles.cardBody]}>
            <Text style={styles.sectionHint}>
              Your Paseo Cloud session is connected. Use the sections on the left to manage keys,
              routing, and models without mixing those controls together.
            </Text>
            <View style={styles.statusRow}>
              <View style={styles.statusBadge}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText} numberOfLines={2}>
                  Signed in as {props.signedInAccountLabel}
                </Text>
              </View>
              <Pressable
                onPress={() => void props.handleLogout()}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
              >
                <Text style={styles.secondaryButtonText}>Logout</Text>
              </Pressable>
            </View>
          </View>
        )}
      </SettingsSection>

      {props.isLoggedIn ? (
        <SettingsSection title="Balance & usage">
          <View style={[settingsStyles.card, styles.cardBody]}>
            {props.meError ? (
              <View style={styles.errorBlock}>
                <Text style={styles.errorHint}>{getErrorMessage(props.meError)}</Text>
                <Pressable
                  onPress={() => void props.refetchMe()}
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.secondaryButtonText}>Retry</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.balanceHeader}>
                <View>
                  <Text style={styles.balanceLabel}>Balance</Text>
                  <Text style={styles.balanceValue}>
                    {props.meIsLoading ? "…" : formatUsd(props.meBalance)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => void props.handleOpenPayModal()}
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.primaryButtonText}>Recharge</Text>
                </Pressable>
              </View>
            )}
            <Text style={styles.usageHint}>
              Today: {formatUsd(props.usageTodayCost)} ({props.usageTodayRequests ?? 0} req)
            </Text>
            <Text style={styles.usageHint}>
              Week: {formatUsd(props.usageWeekCost)} ({props.usageWeekRequests ?? 0} req)
            </Text>
            <Text style={styles.usageHint}>
              Month: {formatUsd(props.usageMonthCost)} ({props.usageMonthRequests ?? 0} req)
            </Text>
          </View>
        </SettingsSection>
      ) : null}
    </>
  );
}

export function PaseoCloudPanel() {
  const router = useRouter();
  const isCompact = useIsCompactFormFactor();
  const { settings } = useAppSettings();
  const { getAccessToken } = useSub2APIAuth();
  const { loadProviders } = useDesktopProvidersStore();
  const [activeSection, setActiveSection] = useState<PaseoCloudSection>("overview");
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payToken, setPayToken] = useState<string | null>(null);

  const meQuery = useSub2APIMe();
  const usageTodayQuery = useSub2APIUsageStats("today");
  const usageWeekQuery = useSub2APIUsageStats("week");
  const usageMonthQuery = useSub2APIUsageStats("month");

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
        meQuery.refetch(),
        usageTodayQuery.refetch(),
        usageWeekQuery.refetch(),
        usageMonthQuery.refetch(),
      ]);
    },
  });

  const signedInAccountLabel = useMemo(() => {
    const user = meQuery.data;
    if (user) {
      const name = user.username?.trim();
      if (name) {
        return name;
      }
      const email = user.email?.trim();
      if (email) {
        return email;
      }
    }
    if (meQuery.isPending || meQuery.isFetching) {
      return "…";
    }
    return "Account";
  }, [meQuery.data, meQuery.isFetching, meQuery.isPending]);

  const handleLogout = useCallback(async () => {
    await logout();
    if (settings.accessMode === "builtin") {
      router.replace("/login");
    }
  }, [logout, router, settings.accessMode]);

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

  const activeSectionLabel =
    SECTION_OPTIONS.find((option) => option.id === activeSection)?.label ?? "Overview";

  const renderSection = () => {
    if (!isLoggedIn && activeSection !== "overview") {
      return (
        <SettingsSection title={activeSectionLabel}>
          <View style={styles.dashedCard}>
            <Text style={styles.emptyTitle}>Sign in required</Text>
            <Text style={styles.emptyBody}>
              Open <Text style={styles.sectionHintEm}>Overview</Text> to sign in before managing
              API keys, routing, or the model catalog.
            </Text>
            <Pressable
              onPress={() => setActiveSection("overview")}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.primaryButtonText}>Go to Overview</Text>
            </Pressable>
          </View>
        </SettingsSection>
      );
    }

    switch (activeSection) {
      case "keys":
        return (
          <PaseoCloudApiKeysSection
            authEndpoint={auth?.endpoint}
            serviceEndpoint={serviceEndpoint}
          />
        );
      case "routing":
        return (
          <PaseoCloudRoutingSection
            authEndpoint={auth?.endpoint}
            serviceEndpoint={serviceEndpoint}
          />
        );
      case "catalog":
        return <Sub2APIModelsSection />;
      case "overview":
      default:
        return (
          <PaseoCloudOverviewSection
            isLoggedIn={isLoggedIn}
            canStartLogin={canStartLogin}
            signedInAccountLabel={signedInAccountLabel}
            handleGitHubLogin={handleGitHubLogin}
            handleLogout={handleLogout}
            handleOpenPayModal={handleOpenPayModal}
            meError={meQuery.error}
            meIsLoading={meQuery.isLoading}
            meBalance={meQuery.data?.balance}
            refetchMe={meQuery.refetch}
            usageTodayCost={usageTodayQuery.data?.total_cost}
            usageTodayRequests={usageTodayQuery.data?.total_requests}
            usageWeekCost={usageWeekQuery.data?.total_cost}
            usageWeekRequests={usageWeekQuery.data?.total_requests}
            usageMonthCost={usageMonthQuery.data?.total_cost}
            usageMonthRequests={usageMonthQuery.data?.total_requests}
          />
        );
    }
  };

  return (
    <>
      <View
        style={[styles.cloudShell, isCompact && styles.cloudShellCompact]}
        testID="paseo-cloud-panel"
      >
        <View
          style={[
            settingsStyles.card,
            styles.cloudMenuCard,
            isCompact && styles.cloudMenuCardCompact,
          ]}
        >
          <View style={styles.cloudMenuHeader}>
            <Text style={styles.formTitle}>Paseo Cloud</Text>
            <Text style={styles.sectionHint}>Browse one section at a time.</Text>
          </View>
          <View style={[styles.cloudMenuList, isCompact && styles.cloudMenuListCompact]}>
            {SECTION_OPTIONS.map((option) => {
              const selected = option.id === activeSection;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => setActiveSection(option.id)}
                  style={({ pressed }) => [
                    styles.cloudMenuButton,
                    isCompact && styles.cloudMenuButtonCompact,
                    selected && styles.cloudMenuButtonActive,
                    pressed && !selected && styles.buttonPressed,
                  ]}
                  testID={option.testID}
                >
                  <Text
                    style={[
                      styles.cloudMenuButtonText,
                      selected && styles.cloudMenuButtonTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.cloudContent}>{renderSection()}</View>
      </View>

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
