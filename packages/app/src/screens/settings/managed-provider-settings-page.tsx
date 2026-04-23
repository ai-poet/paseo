import { Text, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { settingsStyles } from "@/styles/settings";
import { SettingsSection } from "@/screens/settings/settings-section";
import { AccessModeSection } from "@/screens/settings/access-mode-section";
import { Sub2APIProvidersSection } from "@/screens/settings/sub2api-providers-section";
import { Sub2APIModelsSection } from "@/screens/settings/sub2api-models-section";

export function ManagedProviderSettingsPage() {
  const { theme } = useUnistyles();

  return (
    <View testID="managed-provider-settings">
      <SettingsSection title="内置托管服务">
        <View style={[settingsStyles.card, { padding: theme.spacing[4] }]}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm }}>
            管理内置托管服务的登录、计费以及 Claude Code / Codex 使用的 API 线路。
          </Text>
        </View>
      </SettingsSection>
      <AccessModeSection />
      <Sub2APIProvidersSection />
      <Sub2APIModelsSection />
    </View>
  );
}
