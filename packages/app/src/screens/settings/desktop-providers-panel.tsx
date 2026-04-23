import { Pressable, Text, TextInput, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { useAppSettings } from "@/hooks/use-settings";
import { AccessModeSection } from "@/screens/settings/access-mode-section";
import { useDesktopProvidersStore } from "@/screens/settings/desktop-providers-context";
import { managedProviderSettingsStyles as styles } from "@/screens/settings/managed-provider-settings-styles";
import {
  CUSTOM_TARGET_SEGMENT_OPTIONS,
  ENDPOINT_PLACEHOLDER,
  providerTargetHint,
  maskApiKey,
  providerWritesClaude,
  providerWritesCodex,
} from "@/screens/settings/managed-provider-settings-shared";
import type { DesktopProviderPayload } from "@/screens/settings/sub2api-provider-types";

function RouteHeroCard({
  label,
  provider,
}: {
  label: string;
  provider: DesktopProviderPayload | null;
}) {
  return (
    <View style={[settingsStyles.card, styles.cardBody, provider ? styles.heroCardActive : null]}>
      {provider ? (
        <>
          <View style={styles.heroTitleRow}>
            <View
              style={[styles.providerDotHero, styles.providerDotActive]}
              accessibilityLabel="Active"
            />
            <Text style={styles.heroLabel}>{label}</Text>
          </View>
          <Text style={styles.heroName}>{provider.name}</Text>
          <Text style={styles.heroEndpoint}>{provider.endpoint}</Text>
          <Text style={styles.heroKeyHint}>Key {maskApiKey(provider.apiKey)}</Text>
          <Text style={styles.heroMetaHint}>{providerTargetHint(provider)}</Text>
        </>
      ) : (
        <>
          <Text style={styles.heroLabel}>{label}</Text>
          <Text style={styles.heroName}>Not configured</Text>
          <Text style={styles.sectionHint}>
            Choose a saved endpoint below for this CLI, or add a custom one.
          </Text>
        </>
      )}
    </View>
  );
}

export function DesktopProvidersPanel() {
  const { theme } = useUnistyles();
  const { settings } = useAppSettings();
  const isByok = settings.accessMode === "byok";
  const {
    providers,
    activeClaudeProviderId,
    activeCodexProviderId,
    activeClaudeProvider,
    activeCodexProvider,
    showAddProviderForm,
    editProviderName,
    setEditProviderName,
    editProviderEndpoint,
    setEditProviderEndpoint,
    editProviderApiKey,
    setEditProviderApiKey,
    customTarget,
    setCustomTarget,
    openCustomProviderForm,
    closeCustomProviderForm,
    handleSwitchProvider,
    handleRemoveProvider,
    handleAddProvider,
  } = useDesktopProvidersStore();

  return (
    <>
      <AccessModeSection />

      <SettingsSection title="Active routes">
        <Text style={[styles.sectionHint, { marginBottom: theme.spacing[2] }]}>
          Claude Code and Codex are switched independently. Each saved endpoint targets one CLI. On
          each load we reconcile rows with your on-disk CLI config (~/.claude/settings.json and
          ~/.codex/) so the highlighted entry matches what Codex and Claude would actually use.
        </Text>
        <View style={styles.routeHeroStack}>
          <RouteHeroCard label="Claude Code" provider={activeClaudeProvider} />
          <RouteHeroCard label="Codex" provider={activeCodexProvider} />
        </View>
      </SettingsSection>

      <SettingsSection title="Saved endpoints">
        {providers.length === 0 ? (
          <View style={styles.dashedCard}>
            <Text style={styles.emptyTitle}>No saved endpoints</Text>
            <Text style={styles.emptyBody}>
              {isByok
                ? "Add a custom provider below. Each entry targets Claude Code only or Codex only."
                : "After you apply a cloud key, your default route appears here. Add custom endpoints below when you use another base URL or wire format."}
            </Text>
          </View>
        ) : (
          <View style={settingsStyles.card}>
            {providers.map((provider, index) => {
              const forClaude = providerWritesClaude(provider);
              const forCodex = providerWritesCodex(provider);
              const claudeActive = activeClaudeProviderId === provider.id;
              const codexActive = activeCodexProviderId === provider.id;
              return (
                <View
                  key={provider.id}
                  style={[settingsStyles.row, index > 0 && settingsStyles.rowBorder]}
                >
                  <View style={settingsStyles.rowContent}>
                    <Text style={settingsStyles.rowTitle}>{provider.name}</Text>
                    <Text style={settingsStyles.rowHint}>{provider.endpoint}</Text>
                    <Text style={styles.providerMetaHint}>{providerTargetHint(provider)}</Text>
                    <View style={[styles.scopeActionsRow, { marginTop: theme.spacing[1] }]}>
                      {claudeActive ? <Text style={styles.scopeBadge}>Claude active</Text> : null}
                      {codexActive ? <Text style={styles.scopeBadge}>Codex active</Text> : null}
                    </View>
                  </View>
                  <View style={[styles.providerActions, { flexWrap: "wrap", maxWidth: 200 }]}>
                    {forClaude ? (
                      <Pressable
                        onPress={() => void handleSwitchProvider(provider.id, "claude")}
                        style={({ pressed }) => [
                          styles.primaryButton,
                          styles.compactScopeButton,
                          pressed && styles.buttonPressed,
                          claudeActive && styles.disabledButton,
                        ]}
                        disabled={claudeActive}
                      >
                        <Text style={styles.primaryButtonText}>Use · Claude</Text>
                      </Pressable>
                    ) : null}
                    {forCodex ? (
                      <Pressable
                        onPress={() => void handleSwitchProvider(provider.id, "codex")}
                        style={({ pressed }) => [
                          styles.primaryButton,
                          styles.compactScopeButton,
                          pressed && styles.buttonPressed,
                          codexActive && styles.disabledButton,
                        ]}
                        disabled={codexActive}
                      >
                        <Text style={styles.primaryButtonText}>Use · Codex</Text>
                      </Pressable>
                    ) : null}
                    {!provider.isDefault ? (
                      <Pressable
                        onPress={() => void handleRemoveProvider(provider.id)}
                        style={({ pressed }) => [
                          styles.removeButton,
                          pressed && styles.buttonPressed,
                        ]}
                      >
                        <Text style={styles.removeButtonText}>Remove</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </SettingsSection>

      <SettingsSection title="Custom endpoint">
        <View style={[settingsStyles.card, styles.cardBody]}>
          {showAddProviderForm ? (
            <View style={styles.formBody}>
              <Text style={styles.fieldLabel}>Target</Text>
              <SegmentedControl
                options={CUSTOM_TARGET_SEGMENT_OPTIONS}
                value={customTarget}
                onValueChange={setCustomTarget}
                size="sm"
              />
              {customTarget === "claude" ? (
                <Text style={styles.usageHint}>
                  Claude Code is configured as native Anthropic Messages only (ANTHROPIC_BASE_URL).
                  OpenAI-compatible upstreams will be supported via a separate gateway later.
                </Text>
              ) : (
                <Text style={styles.usageHint}>
                  Codex is configured for the OpenAI Responses wire only (not Chat Completions).
                </Text>
              )}
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                value={editProviderName}
                onChangeText={setEditProviderName}
                placeholder="Provider name"
                placeholderTextColor={theme.colors.foregroundMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.textInput}
              />
              <Text style={styles.fieldLabel}>Endpoint</Text>
              <Text style={styles.usageHint}>
                Enter the API gateway origin (scheme + host) only. Do not include /v1; if you do, we
                strip a trailing /v1 on save. Claude uses a base without /v1; Codex config adds /v1
                automatically.
              </Text>
              <TextInput
                value={editProviderEndpoint}
                onChangeText={setEditProviderEndpoint}
                placeholder={ENDPOINT_PLACEHOLDER}
                placeholderTextColor={theme.colors.foregroundMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.textInput}
              />
              <Text style={styles.fieldLabel}>API key</Text>
              <Text style={styles.usageHint}>
                {customTarget === "claude"
                  ? "Anthropic-style credential for Claude Code; the desktop app maps it into the right env vars."
                  : "OpenAI-style credential (Codex / OPENAI_API_KEY semantics)."}
              </Text>
              <TextInput
                value={editProviderApiKey}
                onChangeText={setEditProviderApiKey}
                placeholder="API key"
                placeholderTextColor={theme.colors.foregroundMuted}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={styles.textInput}
              />
              <View style={styles.formActions}>
                <Pressable
                  onPress={() => void handleAddProvider()}
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.primaryButtonText}>Add</Text>
                </Pressable>
                <Pressable
                  onPress={closeCustomProviderForm}
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={openCustomProviderForm}
              style={({ pressed }) => [styles.addProviderButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.addProviderButtonText}>+ Add custom provider</Text>
            </Pressable>
          )}
        </View>
      </SettingsSection>
    </>
  );
}
