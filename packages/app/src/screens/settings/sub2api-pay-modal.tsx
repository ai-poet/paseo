import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { buildPayApiUrl, buildPayCenterUrl } from "@/screens/settings/sub2api-pay-url";
import { openExternalUrl } from "@/utils/open-external-url";

export interface Sub2APIPayModalProps {
  visible: boolean;
  endpoint: string;
  accessToken: string | null;
  onClose: () => void;
  onCompleted?: () => void;
}

interface PayConfig {
  enabledPaymentTypes: string[];
  minAmount: number;
  maxAmount: number;
  pendingCount: number;
  maxPendingOrders: number;
}

interface OrderListItem {
  id: string;
  status: string;
  rechargeSuccess?: boolean;
  rechargeStatus?: string;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readJsonSafe<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getApiErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload !== null) {
    const data = payload as Record<string, unknown>;
    if (typeof data.error === "string" && data.error.trim()) {
      return data.error;
    }
    if (typeof data.message === "string" && data.message.trim()) {
      return data.message;
    }
  }
  return fallback;
}

function paymentLabel(paymentType: string): string {
  switch (paymentType) {
    case "alipay":
    case "alipay_direct":
      return "Alipay";
    case "wxpay":
    case "wxpay_direct":
      return "WeChat Pay";
    case "stripe":
      return "Stripe";
    default:
      return paymentType;
  }
}

export function Sub2APIPayModal({
  visible,
  endpoint,
  accessToken,
  onClose,
  onCompleted,
}: Sub2APIPayModalProps) {
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isPollingOrder, setIsPollingOrder] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [config, setConfig] = useState<PayConfig | null>(null);
  const [selectedPaymentType, setSelectedPaymentType] = useState<string | null>(null);
  const [amountText, setAmountText] = useState("10");
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activePayUrl, setActivePayUrl] = useState<string | null>(null);
  const pollingStartedAtRef = useRef<number | null>(null);

  const payCenterUrl = useMemo(() => {
    if (!accessToken) {
      return null;
    }
    try {
      return buildPayCenterUrl(endpoint, accessToken);
    } catch {
      return null;
    }
  }, [accessToken, endpoint]);

  const resetState = useCallback(() => {
    setIsLoadingConfig(false);
    setIsCreatingOrder(false);
    setIsPollingOrder(false);
    setErrorMessage(null);
    setStatusMessage(null);
    setConfig(null);
    setSelectedPaymentType(null);
    setAmountText("10");
    setActiveOrderId(null);
    setActivePayUrl(null);
    pollingStartedAtRef.current = null;
  }, []);

  const loadPayConfig = useCallback(async () => {
    if (!visible || !accessToken) {
      return;
    }
    setIsLoadingConfig(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const ordersUrl = buildPayApiUrl(
        endpoint,
        `/api/orders/my?token=${encodeURIComponent(accessToken)}&page=1&page_size=20`,
      );
      const ordersRes = await fetch(ordersUrl);
      const ordersPayload = readJsonSafe(await ordersRes.text());
      if (!ordersRes.ok) {
        throw new Error(getApiErrorMessage(ordersPayload, "Failed to load order summary."));
      }
      const userId = readNumber(
        (ordersPayload as { user?: { id?: unknown } } | null)?.user?.id,
        NaN,
      );
      if (!Number.isFinite(userId) || userId <= 0) {
        throw new Error("Payment user info is unavailable.");
      }

      const pendingCount = readNumber(
        (ordersPayload as { summary?: { pending?: unknown } } | null)?.summary?.pending,
        0,
      );

      const userUrl = buildPayApiUrl(
        endpoint,
        `/api/user?user_id=${userId}&token=${encodeURIComponent(accessToken)}`,
      );
      const userRes = await fetch(userUrl);
      const userPayload = readJsonSafe(await userRes.text());
      if (!userRes.ok) {
        throw new Error(getApiErrorMessage(userPayload, "Failed to load payment config."));
      }

      const cfg = (userPayload as { config?: Record<string, unknown> } | null)?.config ?? {};
      const enabledPaymentTypes = Array.isArray(cfg.enabledPaymentTypes)
        ? cfg.enabledPaymentTypes.filter((entry): entry is string => typeof entry === "string")
        : [];
      const minAmount = readNumber(cfg.minAmount, 1);
      const maxAmount = readNumber(cfg.maxAmount, 1000);
      const maxPendingOrders = readNumber(cfg.maxPendingOrders, 3);

      setConfig({
        enabledPaymentTypes,
        minAmount,
        maxAmount,
        pendingCount,
        maxPendingOrders,
      });
      setSelectedPaymentType((current) => {
        if (current && enabledPaymentTypes.includes(current)) {
          return current;
        }
        return enabledPaymentTypes[0] ?? null;
      });
      setAmountText(String(Math.max(1, minAmount)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoadingConfig(false);
    }
  }, [accessToken, endpoint, visible]);

  useEffect(() => {
    if (!visible) {
      resetState();
      return;
    }
    void loadPayConfig();
  }, [loadPayConfig, resetState, visible]);

  const openPayTarget = useCallback(async (url: string | null) => {
    if (!url) {
      return;
    }
    await openExternalUrl(url);
  }, []);

  const createOrder = useCallback(async () => {
    if (!accessToken || !config) {
      setErrorMessage("Please sign in again before creating a payment order.");
      return;
    }
    if (!selectedPaymentType) {
      setErrorMessage("Select a payment method first.");
      return;
    }

    const amount = Number(amountText.trim());
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage("Enter a valid recharge amount.");
      return;
    }
    if (amount < config.minAmount || amount > config.maxAmount) {
      setErrorMessage(
        `Recharge amount must be between ${config.minAmount} and ${config.maxAmount}.`,
      );
      return;
    }
    if (config.pendingCount >= config.maxPendingOrders) {
      setErrorMessage(
        `You already have ${config.pendingCount} pending orders. Please complete or cancel them first.`,
      );
      return;
    }

    setIsCreatingOrder(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const ordersUrl = buildPayApiUrl(endpoint, "/api/orders");
      const createRes = await fetch(ordersUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: accessToken,
          amount,
          payment_type: selectedPaymentType,
          is_mobile: false,
        }),
      });
      const payload = readJsonSafe(await createRes.text());
      if (!createRes.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to create payment order."));
      }

      const orderId = (payload as { orderId?: unknown } | null)?.orderId;
      const payUrl = (payload as { payUrl?: unknown } | null)?.payUrl;
      const qrCode = (payload as { qrCode?: unknown } | null)?.qrCode;
      if (typeof orderId !== "string" || !orderId.trim()) {
        throw new Error("Payment order is missing an order id.");
      }

      const targetUrl =
        typeof payUrl === "string" && payUrl.trim()
          ? payUrl
          : typeof qrCode === "string" && qrCode.trim()
            ? qrCode
            : null;

      setActiveOrderId(orderId);
      setActivePayUrl(targetUrl);
      setIsPollingOrder(true);
      pollingStartedAtRef.current = Date.now();
      setStatusMessage(
        "Order created. Complete payment in your browser, then this dialog will refresh automatically.",
      );
      if (targetUrl) {
        await openExternalUrl(targetUrl);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCreatingOrder(false);
    }
  }, [accessToken, amountText, config, endpoint, selectedPaymentType]);

  const pollOrderStatus = useCallback(async () => {
    if (!accessToken || !activeOrderId) {
      return;
    }
    const ordersUrl = buildPayApiUrl(
      endpoint,
      `/api/orders/my?token=${encodeURIComponent(accessToken)}&page=1&page_size=100`,
    );
    const res = await fetch(ordersUrl);
    const payload = readJsonSafe(await res.text());
    if (!res.ok) {
      throw new Error(getApiErrorMessage(payload, "Failed to refresh order status."));
    }

    const orders = Array.isArray((payload as { orders?: unknown } | null)?.orders)
      ? (((payload as { orders: unknown[] }).orders as unknown[]) ?? [])
      : [];
    const order = orders.find((entry) => {
      const item = entry as Partial<OrderListItem>;
      return String(item.id ?? "") === activeOrderId;
    }) as Partial<OrderListItem> | undefined;
    if (!order) {
      return;
    }

    const status = String(order.status ?? "").toUpperCase();
    const rechargeStatus = String(order.rechargeStatus ?? "").toLowerCase();
    const rechargeSuccess = order.rechargeSuccess === true || rechargeStatus === "success";

    if (rechargeSuccess || status === "COMPLETED") {
      setIsPollingOrder(false);
      setStatusMessage("Recharge completed. Balance is being refreshed.");
      onCompleted?.();
      onClose();
      return;
    }

    if (status === "FAILED" || status === "CANCELLED" || status === "EXPIRED") {
      setIsPollingOrder(false);
      setErrorMessage(`Order ${status.toLowerCase()}. You can create a new order and try again.`);
    }
  }, [accessToken, activeOrderId, endpoint, onClose, onCompleted]);

  useEffect(() => {
    if (!visible || !isPollingOrder || !activeOrderId) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = async () => {
      if (cancelled) {
        return;
      }
      try {
        await pollOrderStatus();
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (cancelled) {
          return;
        }
        const startedAt = pollingStartedAtRef.current;
        const elapsed = startedAt === null ? 0 : Date.now() - startedAt;
        if (elapsed > 5 * 60 * 1000) {
          setIsPollingOrder(false);
          setStatusMessage("Automatic status polling timed out. You can refresh manually.");
          return;
        }
        timer = setTimeout(() => void run(), 2500);
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [activeOrderId, isPollingOrder, pollOrderStatus, visible]);

  return (
    <AdaptiveModalSheet
      visible={visible}
      onClose={onClose}
      title="Add balance"
      scrollable={false}
      snapPoints={["80%", "95%"]}
    >
      <View style={styles.root}>
        {isLoadingConfig ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Loading payment methods…</Text>
          </View>
        ) : (
          <View style={styles.formBlock}>
            <Text style={styles.hintText}>
              Recharge uses Sub2APIPay APIs directly. After creating an order, payment opens in your
              browser.
            </Text>

            {config ? (
              <>
                <Text style={styles.fieldLabel}>Amount (USD)</Text>
                <TextInput
                  value={amountText}
                  onChangeText={setAmountText}
                  keyboardType="decimal-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={`${config.minAmount}`}
                  style={styles.textInput}
                />
                <Text style={styles.rangeHint}>
                  Allowed range: {config.minAmount} - {config.maxAmount}
                </Text>

                <Text style={styles.fieldLabel}>Payment method</Text>
                <View style={styles.paymentTypeList}>
                  {config.enabledPaymentTypes.map((type) => {
                    const selected = selectedPaymentType === type;
                    return (
                      <Pressable
                        key={type}
                        onPress={() => setSelectedPaymentType(type)}
                        style={({ pressed }) => [
                          styles.paymentTypeChip,
                          selected && styles.paymentTypeChipSelected,
                          pressed && styles.buttonPressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.paymentTypeChipText,
                            selected && styles.paymentTypeChipTextSelected,
                          ]}
                        >
                          {paymentLabel(type)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {config.enabledPaymentTypes.length === 0 ? (
                  <Text style={styles.errorText}>
                    No payment methods are available for this account right now.
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.errorText}>
                Could not load payment config. You can still open the full pay center in browser.
              </Text>
            )}

            {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
            {activeOrderId ? (
              <Text style={styles.orderHint}>Current order: {activeOrderId}</Text>
            ) : null}
            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          </View>
        )}

        <View style={styles.footer}>
          <Button variant="outline" size="sm" onPress={onClose}>
            Close
          </Button>
          <Button
            variant="outline"
            size="sm"
            onPress={() => void openPayTarget(activePayUrl ?? payCenterUrl)}
            disabled={!activePayUrl && !payCenterUrl}
          >
            Open in browser
          </Button>
          <Button
            variant="outline"
            size="sm"
            onPress={() =>
              void pollOrderStatus().catch((error) => {
                setErrorMessage(error instanceof Error ? error.message : String(error));
              })
            }
            disabled={!activeOrderId || isPollingOrder}
          >
            {isPollingOrder ? "Checking…" : "Check status"}
          </Button>
          <Button
            size="sm"
            onPress={() => void createOrder()}
            disabled={
              isLoadingConfig ||
              isCreatingOrder ||
              isPollingOrder ||
              !config ||
              !selectedPaymentType ||
              config.enabledPaymentTypes.length === 0
            }
          >
            {isCreatingOrder ? "Creating…" : "Create order"}
          </Button>
        </View>
      </View>
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    minHeight: 360,
    gap: theme.spacing[3],
  },
  formBlock: {
    gap: theme.spacing[2],
  },
  loadingBox: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
  },
  hintText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: theme.fontSize.xs * 1.5,
  },
  fieldLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    marginTop: theme.spacing[1],
  },
  textInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    backgroundColor: theme.colors.surface0,
  },
  rangeHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  paymentTypeList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  paymentTypeChip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surface1,
  },
  paymentTypeChipSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent,
  },
  paymentTypeChipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  paymentTypeChipTextSelected: {
    color: theme.colors.accentForeground,
  },
  loadingText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  statusText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing[1],
  },
  orderHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing[1],
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
    flexWrap: "wrap",
  },
  buttonPressed: {
    opacity: 0.85,
  },
}));
