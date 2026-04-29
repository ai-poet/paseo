import { Text, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { settingsStyles } from "@/styles/settings";
import { SettingsSection } from "@/screens/settings/settings-section";
import { DesktopProvidersPanel } from "@/screens/settings/desktop-providers-panel";
import { CLOUD_NAME } from "@/config/branding";
import { getSub2APIMessages } from "@/i18n/sub2api";

type SettingsText = ReturnType<typeof getSub2APIMessages>["settings"];

export function ManagedProviderSettingsPage({ text }: { text: SettingsText }) {
  const { theme } = useUnistyles();

  return (
    <View testID="managed-provider-settings">
      <SettingsSection title={text.managedProviderTitle}>
        <View style={[settingsStyles.card, { padding: theme.spacing[4], gap: theme.spacing[2] }]}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm }}>
            {text.managedProviderBody}
          </Text>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs }}>
            {text.managedProviderCloudHint(CLOUD_NAME)}
          </Text>
        </View>
      </SettingsSection>
      <DesktopProvidersPanel />
    </View>
  );
}
