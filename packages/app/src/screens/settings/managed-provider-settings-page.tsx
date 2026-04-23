import { Text, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { settingsStyles } from "@/styles/settings";
import { SettingsSection } from "@/screens/settings/settings-section";
import { AccessModeSection } from "@/screens/settings/access-mode-section";
import { Sub2APIProvidersSection } from "@/screens/settings/sub2api-providers-section";
import { Sub2APIModelsSection } from "@/screens/settings/sub2api-models-section";
import { useAppSettings } from "@/hooks/use-settings";

export function ManagedProviderSettingsPage() {
  const { theme } = useUnistyles();
  const { settings } = useAppSettings();
  const isByok = settings.accessMode === "byok";

  return (
    <View testID="managed-provider-settings">
      <SettingsSection title={isByok ? "Providers" : "Paseo Cloud"}>
        <View style={[settingsStyles.card, { padding: theme.spacing[4], gap: theme.spacing[2] }]}>
          {isByok ? (
            <>
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm }}>
                BYOK: manage Claude Code and Codex routes on this device from the sections below.
              </Text>
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs }}>
                Switch access mode in Access mode if you want Paseo Cloud sign-in, billing, and group
                routing.
              </Text>
            </>
          ) : (
            <>
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm }}>
                Sign in, balance, routing, and API keys for your Paseo Cloud account (Claude Code and
                Codex).
              </Text>
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs }}>
                Model catalog helps pick a group by model for Claude Code and Codex; day-to-day
                switching is under Account and Group routing.
              </Text>
            </>
          )}
        </View>
      </SettingsSection>
      <AccessModeSection />
      <Sub2APIProvidersSection />
      <Sub2APIModelsSection />
    </View>
  );
}
