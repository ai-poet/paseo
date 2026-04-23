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
      <SettingsSection title="Paseo Cloud">
        <View style={[settingsStyles.card, { padding: theme.spacing[4], gap: theme.spacing[2] }]}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm }}>
            Sign in, balance, routing, and API keys for your Paseo Cloud account (Claude Code and
            Codex).
          </Text>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs }}>
            Model catalog helps pick a group by model for Claude Code and Codex; day-to-day switching
            is under Account and Group routing.
          </Text>
        </View>
      </SettingsSection>
      <AccessModeSection />
      <Sub2APIProvidersSection />
      <Sub2APIModelsSection />
    </View>
  );
}
