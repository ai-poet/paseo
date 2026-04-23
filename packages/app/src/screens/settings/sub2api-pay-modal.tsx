import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from "react-native";
import * as QRCode from "qrcode";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/contexts/toast-context";
import { isWeb } from "@/constants/platform";
import {
  buildPayCenterApiUrl,
  buildPayCenterOrderStatusUrl,
  buildPayCenterStripePopupUrl,
  buildPayCenterUrl,
} from "@/screens/settings/sub2api-pay-url";
import { openExternalUrl } from "@/utils/open-external-url";

export interface Sub2APIPayModalProps {
  visible: boolean;
  endpoint: string;
  accessToken: string | null;
  onClose: () => void;
  onCompleted?: () => void;
}

interface PaymentCenterMethodLimit {
  available: boolean;
  remaining: number | null;
  singleMin?: number;
  singleMax?: number;
  feeRate?: number;
}

interface PaymentCenterConfig {
  userDisplayName: string;
  userBalance: number | null;
  enabledPaymentTypes: string[];
  methodLimits: Record<string, PaymentCenterMethodLimit>;
  minAmount: number;
  maxAmount: number;
  maxPendingOrders: number;
  pendingCount: number;
  usdExchangeRate: number | null;
  balanceCreditCnyPerUsd: number | null;
  stripePublishableKey: string | null;
}

interface PaymentCenterCreateOrderResponse {
  orderId: string;
  amount: number;
  payAmount: number | null;
  status: string;
  paymentType: string;
  payUrl: string | null;
  qrCode: string | null;
  clientSecret: string | null;
  expiresAt: string;
  statusAccessToken: string;
}

interface PaymentCenterOrderStatus {
  id: string;
  status: string;
  expiresAt: string;
  paymentSuccess: boolean;
  rechargeSuccess: boolean;
  rechargeStatus: string;
  failedReason: string | null;
}

type ModalStage = "loading-config" | "form" | "paying" | "result" | "error";

type OrderFlowKind = "redirect" | "qr" | "stripe";

type StageDescriptor = {
  title: string;
  message: string;
  tone: "default" | "success" | "warning" | "error";
};

const DEFAULT_LANG = "zh";
const DEFAULT_THEME = "dark";
const QUICK_AMOUNTS = [10, 20, 50, 100, 200, 500];
const AMOUNT_PATTERN = /^\d*(\.\d{0,2})?$/;
const TERMINAL_ORDER_STATUSES = new Set(["FAILED", "CANCELLED", "EXPIRED", "COMPLETED"]);

function readJsonSafe<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getApiErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload !== null) {
    const data = payload as Record<string, unknown>;
    const error = readString(data.error);
    if (error) {
      return error;
    }
    const message = readString(data.message);
    if (message) {
      return message;
    }
  }
  return fallback;
}

function formatUsd(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(2)}` : "--";
}

function formatCny(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `¥${value.toFixed(2)}` : "--";
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

function isStripePaymentType(paymentType: string): boolean {
  return paymentType === "stripe";
}

function resolveOrderFlow(order: PaymentCenterCreateOrderResponse): OrderFlowKind {
  if (order.clientSecret) {
    return "stripe";
  }
  if (order.qrCode) {
    return "qr";
  }
  return "redirect";
}

function formatTimeRemaining(expiresAt: string): string {
  const expiresAtMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) {
    return "--";
  }
  const diff = expiresAtMs - Date.now();
  if (diff <= 0) {
    return "Expired";
  }
  const totalSeconds = Math.floor(diff / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function isTerminalOrderStatus(status: PaymentCenterOrderStatus): boolean {
  return TERMINAL_ORDER_STATUSES.has(status.status.toUpperCase());
}

function createSeedOrderStatus(order: PaymentCenterCreateOrderResponse): PaymentCenterOrderStatus {
  return {
    id: order.orderId,
    status: order.status,
    expiresAt: order.expiresAt,
    paymentSuccess: false,
    rechargeSuccess: false,
    rechargeStatus: "not_paid",
    failedReason: null,
  };
}

function describeOrderStatus(status: PaymentCenterOrderStatus): StageDescriptor {
  if (status.rechargeSuccess || status.status.toUpperCase() === "COMPLETED") {
    return {
      title: "Recharge complete",
      message: "Your balance has been credited. Closing this dialog…",
      tone: "success",
    };
  }
  if (status.paymentSuccess) {
    if (status.rechargeStatus === "paid_pending" || status.rechargeStatus === "recharging") {
      return {
        title: "Payment received",
        message: "Your payment was received and the balance top-up is still being processed.",
        tone: "success",
      };
    }
    if (status.rechargeStatus === "failed") {
      return {
        title: "Payment received, recharge not finished",
        message:
          status.failedReason ??
          "Payment completed, but the recharge has not finished yet. Please try again later or contact support.",
        tone: "warning",
      };
    }
  }

  const normalizedStatus = status.status.toUpperCase();
  if (normalizedStatus === "PENDING") {
    return {
      title: "Awaiting payment",
      message: "Complete payment using the method below. We will refresh this order automatically.",
      tone: "default",
    };
  }
  if (normalizedStatus === "FAILED") {
    return {
      title: "Payment failed",
      message:
        status.failedReason ??
        "This payment did not complete successfully. You can go back and create a new order.",
      tone: "error",
    };
  }
  if (normalizedStatus === "CANCELLED") {
    return {
      title: "Order cancelled",
      message: "This order was cancelled before payment completed.",
      tone: "warning",
    };
  }
  if (normalizedStatus === "EXPIRED") {
    return {
      title: "Order expired",
      message: "This order expired before payment completed. Create a new order to try again.",
      tone: "warning",
    };
  }

  return {
    title: "Payment status updated",
    message: "The payment status changed. You can go back and create a new order if needed.",
    tone: "default",
  };
}

function canUseEmbeddedStripePopup(endpoint: string): boolean {
  if (!isWeb || typeof window === "undefined") {
    return false;
  }
  try {
    return new URL(endpoint).origin === window.location.origin;
  } catch {
    return false;
  }
}

function estimateSettlementSummary(input: {
  amount: number | null;
  feeRate: number;
  balanceCreditCnyPerUsd: number | null;
}): { creditedUsd: string; estimatedPay: string; feeText: string | null; rateText: string | null } {
  const amount = input.amount;
  const creditedUsd = formatUsd(amount);
  const rateText =
    typeof input.balanceCreditCnyPerUsd === "number" &&
    Number.isFinite(input.balanceCreditCnyPerUsd)
      ? `Estimated settlement: ${formatCny(amount == null ? null : amount * input.balanceCreditCnyPerUsd)}`
      : null;

  if (amount == null) {
    return {
      creditedUsd,
      estimatedPay: "--",
      feeText: input.feeRate > 0 ? `Method fee: ${input.feeRate}%` : null,
      rateText,
    };
  }

  const settlementBase =
    typeof input.balanceCreditCnyPerUsd === "number" &&
    Number.isFinite(input.balanceCreditCnyPerUsd)
      ? amount * input.balanceCreditCnyPerUsd
      : amount;
  const estimatedPay = settlementBase * (1 + input.feeRate / 100);

  return {
    creditedUsd,
    estimatedPay:
      typeof input.balanceCreditCnyPerUsd === "number" &&
      Number.isFinite(input.balanceCreditCnyPerUsd)
        ? formatCny(estimatedPay)
        : formatUsd(estimatedPay),
    feeText: input.feeRate > 0 ? `Method fee: ${input.feeRate}%` : null,
    rateText,
  };
}

export function Sub2APIPayModal({
  visible,
  endpoint,
  accessToken,
  onClose,
  onCompleted,
}: Sub2APIPayModalProps) {
  const toast = useToast();
  const [stage, setStage] = useState<ModalStage>("loading-config");
  const [config, setConfig] = useState<PaymentCenterConfig | null>(null);
  const [selectedPaymentType, setSelectedPaymentType] = useState<string | null>(null);
  const [amountText, setAmountText] = useState("10");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<PaymentCenterCreateOrderResponse | null>(null);
  const [activeOrderStatus, setActiveOrderStatus] = useState<PaymentCenterOrderStatus | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isPollingOrder, setIsPollingOrder] = useState(false);
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);
  const [isOpeningStripePopup, setIsOpeningStripePopup] = useState(false);
  const [stripePopupBlocked, setStripePopupBlocked] = useState(false);
  const [countdownTick, setCountdownTick] = useState(0);
  const pollingStartedAtRef = useRef<number | null>(null);
  const paymentCompletionHandledRef = useRef(false);

  const payCenterUrl = useMemo(() => {
    if (!accessToken) {
      return null;
    }
    try {
      return buildPayCenterUrl(endpoint, accessToken, {
        lang: DEFAULT_LANG,
        theme: DEFAULT_THEME,
        uiMode: "embedded",
      });
    } catch {
      return null;
    }
  }, [accessToken, endpoint]);

  const selectedMethodLimit = useMemo(() => {
    if (!config || !selectedPaymentType) {
      return null;
    }
    return config.methodLimits[selectedPaymentType] ?? null;
  }, [config, selectedPaymentType]);

  const parsedAmount = useMemo(() => {
    if (!amountText.trim()) {
      return null;
    }
    const next = Number(amountText);
    return Number.isFinite(next) && next > 0 ? next : null;
  }, [amountText]);

  const effectiveMinAmount = useMemo(() => {
    if (!config) {
      return 1;
    }
    const methodMin = readNumber(selectedMethodLimit?.singleMin);
    return methodMin && methodMin > 0 ? Math.max(config.minAmount, methodMin) : config.minAmount;
  }, [config, selectedMethodLimit]);

  const effectiveMaxAmount = useMemo(() => {
    if (!config) {
      return 1000;
    }
    const methodMax = readNumber(selectedMethodLimit?.singleMax);
    return methodMax && methodMax > 0 ? methodMax : config.maxAmount;
  }, [config, selectedMethodLimit]);

  const feeRate = useMemo(() => {
    const value = readNumber(selectedMethodLimit?.feeRate);
    return value && value > 0 ? value : 0;
  }, [selectedMethodLimit]);

  const paymentSummary = useMemo(
    () =>
      estimateSettlementSummary({
        amount: parsedAmount,
        feeRate,
        balanceCreditCnyPerUsd: config?.balanceCreditCnyPerUsd ?? null,
      }),
    [config?.balanceCreditCnyPerUsd, feeRate, parsedAmount],
  );

  const canUseStripePopup = useMemo(() => canUseEmbeddedStripePopup(endpoint), [endpoint]);

  const activeFlow = useMemo(
    () => (activeOrder ? resolveOrderFlow(activeOrder) : null),
    [activeOrder],
  );

  const currentOrderStatus =
    activeOrderStatus ?? (activeOrder ? createSeedOrderStatus(activeOrder) : null);
  const statusDescriptor = currentOrderStatus ? describeOrderStatus(currentOrderStatus) : null;
  const timeRemaining = useMemo(
    () => (currentOrderStatus ? formatTimeRemaining(currentOrderStatus.expiresAt) : "--"),
    [countdownTick, currentOrderStatus],
  );

  const resetOrderState = useCallback(() => {
    setActiveOrder(null);
    setActiveOrderStatus(null);
    setQrCodeDataUrl(null);
    setIsPollingOrder(false);
    setIsCancellingOrder(false);
    setIsOpeningStripePopup(false);
    setStripePopupBlocked(false);
    pollingStartedAtRef.current = null;
    paymentCompletionHandledRef.current = false;
  }, []);

  const resetAllState = useCallback(() => {
    setStage("loading-config");
    setConfig(null);
    setSelectedPaymentType(null);
    setAmountText("10");
    setErrorMessage(null);
    setIsLoadingConfig(false);
    setIsCreatingOrder(false);
    resetOrderState();
  }, [resetOrderState]);

  const loadPayConfig = useCallback(async () => {
    if (!visible || !accessToken) {
      return;
    }

    setStage("loading-config");
    setIsLoadingConfig(true);
    setErrorMessage(null);
    resetOrderState();

    try {
      const ordersUrl = buildPayCenterApiUrl(
        endpoint,
        `/api/orders/my?token=${encodeURIComponent(accessToken)}&page=1&page_size=20`,
      );
      const ordersResponse = await fetch(ordersUrl);
      const ordersPayload = readJsonSafe(await ordersResponse.text());
      if (!ordersResponse.ok) {
        throw new Error(getApiErrorMessage(ordersPayload, "Failed to load order summary."));
      }

      const userId = readNumber((ordersPayload as { user?: { id?: unknown } } | null)?.user?.id);
      if (!userId || userId <= 0) {
        throw new Error("Payment user info is unavailable.");
      }

      const userDisplayName =
        readString(
          (
            ordersPayload as {
              user?: { displayName?: unknown; username?: unknown; email?: unknown };
            } | null
          )?.user?.displayName,
        ) ??
        readString(
          (ordersPayload as { user?: { username?: unknown; email?: unknown } } | null)?.user
            ?.username,
        ) ??
        readString((ordersPayload as { user?: { email?: unknown } } | null)?.user?.email) ??
        "Account";
      const userBalance = readNumber(
        (ordersPayload as { user?: { balance?: unknown } } | null)?.user?.balance,
      );
      const pendingCount =
        readNumber(
          (ordersPayload as { summary?: { pending?: unknown } } | null)?.summary?.pending,
        ) ?? 0;

      const userUrl = buildPayCenterApiUrl(
        endpoint,
        `/api/user?user_id=${userId}&token=${encodeURIComponent(accessToken)}&lang=${encodeURIComponent(DEFAULT_LANG)}`,
      );
      const userResponse = await fetch(userUrl, {
        method: "GET",
        headers: { "Accept-Language": DEFAULT_LANG },
      });
      const userPayload = readJsonSafe(await userResponse.text());
      if (!userResponse.ok) {
        throw new Error(getApiErrorMessage(userPayload, "Failed to load payment config."));
      }

      const configPayload =
        (userPayload as { config?: Record<string, unknown> } | null)?.config ?? {};
      const enabledPaymentTypes = Array.isArray(configPayload.enabledPaymentTypes)
        ? configPayload.enabledPaymentTypes.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [];
      const methodLimits =
        typeof configPayload.methodLimits === "object" && configPayload.methodLimits !== null
          ? (configPayload.methodLimits as Record<string, PaymentCenterMethodLimit>)
          : {};

      const nextConfig: PaymentCenterConfig = {
        userDisplayName,
        userBalance,
        enabledPaymentTypes,
        methodLimits,
        minAmount: readNumber(configPayload.minAmount) ?? 1,
        maxAmount: readNumber(configPayload.maxAmount) ?? 1000,
        maxPendingOrders: readNumber(configPayload.maxPendingOrders) ?? 3,
        pendingCount,
        usdExchangeRate: readNumber(configPayload.usdExchangeRate),
        balanceCreditCnyPerUsd: readNumber(configPayload.balanceCreditCnyPerUsd),
        stripePublishableKey: readString(configPayload.stripePublishableKey),
      };

      setConfig(nextConfig);
      setSelectedPaymentType((current) => {
        if (current && nextConfig.enabledPaymentTypes.includes(current)) {
          return current;
        }
        return nextConfig.enabledPaymentTypes[0] ?? null;
      });
      setAmountText(String(Math.max(1, nextConfig.minAmount)));
      setStage("form");
    } catch (error) {
      setConfig(null);
      setStage("error");
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoadingConfig(false);
    }
  }, [accessToken, endpoint, resetOrderState, visible]);

  useEffect(() => {
    if (!visible) {
      resetAllState();
      return;
    }
    void loadPayConfig();
  }, [loadPayConfig, resetAllState, visible]);

  const handleAmountChange = useCallback((value: string) => {
    if (!AMOUNT_PATTERN.test(value)) {
      return;
    }
    setAmountText(value);
  }, []);

  const openPaymentTarget = useCallback(async (url: string | null) => {
    if (!url) {
      return;
    }
    await openExternalUrl(url);
  }, []);

  const openStripePopup = useCallback(
    (order: PaymentCenterCreateOrderResponse, paymentMethod = "card"): boolean => {
      if (!config?.stripePublishableKey || !order.clientSecret || !canUseStripePopup || !isWeb) {
        return false;
      }
      const popupUrl = buildPayCenterStripePopupUrl({
        endpoint,
        orderId: order.orderId,
        amount: order.payAmount ?? order.amount,
        accessToken: order.statusAccessToken,
        method: paymentMethod,
        lang: DEFAULT_LANG,
        theme: DEFAULT_THEME,
      });

      const popup = window.open(popupUrl, "stripe_payment", "width=500,height=700,scrollbars=yes");
      if (!popup || popup.closed) {
        setStripePopupBlocked(true);
        return false;
      }

      const targetOrigin = new URL(popupUrl).origin;
      const onReady = (event: MessageEvent) => {
        if (
          event.source !== popup ||
          event.origin !== targetOrigin ||
          event.data?.type !== "STRIPE_POPUP_READY"
        ) {
          return;
        }
        window.removeEventListener("message", onReady);
        popup.postMessage(
          {
            type: "STRIPE_POPUP_INIT",
            clientSecret: order.clientSecret,
            publishableKey: config.stripePublishableKey,
          },
          targetOrigin,
        );
      };

      window.addEventListener("message", onReady);
      setStripePopupBlocked(false);
      return true;
    },
    [canUseStripePopup, config?.stripePublishableKey, endpoint],
  );

  const handleCreateOrder = useCallback(async () => {
    if (!accessToken || !config) {
      setErrorMessage("Please sign in again before creating a payment order.");
      return;
    }
    if (!selectedPaymentType) {
      setErrorMessage("Select a payment method first.");
      return;
    }

    if (isStripePaymentType(selectedPaymentType) && !canUseStripePopup) {
      setErrorMessage(
        "Stripe checkout needs the full payment center in this runtime. Open the full pay center instead.",
      );
      if (payCenterUrl) {
        await openPaymentTarget(payCenterUrl);
      }
      return;
    }

    if (config.pendingCount >= config.maxPendingOrders) {
      setErrorMessage(
        `You already have ${config.pendingCount} pending orders. Please complete or cancel them first.`,
      );
      return;
    }
    if (selectedMethodLimit?.available === false) {
      setErrorMessage("This payment method is currently unavailable.");
      return;
    }
    if (parsedAmount == null) {
      setErrorMessage("Enter a valid recharge amount.");
      return;
    }
    if (parsedAmount < effectiveMinAmount || parsedAmount > effectiveMaxAmount) {
      setErrorMessage(
        `Recharge amount must be between ${effectiveMinAmount} and ${effectiveMaxAmount}.`,
      );
      return;
    }

    setIsCreatingOrder(true);
    setErrorMessage(null);
    try {
      const ordersUrl = buildPayCenterApiUrl(endpoint, "/api/orders");
      const response = await fetch(ordersUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: accessToken,
          amount: parsedAmount,
          payment_type: selectedPaymentType,
          is_mobile: false,
        }),
      });
      const payload = readJsonSafe(await response.text());
      if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to create payment order."));
      }

      const createdOrder: PaymentCenterCreateOrderResponse = {
        orderId:
          readString((payload as { orderId?: unknown } | null)?.orderId) ??
          (() => {
            throw new Error("Payment order is missing an order id.");
          })(),
        amount: readNumber((payload as { amount?: unknown } | null)?.amount) ?? parsedAmount,
        payAmount: readNumber((payload as { payAmount?: unknown } | null)?.payAmount),
        status: readString((payload as { status?: unknown } | null)?.status) ?? "PENDING",
        paymentType:
          readString((payload as { paymentType?: unknown } | null)?.paymentType) ??
          selectedPaymentType,
        payUrl: readString((payload as { payUrl?: unknown } | null)?.payUrl),
        qrCode: readString((payload as { qrCode?: unknown } | null)?.qrCode),
        clientSecret: readString((payload as { clientSecret?: unknown } | null)?.clientSecret),
        expiresAt:
          readString((payload as { expiresAt?: unknown } | null)?.expiresAt) ??
          new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        statusAccessToken:
          readString((payload as { statusAccessToken?: unknown } | null)?.statusAccessToken) ??
          (() => {
            throw new Error("Payment order is missing a status access token.");
          })(),
      };

      setActiveOrder(createdOrder);
      setActiveOrderStatus(createSeedOrderStatus(createdOrder));
      setStage("paying");
      setIsPollingOrder(true);
      pollingStartedAtRef.current = Date.now();
      paymentCompletionHandledRef.current = false;

      const flow = resolveOrderFlow(createdOrder);
      if (flow === "redirect") {
        await openPaymentTarget(createdOrder.payUrl);
      } else if (flow === "stripe") {
        const opened = openStripePopup(createdOrder);
        if (!opened) {
          setErrorMessage(
            "Stripe payment window was blocked. Use the button below to try opening it again.",
          );
        }
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setStage("form");
    } finally {
      setIsCreatingOrder(false);
    }
  }, [
    accessToken,
    canUseStripePopup,
    config,
    effectiveMaxAmount,
    effectiveMinAmount,
    endpoint,
    openPaymentTarget,
    openStripePopup,
    parsedAmount,
    payCenterUrl,
    selectedMethodLimit?.available,
    selectedPaymentType,
  ]);

  const pollOrderStatus = useCallback(async (): Promise<PaymentCenterOrderStatus | null> => {
    if (!activeOrder) {
      return null;
    }
    const statusUrl = buildPayCenterOrderStatusUrl(
      endpoint,
      activeOrder.orderId,
      activeOrder.statusAccessToken,
    );
    const response = await fetch(statusUrl);
    const payload = readJsonSafe(await response.text());
    if (!response.ok) {
      throw new Error(getApiErrorMessage(payload, "Failed to refresh order status."));
    }

    return {
      id: readString((payload as { id?: unknown } | null)?.id) ?? activeOrder.orderId,
      status: readString((payload as { status?: unknown } | null)?.status) ?? "PENDING",
      expiresAt:
        readString((payload as { expiresAt?: unknown } | null)?.expiresAt) ?? activeOrder.expiresAt,
      paymentSuccess: (payload as { paymentSuccess?: unknown } | null)?.paymentSuccess === true,
      rechargeSuccess: (payload as { rechargeSuccess?: unknown } | null)?.rechargeSuccess === true,
      rechargeStatus:
        readString((payload as { rechargeStatus?: unknown } | null)?.rechargeStatus) ?? "not_paid",
      failedReason: readString((payload as { failedReason?: unknown } | null)?.failedReason),
    };
  }, [activeOrder, endpoint]);

  const refreshBalanceAndClose = useCallback(() => {
    if (paymentCompletionHandledRef.current) {
      return;
    }
    paymentCompletionHandledRef.current = true;
    toast.show("Payment successful. Balance updated.", { variant: "success" });
    onCompleted?.();
    onClose();
  }, [onClose, onCompleted, toast]);

  useEffect(() => {
    if (!currentOrderStatus) {
      return;
    }
    if (
      currentOrderStatus.rechargeSuccess ||
      currentOrderStatus.status.toUpperCase() === "COMPLETED"
    ) {
      refreshBalanceAndClose();
      return;
    }
    if (
      currentOrderStatus.rechargeStatus === "failed" ||
      ["FAILED", "CANCELLED", "EXPIRED"].includes(currentOrderStatus.status.toUpperCase())
    ) {
      setStage("result");
      setIsPollingOrder(false);
    }
  }, [currentOrderStatus, refreshBalanceAndClose]);

  useEffect(() => {
    if (stage !== "paying" || !activeOrder || !isPollingOrder) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      if (cancelled) {
        return;
      }
      try {
        const nextStatus = await pollOrderStatus();
        if (cancelled || !nextStatus) {
          return;
        }
        setActiveOrderStatus(nextStatus);
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
          setStage("result");
          setErrorMessage(
            "Payment status polling timed out. You can go back to recharge and try again if needed.",
          );
          return;
        }
        timer = setTimeout(() => void run(), 2000);
      }
    };

    void run();
    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [activeOrder, isPollingOrder, pollOrderStatus, stage]);

  useEffect(() => {
    if (stage !== "paying" || activeFlow !== "qr" || !activeOrder?.qrCode) {
      setQrCodeDataUrl(null);
      return;
    }

    let cancelled = false;
    QRCode.toDataURL(activeOrder.qrCode, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 560,
    })
      .then((uri) => {
        if (!cancelled) {
          setQrCodeDataUrl(uri);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrCodeDataUrl(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeFlow, activeOrder?.qrCode, stage]);

  useEffect(() => {
    if (stage !== "paying" || !currentOrderStatus) {
      return;
    }
    const timer = setInterval(() => {
      setCountdownTick((value) => value + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [currentOrderStatus, stage]);

  const handleCancelOrder = useCallback(async () => {
    if (!activeOrder || !accessToken) {
      return;
    }
    setIsCancellingOrder(true);
    setErrorMessage(null);
    try {
      const latest = await pollOrderStatus();
      if (
        latest &&
        (latest.paymentSuccess || latest.rechargeSuccess || isTerminalOrderStatus(latest))
      ) {
        setActiveOrderStatus(latest);
        return;
      }

      const cancelUrl = buildPayCenterApiUrl(endpoint, `/api/orders/${activeOrder.orderId}/cancel`);
      const cancelResponse = await fetch(cancelUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: accessToken }),
      });

      if (!cancelResponse.ok) {
        const cancelPayload = readJsonSafe(await cancelResponse.text());
        const refreshed = await pollOrderStatus().catch(() => null);
        if (refreshed) {
          setActiveOrderStatus(refreshed);
          return;
        }
        throw new Error(getApiErrorMessage(cancelPayload, "Failed to cancel this order."));
      }

      const cancelledStatus: PaymentCenterOrderStatus = {
        id: activeOrder.orderId,
        status: "CANCELLED",
        expiresAt: activeOrder.expiresAt,
        paymentSuccess: false,
        rechargeSuccess: false,
        rechargeStatus: "closed",
        failedReason: null,
      };
      setActiveOrderStatus(cancelledStatus);
      setStage("result");
      setIsPollingOrder(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCancellingOrder(false);
    }
  }, [accessToken, activeOrder, endpoint, pollOrderStatus]);

  const handleBackToForm = useCallback(() => {
    setErrorMessage(null);
    setStage("form");
    void loadPayConfig();
  }, [loadPayConfig]);

  const mainCtaLabel = useMemo(() => {
    if (isLoadingConfig) {
      return "Loading…";
    }
    if (isCreatingOrder) {
      return "Creating order…";
    }
    if (selectedPaymentType && isStripePaymentType(selectedPaymentType) && !canUseStripePopup) {
      return "Open full pay center";
    }
    return "Continue to payment";
  }, [canUseStripePopup, isCreatingOrder, isLoadingConfig, selectedPaymentType]);

  const mainCtaDisabled =
    isLoadingConfig ||
    isCreatingOrder ||
    !config ||
    !selectedPaymentType ||
    config.enabledPaymentTypes.length === 0 ||
    selectedMethodLimit?.available === false;

  const quickAmounts = useMemo(
    () =>
      QUICK_AMOUNTS.filter((value) => value >= effectiveMinAmount && value <= effectiveMaxAmount),
    [effectiveMaxAmount, effectiveMinAmount],
  );

  return (
    <AdaptiveModalSheet
      visible={visible}
      onClose={onClose}
      title="Add balance"
      scrollable
      snapPoints={["80%", "95%"]}
    >
      <View style={styles.root}>
        {stage === "loading-config" ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator />
            <Text style={styles.loadingText}>Loading recharge options…</Text>
          </View>
        ) : null}

        {stage === "error" ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Unable to load recharge options</Text>
            <Text style={styles.errorText}>
              {errorMessage ?? "You can still open the full payment center in your browser."}
            </Text>
            {payCenterUrl ? (
              <Button
                size="sm"
                onPress={() => void openPaymentTarget(payCenterUrl)}
                style={styles.primaryCta}
              >
                Open full pay center
              </Button>
            ) : null}
          </View>
        ) : null}

        {stage === "form" && config ? (
          <View style={styles.formStack}>
            <View style={styles.accountCard}>
              <Text style={styles.accountEyebrow}>Recharge account</Text>
              <Text style={styles.accountName}>{config.userDisplayName}</Text>
              <Text style={styles.accountHint}>
                Current balance:{" "}
                <Text style={styles.accountBalance}>{formatUsd(config.userBalance)}</Text>
              </Text>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.fieldLabel}>Recharge amount</Text>
              <View style={styles.quickAmountGrid}>
                {quickAmounts.map((value) => {
                  const selected = amountText.trim() === String(value);
                  return (
                    <Pressable
                      key={value}
                      onPress={() => setAmountText(String(value))}
                      style={({ pressed }) => [
                        styles.quickAmountChip,
                        selected && styles.quickAmountChipSelected,
                        pressed && styles.buttonPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.quickAmountChipText,
                          selected && styles.quickAmountChipTextSelected,
                        ]}
                      >
                        ${value}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <TextInput
                value={amountText}
                onChangeText={handleAmountChange}
                keyboardType="decimal-pad"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={`${effectiveMinAmount}`}
                style={styles.textInput}
              />
              <Text style={styles.rangeHint}>
                Credited to balance: {paymentSummary.creditedUsd} · Allowed range:{" "}
                {formatUsd(effectiveMinAmount)} - {formatUsd(effectiveMaxAmount)}
              </Text>
              {paymentSummary.rateText ? (
                <Text style={styles.rangeHint}>{paymentSummary.rateText}</Text>
              ) : null}
              {paymentSummary.feeText ? (
                <Text style={styles.rangeHint}>{paymentSummary.feeText}</Text>
              ) : null}
              {paymentSummary.estimatedPay !== "--" ? (
                <Text style={styles.rangeHint}>
                  Estimated amount to pay: {paymentSummary.estimatedPay}
                </Text>
              ) : null}
            </View>

            <View style={styles.sectionCard}>
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
              {selectedMethodLimit?.available === false ? (
                <Text style={styles.errorText}>This payment method is currently unavailable.</Text>
              ) : null}
              {selectedMethodLimit?.remaining != null ? (
                <Text style={styles.rangeHint}>
                  Remaining daily quota: {formatUsd(selectedMethodLimit.remaining)}
                </Text>
              ) : null}
              {selectedPaymentType &&
              isStripePaymentType(selectedPaymentType) &&
              !canUseStripePopup ? (
                <Text style={styles.rangeHint}>
                  Stripe checkout is only available in the full payment center in this runtime.
                </Text>
              ) : null}
            </View>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            <Button
              variant="default"
              size="sm"
              onPress={() => void handleCreateOrder()}
              disabled={mainCtaDisabled}
              style={styles.primaryCta}
            >
              {mainCtaLabel}
            </Button>
          </View>
        ) : null}

        {stage === "paying" && activeOrder && currentOrderStatus && statusDescriptor ? (
          <View style={styles.formStack}>
            <View style={styles.statusCard}>
              <Text
                style={[
                  styles.statusTitle,
                  statusDescriptor.tone === "success"
                    ? styles.statusTitleSuccess
                    : statusDescriptor.tone === "warning"
                      ? styles.statusTitleWarning
                      : statusDescriptor.tone === "error"
                        ? styles.statusTitleError
                        : null,
                ]}
              >
                {statusDescriptor.title}
              </Text>
              <Text style={styles.statusHint}>{statusDescriptor.message}</Text>
              <Text style={styles.statusMeta}>
                Order {activeOrder.orderId} · Time remaining {timeRemaining}
              </Text>
              <Text style={styles.statusMeta}>
                Amount to pay {formatCny(activeOrder.payAmount ?? activeOrder.amount)} · Credited{" "}
                {formatUsd(activeOrder.amount)}
              </Text>
            </View>

            {activeFlow === "qr" ? (
              <View style={styles.paymentCard}>
                <Text style={styles.fieldLabel}>
                  Open {paymentLabel(activeOrder.paymentType)} and scan to complete payment
                </Text>
                <View style={styles.qrContainer}>
                  {qrCodeDataUrl ? (
                    <Image
                      source={{ uri: qrCodeDataUrl }}
                      style={styles.qrImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <ActivityIndicator />
                  )}
                </View>
                {activeOrder.payUrl ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() => void openPaymentTarget(activeOrder.payUrl)}
                    style={styles.secondaryInlineButton}
                  >
                    Open payment page
                  </Button>
                ) : null}
              </View>
            ) : null}

            {activeFlow === "redirect" ? (
              <View style={styles.paymentCard}>
                <Text style={styles.fieldLabel}>Payment continues in your browser</Text>
                <Text style={styles.statusHint}>
                  If the payment page did not open automatically, use the button below to reopen it.
                </Text>
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => void openPaymentTarget(activeOrder.payUrl)}
                  style={styles.secondaryInlineButton}
                >
                  Open payment page
                </Button>
              </View>
            ) : null}

            {activeFlow === "stripe" ? (
              <View style={styles.paymentCard}>
                <Text style={styles.fieldLabel}>Stripe checkout</Text>
                <Text style={styles.statusHint}>
                  A secure Stripe window is required for this order. We keep polling the order here
                  while that window is open.
                </Text>
                {stripePopupBlocked || errorMessage ? (
                  <Text style={styles.errorText}>
                    {errorMessage ??
                      "The Stripe payment window was blocked. Use the button below to try again."}
                  </Text>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => {
                    if (!activeOrder) {
                      return;
                    }
                    setIsOpeningStripePopup(true);
                    const opened = openStripePopup(activeOrder);
                    if (!opened) {
                      setErrorMessage(
                        "Stripe checkout could not open here. Please use the full payment center.",
                      );
                    }
                    setIsOpeningStripePopup(false);
                  }}
                  style={styles.secondaryInlineButton}
                  disabled={isOpeningStripePopup}
                >
                  {isOpeningStripePopup ? "Opening…" : "Open secure payment window"}
                </Button>
              </View>
            ) : null}

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

            {!currentOrderStatus.paymentSuccess && !isTerminalOrderStatus(currentOrderStatus) ? (
              <Button
                variant="outline"
                size="sm"
                onPress={() => void handleCancelOrder()}
                disabled={isCancellingOrder}
                style={styles.secondaryInlineButton}
              >
                {isCancellingOrder ? "Cancelling…" : "Cancel order"}
              </Button>
            ) : null}
          </View>
        ) : null}

        {stage === "result" && currentOrderStatus && statusDescriptor ? (
          <View style={styles.resultCard}>
            <Text
              style={[
                styles.statusTitle,
                statusDescriptor.tone === "success"
                  ? styles.statusTitleSuccess
                  : statusDescriptor.tone === "warning"
                    ? styles.statusTitleWarning
                    : statusDescriptor.tone === "error"
                      ? styles.statusTitleError
                      : null,
              ]}
            >
              {statusDescriptor.title}
            </Text>
            <Text style={styles.statusHint}>{statusDescriptor.message}</Text>
            <Text style={styles.statusMeta}>Order {currentOrderStatus.id}</Text>
            {currentOrderStatus.failedReason ? (
              <Text style={styles.errorText}>{currentOrderStatus.failedReason}</Text>
            ) : null}
            <Button
              variant="default"
              size="sm"
              onPress={handleBackToForm}
              style={styles.primaryCta}
            >
              Back to recharge
            </Button>
          </View>
        ) : null}
      </View>
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    minHeight: 320,
    gap: theme.spacing[3],
  },
  formStack: {
    gap: theme.spacing[3],
  },
  loadingCard: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
  },
  loadingText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  accountCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
    padding: theme.spacing[4],
    gap: theme.spacing[1],
  },
  accountEyebrow: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    textTransform: "uppercase",
  },
  accountName: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  accountHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  accountBalance: {
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.medium,
  },
  sectionCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
    padding: theme.spacing[4],
    gap: theme.spacing[2],
  },
  paymentCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  errorCard: {
    borderWidth: 1,
    borderColor: theme.colors.destructive,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: "rgba(248,113,113,0.08)",
    padding: theme.spacing[4],
    gap: theme.spacing[2],
  },
  errorTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  fieldLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  quickAmountGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  quickAmountChip: {
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface0,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  quickAmountChipSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent,
  },
  quickAmountChipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  quickAmountChipTextSelected: {
    color: theme.colors.accentForeground,
  },
  textInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  rangeHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: theme.fontSize.xs * 1.5,
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
    backgroundColor: theme.colors.surface0,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
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
  statusCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
    padding: theme.spacing[4],
    gap: theme.spacing[2],
  },
  resultCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface1,
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  statusTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  statusTitleSuccess: {
    color: theme.colors.palette.green[400],
  },
  statusTitleWarning: {
    color: "#d97706",
  },
  statusTitleError: {
    color: theme.colors.destructive,
  },
  statusHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: theme.fontSize.xs * 1.5,
  },
  statusMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  qrContainer: {
    alignSelf: "center",
    width: 260,
    height: 260,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface0,
    padding: theme.spacing[2],
  },
  qrImage: {
    width: "100%",
    height: "100%",
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.xs,
    lineHeight: theme.fontSize.xs * 1.5,
  },
  primaryCta: {
    alignSelf: "stretch",
  },
  secondaryInlineButton: {
    alignSelf: "flex-start",
  },
  buttonPressed: {
    opacity: 0.85,
  },
}));
