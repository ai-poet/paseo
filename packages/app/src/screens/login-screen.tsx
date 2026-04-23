import { useEffect } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LogIn } from "lucide-react-native";
import { PaseoLogo } from "@/components/icons/paseo-logo";
import { useSub2APILoginFlow } from "@/hooks/use-sub2api-login-flow";
import { useAppSettings } from "@/hooks/use-settings";
import {
  getManagedServiceUrlFromEnv,
  hasExplicitManagedServiceUrlEnv,
  isManagedServiceUrlEnvValid,
  shouldShowManagedServiceUrlEditor,
} from "@/config/managed-service-env";

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
    maxWidth: 420,
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
  form: {
    width: "100%",
    gap: theme.spacing[3],
  },
  fieldLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  textInput: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  errorHint: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.xs,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[4],
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.accent,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    color: theme.colors.accentForeground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: theme.colors.border,
  },
  byokRow: {
    alignItems: "center",
    gap: theme.spacing[1],
  },
  byokCaption: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    textAlign: "center",
  },
  byokLink: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
  },
  byokLinkText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
}));

export function LoginScreen() {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { updateSettings } = useAppSettings();
  const injectedServiceUrl = getManagedServiceUrlFromEnv();
  const showServiceUrlEditor = shouldShowManagedServiceUrlEditor();
  const explicitServiceUrlEnv = hasExplicitManagedServiceUrlEnv();

  const {
    endpoint,
    setEndpoint,
    canStartLogin,
    isLoggedIn,
    handleGitHubLogin,
    isInFlight,
  } = useSub2APILoginFlow({
    defaultEndpoint: injectedServiceUrl,
    onLoginSuccess: () => {
      router.replace("/");
    },
  });

  useEffect(() => {
    if (isLoggedIn) {
      router.replace("/");
    }
  }, [isLoggedIn, router]);

  const onSwitchToByok = async () => {
    await updateSettings({ accessMode: "byok" });
    router.replace("/");
  };

  const envUrlInvalid = explicitServiceUrlEnv && !isManagedServiceUrlEnvValid();
  const loginDisabled = !canStartLogin || isInFlight || envUrlInvalid;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.container,
          { paddingTop: theme.spacing[6] + insets.top, paddingBottom: theme.spacing[6] + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        testID="login-screen"
      >
        <View style={styles.content}>
          <PaseoLogo size={96} />
          <View style={styles.copyBlock}>
            <Text style={styles.title}>登录 Paseo</Text>
            <Text style={styles.subtitle}>使用托管内置服务，登录后自动为你配置 Provider。</Text>
          </View>

          <View style={styles.form}>
            {envUrlInvalid ? (
              <Text style={styles.errorHint}>
                环境变量中的服务地址不是合法的 http(s) URL，请修正后重新打包或启动。
              </Text>
            ) : null}
            {showServiceUrlEditor ? (
              <>
                <Text style={styles.fieldLabel}>服务地址</Text>
                <TextInput
                  value={endpoint}
                  onChangeText={setEndpoint}
                  placeholder="https://api.example.com"
                  placeholderTextColor={theme.colors.foregroundMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.textInput}
                  testID="login-endpoint-input"
                />
                {!canStartLogin ? (
                  <Text style={styles.errorHint}>请填写合法的 http(s) 地址后再登录。</Text>
                ) : null}
              </>
            ) : null}

            <Pressable
              onPress={() => void handleGitHubLogin()}
              disabled={loginDisabled}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
                loginDisabled && styles.primaryButtonDisabled,
              ]}
              testID="login-github-button"
            >
              {isInFlight ? (
                <ActivityIndicator size="small" color={theme.colors.accentForeground} />
              ) : (
                <LogIn size={18} color={theme.colors.accentForeground} />
              )}
              <Text style={styles.primaryButtonText}>
                {isInFlight ? "等待浏览器授权…" : "使用 GitHub 登录"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.divider} />

          <View style={styles.byokRow}>
            <Text style={styles.byokCaption}>已经有自己的 API Key？</Text>
            <Pressable
              onPress={() => void onSwitchToByok()}
              style={styles.byokLink}
              testID="login-switch-byok"
            >
              <Text style={styles.byokLinkText}>改用 BYOK 模式 →</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
