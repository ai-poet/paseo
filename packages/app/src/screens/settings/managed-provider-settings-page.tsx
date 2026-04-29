import { Text, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { settingsStyles } from "@/styles/settings";
import { SettingsSection } from "@/screens/settings/settings-section";
import { DesktopProvidersPanel } from "@/screens/settings/desktop-providers-panel";
import { CLOUD_NAME } from "@/config/branding";

export function ManagedProviderSettingsPage() {
  const { theme } = useUnistyles();

  return (
    <View testID="managed-provider-settings">
      <SettingsSection title="This device">
        <View style={[settingsStyles.card, { padding: theme.spacing[4], gap: theme.spacing[2] }]}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm }}>
            Active Claude Code and Codex API routes on this computer, plus saved and custom
            endpoints. You can point each CLI at a different saved entry.
          </Text>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs }}>
            {CLOUD_NAME} (account, keys, billing) lives in the sidebar under{" "}
            <Text style={{ fontWeight: theme.fontWeight.medium }}>{CLOUD_NAME}</Text>.
          </Text>
        </View>
      </SettingsSection>
      <DesktopProvidersPanel />
    </View>
  );
}
