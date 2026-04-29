import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useUnistyles } from "react-native-unistyles";
import { settingsStyles } from "@/styles/settings";
import { SettingsSection } from "@/screens/settings/settings-section";
import { PaseoCloudPanel } from "@/screens/settings/paseo-cloud-panel";
import { CLOUD_NAME } from "@/config/branding";
import { isPaseoCloudTab } from "@/utils/host-routes";

export function PaseoCloudSettingsPage() {
  const { theme } = useUnistyles();
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const rawTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const initialSection = rawTab && isPaseoCloudTab(rawTab) ? rawTab : undefined;

  return (
    <View testID="paseo-cloud-settings">
      <SettingsSection title={CLOUD_NAME}>
        <View style={[settingsStyles.card, { padding: theme.spacing[4], gap: theme.spacing[2] }]}>
          <Text
            style={{
              color: theme.colors.foregroundMuted,
              fontSize: theme.fontSize.sm,
            }}
          >
            Account sign-in, balance, routing groups, API keys, and the model catalog for the
            managed service. This is separate from the on-device Claude/Codex routes under Provider.
          </Text>
        </View>
      </SettingsSection>
      <PaseoCloudPanel initialSection={initialSection} />
    </View>
  );
}
