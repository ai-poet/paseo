import { useCallback } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useUnistyles } from "react-native-unistyles";
import { getIsElectron } from "@/constants/platform";
import { useAppSettings } from "@/hooks/use-settings";
import { settingsStyles } from "@/styles/settings";
import { SettingsSection } from "@/screens/settings/settings-section";
import { Button } from "@/components/ui/button";

export function AccessModeSection() {
  const router = useRouter();
  const { theme } = useUnistyles();
  const { settings, updateSettings } = useAppSettings();
  const isElectron = getIsElectron();

  const modeLabel =
    settings.accessMode === "builtin"
      ? "Paseo 云端"
      : settings.accessMode === "byok"
        ? "BYOK（自带 API Key）"
        : "未选择";

  const handleSwitchMode = useCallback(async () => {
    await updateSettings({ accessMode: null });
    router.replace("/mode-select");
  }, [router, updateSettings]);

  if (!isElectron) {
    return null;
  }

  return (
    <SettingsSection title="访问模式">
      <View style={[settingsStyles.card, { gap: theme.spacing[3], padding: theme.spacing[4] }]}>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm }}>
          当前：{modeLabel}
        </Text>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs }}>
          可在 Paseo 云端与 BYOK 之间切换。选择云端后需重新登录。
        </Text>
        <Button variant="secondary" size="sm" onPress={() => void handleSwitchMode()}>
          切换访问模式
        </Button>
      </View>
    </SettingsSection>
  );
}
