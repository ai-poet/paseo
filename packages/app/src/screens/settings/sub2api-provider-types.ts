/**
 * Desktop provider store payload (see @getpaseo/desktop provider-switch).
 * Only Claude Code and Codex are supported in the managed UI.
 */
export type ManagedProviderTarget = "claude" | "codex";

/** Claude Code is Anthropic-native only in settings we write; OpenAI-shaped upstreams are out of scope for now. */
export type ClaudeApiFormat = "anthropic";

export type CodexWireApi = "responses" | "chat";

export interface DesktopProviderPayload {
  id: string;
  name: string;
  type: "default" | "custom";
  endpoint: string;
  apiKey: string;
  isDefault: boolean;
  /** Omitted on managed default = applies to both CLIs. */
  target?: ManagedProviderTarget;
  claudeApiFormat?: ClaudeApiFormat;
  codexWireApi?: CodexWireApi;
}

export interface ProviderStore {
  providers: DesktopProviderPayload[];
  activeProviderId: string | null;
}
