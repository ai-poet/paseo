import { memo, useCallback, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Cloud, KeyRound, LogOut, Route, Settings, Wallet } from "lucide-react-native";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppSettings } from "@/hooks/use-settings";
import { useSub2APIAuth } from "@/hooks/use-sub2api-auth";
import { useSub2APIMe, useSub2APIUsageStats } from "@/hooks/use-sub2api-api";
import { useSub2APILocale } from "@/hooks/use-sub2api-locale";
import { getSub2APIMessages } from "@/i18n/sub2api";
import { CLOUD_NAME } from "@/config/branding";
import { Sub2APIPayModal } from "@/screens/settings/sub2api-pay-modal";
import { buildPaseoCloudRoute } from "@/utils/host-routes";
import { formatUsd, getErrorMessage } from "@/screens/settings/managed-provider-settings-shared";

function getInitial(username: string | undefined, email: string | undefined): string {
  const name = username?.trim();
  if (name && name.length > 0) return name[0]!.toUpperCase();
  const mail = email?.trim();
  if (mail && mail.length > 0) return mail[0]!.toUpperCase();
  return "U";
}

function getBalanceColor(
  balance: number | undefined,
  palette: { amber: Record<number, string>; red: Record<number, string> },
  muted: string,
): string {
  if (typeof balance !== "number") return muted;
  if (balance <= 0) return palette.red[500];
  if (balance < 1) return palette.amber[500];
  return muted;
}

export const SidebarUserMenu = memo(function SidebarUserMenu({
  onNavigateSettings,
}: {
  onNavigateSettings: () => void;
}) {
  const { theme } = useUnistyles();
  const router = useRouter();
  const { settings } = useAppSettings();
  const locale = useSub2APILocale();
  const text = useMemo(() => getSub2APIMessages(locale).sidebarUser, [locale]);
  const { isLoggedIn, auth, logout, getAccessToken } = useSub2APIAuth();
  const meQuery = useSub2APIMe();
  const usageTodayQuery = useSub2APIUsageStats("today");

  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payToken, setPayToken] = useState<string | null>(null);

  const isBuiltinLoggedIn = settings.accessMode === "builtin" && isLoggedIn;

  const handleOpenPayModal = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) {
        Alert.alert(text.sessionExpired, text.loginAgain);
        return;
      }
      setPayToken(token);
      setIsPayModalOpen(true);
    } catch (error) {
      Alert.alert(text.unableOpenPayment, getErrorMessage(error));
    }
  }, [getAccessToken, text.loginAgain, text.sessionExpired, text.unableOpenPayment]);

  const handlePayCompleted = useCallback(() => {
    void meQuery.refetch();
    void usageTodayQuery.refetch();
  }, [meQuery, usageTodayQuery]);

  const handleLogout = useCallback(async () => {
    await logout();
    router.replace("/login");
  }, [logout, router]);

  const handleOpenPaseoCloud = useCallback(() => {
    router.push(buildPaseoCloudRoute());
  }, [router]);

  const handleOpenApiKeys = useCallback(() => {
    router.push(buildPaseoCloudRoute("keys"));
  }, [router]);

  const handleOpenRoutingGroups = useCallback(() => {
    router.push(buildPaseoCloudRoute("routing"));
  }, [router]);

  const user = meQuery.data;
  const initial = getInitial(user?.username, user?.email);
  const displayName = user?.username?.trim() || user?.email?.trim() || text.account;
  const displayEmail = user?.email?.trim() || "";
  const balance = user?.balance;
  const balanceColor = getBalanceColor(balance, theme.colors.palette, theme.colors.foregroundMuted);

  if (!isBuiltinLoggedIn) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          style={({ hovered = false }) => [
            styles.avatarButton,
            hovered && styles.avatarButtonHovered,
          ]}
          accessibilityRole="button"
          accessibilityLabel={text.userMenu}
          testID="sidebar-user-menu"
        >
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" width={220}>
          {/* User info */}
          <View style={styles.userInfoSection}>
            <Text style={styles.userName} numberOfLines={1}>
              {displayName}
            </Text>
            {displayEmail ? (
              <Text style={styles.userEmail} numberOfLines={1}>
                {displayEmail}
              </Text>
            ) : null}
          </View>

          <DropdownMenuSeparator />

          {/* Balance & usage */}
          <View style={styles.balanceSection}>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>{text.balance}</Text>
              <Text style={[styles.balanceValue, { color: balanceColor }]}>
                {meQuery.isLoading ? "..." : formatUsd(balance)}
              </Text>
            </View>
            <Text style={styles.usageHint}>
              {text.todayUsage(
                formatUsd(usageTodayQuery.data?.total_cost),
                usageTodayQuery.data?.total_requests ?? 0,
              )}
            </Text>
          </View>

          <DropdownMenuSeparator />

          {/* Actions */}
          <DropdownMenuItem
            leading={<Wallet size={16} color={theme.colors.foregroundMuted} />}
            onSelect={() => void handleOpenPayModal()}
          >
            {text.recharge}
          </DropdownMenuItem>
          <DropdownMenuItem
            leading={<Cloud size={16} color={theme.colors.foregroundMuted} />}
            onSelect={handleOpenPaseoCloud}
          >
            {CLOUD_NAME}
          </DropdownMenuItem>
          <DropdownMenuItem
            leading={<KeyRound size={16} color={theme.colors.foregroundMuted} />}
            onSelect={handleOpenApiKeys}
          >
            {text.apiKeys}
          </DropdownMenuItem>
          <DropdownMenuItem
            leading={<Route size={16} color={theme.colors.foregroundMuted} />}
            onSelect={handleOpenRoutingGroups}
          >
            {text.routingGroups}
          </DropdownMenuItem>
          <DropdownMenuItem
            leading={<Settings size={16} color={theme.colors.foregroundMuted} />}
            onSelect={onNavigateSettings}
          >
            {text.settings}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            leading={<LogOut size={16} color={theme.colors.destructive} />}
            onSelect={() => void handleLogout()}
          >
            {text.logout}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sub2APIPayModal
        visible={isPayModalOpen}
        endpoint={auth?.endpoint ?? ""}
        accessToken={payToken}
        onClose={() => setIsPayModalOpen(false)}
        onCompleted={handlePayCompleted}
      />
    </>
  );
});

const styles = StyleSheet.create((theme) => ({
  avatarButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
  avatarButtonHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  avatarCircle: {
    width: 24,
    height: 24,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: theme.colors.accentForeground,
    fontSize: 11,
    fontWeight: theme.fontWeight.bold,
    lineHeight: 14,
  },
  balanceText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  userInfoSection: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    gap: 2,
  },
  userName: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  userEmail: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  balanceSection: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    gap: theme.spacing[1],
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  balanceLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  balanceValue: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.bold,
  },
  usageHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
}));
