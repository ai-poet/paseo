import { Text, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { settingsStyles } from "@/styles/settings";
import { SettingsSection } from "@/screens/settings/settings-section";
import { PaseoCloudPanel } from "@/screens/settings/paseo-cloud-panel";

export function PaseoCloudSettingsPage() {
  const { theme } = useUnistyles();

  return (
    <View testID="paseo-cloud-settings">
      <SettingsSection title="Paseo Cloud">
        <View style={[settingsStyles.card, { padding: theme.spacing[4], gap: theme.spacing[2] }]}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm }}>
            Account sign-in, balance, routing groups, API keys, and the model catalog for the
            managed service. This is separate from the on-device Claude/Codex routes under Provider.
          </Text>
        </View>
      </SettingsSection>
      <PaseoCloudPanel />
    </View>
  );
}
