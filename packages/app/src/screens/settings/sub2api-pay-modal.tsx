import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { WebView } from "react-native-webview";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { normalizeSub2APIEndpoint } from "@/lib/sub2api-client";
import { openExternalUrl } from "@/utils/open-external-url";

export interface Sub2APIPayModalProps {
  visible: boolean;
  endpoint: string;
  accessToken: string | null;
  onClose: () => void;
  onCompleted?: () => void;
}

function buildPayUrl(endpoint: string, accessToken: string): string {
  const base = normalizeSub2APIEndpoint(endpoint);
  return `${base}/pay?token=${encodeURIComponent(accessToken)}&theme=dark&ui_mode=embedded&lang=zh`;
}

function isPayResultUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.pathname === "/pay/result" || parsed.pathname.startsWith("/pay/result/");
  } catch {
    return rawUrl.includes("/pay/result");
  }
}

export function Sub2APIPayModal({
  visible,
  endpoint,
  accessToken,
  onClose,
  onCompleted,
}: Sub2APIPayModalProps) {
  const [isLoading, setIsLoading] = useState(true);

  const payUrl = useMemo(() => {
    if (!accessToken) {
      return null;
    }
    try {
      return buildPayUrl(endpoint, accessToken);
    } catch {
      return null;
    }
  }, [accessToken, endpoint]);

  const handleOpenExternal = useCallback(async () => {
    if (!payUrl) {
      return;
    }
    await openExternalUrl(payUrl);
  }, [payUrl]);

  const handleNavigationStateChange = useCallback(
    (state: { url?: string }) => {
      const nextUrl = state.url ?? "";
      if (!nextUrl) {
        return;
      }
      if (isPayResultUrl(nextUrl)) {
        onCompleted?.();
        onClose();
      }
    },
    [onClose, onCompleted],
  );

  return (
    <AdaptiveModalSheet
      visible={visible}
      onClose={onClose}
      title="充值"
      scrollable={false}
      snapPoints={["80%", "95%"]}
    >
      <View style={styles.root}>
        {payUrl ? (
          <View style={styles.webviewContainer}>
            {isLoading ? (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator />
                <Text style={styles.loadingText}>加载支付页面中...</Text>
              </View>
            ) : null}
            <WebView
              source={{ uri: payUrl }}
              style={styles.webview}
              onLoadStart={() => setIsLoading(true)}
              onLoadEnd={() => setIsLoading(false)}
              onNavigationStateChange={handleNavigationStateChange}
            />
          </View>
        ) : (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>无法生成支付链接，请确认登录状态和 Sub2API Endpoint。</Text>
          </View>
        )}

        <View style={styles.footer}>
          <Button variant="outline" size="sm" onPress={onClose}>
            关闭
          </Button>
          <Button size="sm" onPress={() => void handleOpenExternal()} disabled={!payUrl}>
            在浏览器中打开
          </Button>
        </View>
      </View>
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    minHeight: 420,
    gap: theme.spacing[3],
  },
  webviewContainer: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    overflow: "hidden",
    backgroundColor: theme.colors.surface1,
    minHeight: 360,
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
    backgroundColor: "rgba(0,0,0,0.08)",
    zIndex: 2,
  },
  loadingText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  errorBox: {
    borderWidth: 1,
    borderColor: theme.colors.destructive,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    backgroundColor: "rgba(248,113,113,0.08)",
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.xs,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
}));
