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
      ? "Paseo Cloud"
      : settings.accessMode === "byok"
        ? "BYOK"
        : "Not selected";

  const handleSwitchMode = useCallback(async () => {
    await updateSettings({ accessMode: null });
    router.replace("/mode-select");
  }, [router, updateSettings]);

  if (!isElectron) {
    return null;
  }

  return (
    <SettingsSection title="Access mode">
      <View style={[settingsStyles.card, { gap: theme.spacing[3], padding: theme.spacing[4] }]}>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm }}>
          Current: {modeLabel}
        </Text>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs }}>
          Switch between Paseo Cloud and BYOK. Choosing Cloud requires signing in again.
        </Text>
        <Button variant="secondary" size="sm" onPress={() => void handleSwitchMode()}>
          Change access mode
        </Button>
      </View>
    </SettingsSection>
  );
}
