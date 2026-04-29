export type Sub2APILocale = "zh" | "en";
export type Sub2APILanguagePreference = Sub2APILocale | "auto";

type LocaleResolutionInput = {
  explicitLocale?: string | null;
  intlLocale?: string | null;
  navigatorLanguages?: readonly string[] | null;
  navigatorLanguage?: string | null;
};

const DEFAULT_LOCALE: Sub2APILocale = "zh";
const FIAT_PAYMENT_PREFIXES = ["alipay", "wxpay"] as const;
const CRYPTO_PAYMENT_PREFIXES = ["usdt", "usdc"] as const;

export function normalizeSub2APILocale(value: string | null | undefined): Sub2APILocale {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_LOCALE;
  }
  if (normalized.startsWith("zh")) {
    return "zh";
  }
  return "en";
}

export function normalizeSub2APILanguagePreference(
  value: string | null | undefined,
): Sub2APILanguagePreference {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "auto" || normalized === "system") {
    return "auto";
  }
  if (normalized.startsWith("zh")) {
    return "zh";
  }
  if (normalized.startsWith("en")) {
    return "en";
  }
  return "auto";
}

export function resolveSub2APILocale(input: LocaleResolutionInput = {}): Sub2APILocale {
  if (input.explicitLocale) {
    return normalizeSub2APILocale(input.explicitLocale);
  }

  if (input.intlLocale) {
    return normalizeSub2APILocale(input.intlLocale);
  }

  const navigatorLanguages = input.navigatorLanguages;
  if (navigatorLanguages && navigatorLanguages.length > 0) {
    return normalizeSub2APILocale(navigatorLanguages[0]);
  }

  if (input.navigatorLanguage) {
    return normalizeSub2APILocale(input.navigatorLanguage);
  }

  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (locale) {
      return normalizeSub2APILocale(locale);
    }
  } catch {
    // Use default below.
  }

  const runtimeNavigator =
    typeof navigator === "undefined"
      ? null
      : (navigator as Navigator & { languages?: readonly string[] });
  const firstNavigatorLanguage = runtimeNavigator?.languages?.[0] ?? runtimeNavigator?.language;
  return normalizeSub2APILocale(firstNavigatorLanguage);
}

export function resolveSub2APILocaleFromPreference(
  preference: string | null | undefined,
  input: LocaleResolutionInput = {},
): Sub2APILocale {
  const normalizedPreference = normalizeSub2APILanguagePreference(preference);
  if (normalizedPreference !== "auto") {
    return normalizedPreference;
  }
  return resolveSub2APILocale(input);
}

export function isSub2APIEnglish(locale: string | null | undefined): boolean {
  return normalizeSub2APILocale(locale) === "en";
}

function startsWithAny(value: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

export function filterSub2APIPaymentTypesByLocale(
  types: readonly string[],
  locale: string | null | undefined,
): string[] {
  const normalizedLocale = normalizeSub2APILocale(locale);
  const prefixes = normalizedLocale === "en" ? CRYPTO_PAYMENT_PREFIXES : FIAT_PAYMENT_PREFIXES;
  return types.filter((type) => startsWithAny(type.trim().toLowerCase(), prefixes));
}

function stablecoinLabel(type: string, base: "USDT" | "USDC"): string {
  const [, network] = type.split(".");
  if (!network) {
    return base;
  }
  return `${base} (${network.charAt(0).toUpperCase()}${network.slice(1)})`;
}

export function getSub2APIPaymentLabel(
  paymentType: string,
  locale: string | null | undefined,
): string {
  const type = paymentType.trim().toLowerCase();
  const normalizedLocale = normalizeSub2APILocale(locale);
  if (type.startsWith("alipay")) {
    return normalizedLocale === "zh" ? "支付宝" : "Alipay";
  }
  if (type.startsWith("wxpay")) {
    return normalizedLocale === "zh" ? "微信支付" : "WeChat Pay";
  }
  if (type.startsWith("usdt")) {
    return stablecoinLabel(type, "USDT");
  }
  if (type.startsWith("usdc")) {
    return stablecoinLabel(type, "USDC");
  }
  if (type.startsWith("stripe")) {
    return "Stripe";
  }
  return paymentType;
}

export const sub2apiMessages = {
  zh: {
    common: {
      loading: "加载中…",
      retry: "重试",
    },
    pay: {
      addBalance: "充值余额",
      loadingRechargeOptions: "正在加载充值选项…",
      unableToLoadRechargeOptions: "无法加载充值选项",
      fullPayCenterFallback: "你仍然可以在浏览器中打开完整支付中心。",
      openFullPayCenter: "打开完整支付中心",
      rechargeAccount: "充值账户",
      accountFallback: "账户",
      currentBalance: "当前余额",
      rechargeAmount: "充值金额",
      creditedRange: (credited: string, min: string, max: string) =>
        `到账余额：${credited} · 可用范围：${min} - ${max}`,
      estimatedSettlement: (amount: string) => `预计结算：${amount}`,
      methodFee: (rate: number) => `支付手续费：${rate}%`,
      estimatedAmountToPay: (amount: string) => `预计实付金额：${amount}`,
      paymentMethod: "支付方式",
      methodUnavailable: "当前支付方式暂不可用。",
      remainingDailyQuota: (amount: string) => `今日剩余额度：${amount}`,
      stripeRuntimeHint: "当前运行环境只能在完整支付中心使用 Stripe 结账。",
      loadingCta: "加载中…",
      creatingOrder: "正在创建订单…",
      continueToPayment: "继续支付",
      signInAgain: "请重新登录后再创建支付订单。",
      selectPaymentMethod: "请先选择支付方式。",
      stripeFullCenterRequired: "Stripe 结账需要在完整支付中心打开。",
      pendingOrders: (count: number) => `你已有 ${count} 个待支付订单，请先完成或取消。`,
      enterValidAmount: "请输入有效的充值金额。",
      rechargeAmountRange: (min: number, max: number) => `充值金额需在 ${min} - ${max} 之间。`,
      failedLoadOrders: "加载订单概览失败。",
      paymentUserUnavailable: "支付用户信息不可用。",
      failedLoadConfig: "加载支付配置失败。",
      failedCreateOrder: "创建支付订单失败。",
      missingOrderId: "支付订单缺少订单号。",
      missingStatusAccessToken: "支付订单缺少状态访问凭证。",
      stripeWindowBlocked: "Stripe 支付窗口被拦截，请点击下方按钮重试。",
      stripeCouldNotOpen: "无法在当前环境打开 Stripe 结账，请使用完整支付中心。",
      paymentPollingTimedOut: "支付状态轮询超时，你可以返回充值页面后重试。",
      failedRefreshStatus: "刷新订单状态失败。",
      failedCancelOrder: "取消订单失败。",
      paymentSuccessfulToast: "支付成功，余额已更新。",
      order: "订单",
      timeRemaining: "剩余时间",
      expired: "已过期",
      amountToPay: "实付金额",
      credited: "到账",
      qrInstruction: (method: string) => `打开${method}并扫码完成支付`,
      openPaymentPage: "打开支付页面",
      redirectTitle: "支付将在浏览器中继续",
      redirectHint: "如果支付页面没有自动打开，请点击下方按钮重新打开。",
      stripeCheckout: "Stripe 结账",
      stripeCheckoutHint: "此订单需要安全的 Stripe 窗口；窗口打开时这里会继续轮询订单状态。",
      opening: "正在打开…",
      openSecurePaymentWindow: "打开安全支付窗口",
      cancelling: "正在取消…",
      cancelOrder: "取消订单",
      backToRecharge: "返回充值",
      status: {
        rechargeCompleteTitle: "充值完成",
        rechargeCompleteMessage: "余额已到账，正在关闭窗口…",
        paymentReceivedTitle: "已收到支付",
        paymentReceivedMessage: "已收到支付，余额充值仍在处理中。",
        rechargeUnfinishedTitle: "已支付，充值未完成",
        rechargeUnfinishedMessage: "支付已完成，但充值尚未完成，请稍后重试或联系客服。",
        awaitingPaymentTitle: "等待支付",
        awaitingPaymentMessage: "请使用下方方式完成支付，我们会自动刷新订单状态。",
        paymentFailedTitle: "支付失败",
        paymentFailedMessage: "本次支付未成功完成，你可以返回后重新创建订单。",
        orderCancelledTitle: "订单已取消",
        orderCancelledMessage: "该订单已在支付完成前取消。",
        orderExpiredTitle: "订单已超时",
        orderExpiredMessage: "该订单已超时，请创建新订单后重试。",
        statusUpdatedTitle: "支付状态已更新",
        statusUpdatedMessage: "支付状态已变化，如有需要可返回后重新创建订单。",
      },
    },
    modelCatalog: {
      title: "模型广场",
      signInHint: (cloudName: string) => `登录 ${cloudName} 后浏览模型广场。`,
      loading: "正在加载模型…",
      noModels: "暂无可用模型。",
      models: "模型",
      token: "Token",
      nonToken: "非 Token",
      bestSavings: "最高节省",
      group: "分组",
      allModels: "全部模型",
      platformModels: (count: number) => `${count} 个平台模型`,
      selectGroup: (platform: string) => `选择 ${platform} 分组`,
      selectGroupPlaceholder: "选择分组",
      search: "搜索",
      searchAllModels: "搜索全部模型",
      searchModelsInGroup: "搜索分组内模型",
      fallbackAcrossGroups: (platform: string) => `展示所有 ${platform} 分组的兜底视图。`,
      noSearchMatch: "没有匹配当前搜索的模型。",
      runtimeUnknown: "暂未观测到运行状态。",
      status: "状态",
      groups: (count: number) => `${count} 个分组`,
      groupDescription: (count: number, rate: number, status?: string) =>
        `${count} 个模型 · ${rate}x${status ? ` · ${status}` : ""}`,
    },
    modelCard: {
      actualPaid: "实付价格",
      balancePrice: "余额价格",
      groups: (count: number) => `${count} 个分组`,
      input: "输入 /MTok",
      output: "输出 /MTok",
      perRequest: "每次请求",
      perImage: "每张图片",
      savings: "节省",
      cachePricing: "缓存价格",
      write: "写入 /MTok",
      read: "读取 /MTok",
      promptCaching: "提示词缓存",
      alsoAvailableIn: "也可用于",
      savingsSuffix: "节省",
    },
    cloudPanel: {
      sections: {
        overview: "概览",
        keys: "API 密钥",
        routing: "路由",
        catalog: "模型广场",
        usage: "用量",
        status: "模型状态",
        referral: "邀请奖励",
      },
      browseOneSection: "一次浏览一个功能区。",
      accountTitle: "账户",
      accountFallback: "账户",
      signIn: "登录",
      signInBody: (cloudName: string, appName: string) =>
        `使用 GitHub 连接 ${cloudName}，管理账单、API 密钥、路由分组和模型广场。首次登录时，${appName} 会尝试自动补齐缺失的 Claude Code 或 Codex 路由；已有设备路由会保持不变，直到你主动切换密钥或分组。`,
      loginWithGitHub: "使用 GitHub 登录",
      connectedHint: (cloudName: string) =>
        `${cloudName} 会话已连接。你可以通过左侧功能区分别管理密钥、路由和模型。`,
      signedInAs: (account: string) => `已登录：${account}`,
      logout: "退出登录",
      cloudControlTitle: "云端控制",
      cloudControlHint: (cloudName: string) =>
        `先选择云端分组/路由；当路由需要密钥时，${cloudName} 会创建或复用 API 密钥。已运行的代理会继续使用当前路由，新会话会从模型选择器读取新的配置。`,
      createApiKey: "创建 API 密钥",
      switchGroup: "切换分组",
      viewModels: "查看模型",
      balanceUsageTitle: "余额与用量",
      retry: "重试",
      balance: "余额",
      recharge: "充值",
      today: "今日",
      week: "本周",
      month: "本月",
      requests: "次请求",
      currentRoutesTitle: "当前路由",
      notConfigured: "未配置",
      noActiveRoute: (scope: string) => `此设备尚未配置 ${scope} 路由。`,
      customRoute: "自定义路由",
      key: "密钥",
      group: "分组",
      none: "无",
      totalSpend: "总支出",
      quota: "额度",
      unlimitedQuota: "无限额度",
      routeUsageUnavailable: (cloudName: string) =>
        `此设备正在使用的路由未匹配当前 ${cloudName} 账户中的密钥，因此这里无法显示该路由的用量。`,
      chooseMatchingGroup: "重新选择分组",
      createMatchingApiKey: "创建 API 密钥",
      signInRequiredTitle: "需要登录",
      signInRequiredBody: (overview: string) =>
        `打开 ${overview} 登录后，再管理 API 密钥、路由、用量、模型状态或模型广场。`,
      goToOverview: "前往概览",
      sessionExpired: "会话已过期",
      loginAgainBeforePayment: "请重新登录后再打开支付。",
      unableOpenPayment: "无法打开支付",
    },
  },
  en: {
    common: {
      loading: "Loading…",
      retry: "Retry",
    },
    pay: {
      addBalance: "Add balance",
      loadingRechargeOptions: "Loading recharge options…",
      unableToLoadRechargeOptions: "Unable to load recharge options",
      fullPayCenterFallback: "You can still open the full payment center in your browser.",
      openFullPayCenter: "Open full pay center",
      rechargeAccount: "Recharge account",
      accountFallback: "Account",
      currentBalance: "Current balance",
      rechargeAmount: "Recharge amount",
      creditedRange: (credited: string, min: string, max: string) =>
        `Credited to balance: ${credited} · Allowed range: ${min} - ${max}`,
      estimatedSettlement: (amount: string) => `Estimated settlement: ${amount}`,
      methodFee: (rate: number) => `Method fee: ${rate}%`,
      estimatedAmountToPay: (amount: string) => `Estimated amount to pay: ${amount}`,
      paymentMethod: "Payment method",
      methodUnavailable: "This payment method is currently unavailable.",
      remainingDailyQuota: (amount: string) => `Remaining daily quota: ${amount}`,
      stripeRuntimeHint: "Stripe checkout is only available in the full payment center in this runtime.",
      loadingCta: "Loading…",
      creatingOrder: "Creating order…",
      continueToPayment: "Continue to payment",
      signInAgain: "Please sign in again before creating a payment order.",
      selectPaymentMethod: "Select a payment method first.",
      stripeFullCenterRequired: "Stripe checkout needs the full payment center in this runtime.",
      pendingOrders: (count: number) =>
        `You already have ${count} pending orders. Please complete or cancel them first.`,
      enterValidAmount: "Enter a valid recharge amount.",
      rechargeAmountRange: (min: number, max: number) =>
        `Recharge amount must be between ${min} and ${max}.`,
      failedLoadOrders: "Failed to load order summary.",
      paymentUserUnavailable: "Payment user info is unavailable.",
      failedLoadConfig: "Failed to load payment config.",
      failedCreateOrder: "Failed to create payment order.",
      missingOrderId: "Payment order is missing an order id.",
      missingStatusAccessToken: "Payment order is missing a status access token.",
      stripeWindowBlocked: "Stripe payment window was blocked. Use the button below to try opening it again.",
      stripeCouldNotOpen: "Stripe checkout could not open here. Please use the full payment center.",
      paymentPollingTimedOut: "Payment status polling timed out. You can go back to recharge and try again if needed.",
      failedRefreshStatus: "Failed to refresh order status.",
      failedCancelOrder: "Failed to cancel this order.",
      paymentSuccessfulToast: "Payment successful. Balance updated.",
      order: "Order",
      timeRemaining: "Time remaining",
      expired: "Expired",
      amountToPay: "Amount to pay",
      credited: "Credited",
      qrInstruction: (method: string) => `Open ${method} and scan to complete payment`,
      openPaymentPage: "Open payment page",
      redirectTitle: "Payment continues in your browser",
      redirectHint: "If the payment page did not open automatically, use the button below to reopen it.",
      stripeCheckout: "Stripe checkout",
      stripeCheckoutHint: "A secure Stripe window is required for this order. We keep polling the order here while that window is open.",
      opening: "Opening…",
      openSecurePaymentWindow: "Open secure payment window",
      cancelling: "Cancelling…",
      cancelOrder: "Cancel order",
      backToRecharge: "Back to recharge",
      status: {
        rechargeCompleteTitle: "Recharge complete",
        rechargeCompleteMessage: "Your balance has been credited. Closing this dialog…",
        paymentReceivedTitle: "Payment received",
        paymentReceivedMessage: "Your payment was received and the balance top-up is still being processed.",
        rechargeUnfinishedTitle: "Payment received, recharge not finished",
        rechargeUnfinishedMessage: "Payment completed, but the recharge has not finished yet. Please try again later or contact support.",
        awaitingPaymentTitle: "Awaiting payment",
        awaitingPaymentMessage: "Complete payment using the method below. We will refresh this order automatically.",
        paymentFailedTitle: "Payment failed",
        paymentFailedMessage: "This payment did not complete successfully. You can go back and create a new order.",
        orderCancelledTitle: "Order cancelled",
        orderCancelledMessage: "This order was cancelled before payment completed.",
        orderExpiredTitle: "Order expired",
        orderExpiredMessage: "This order expired before payment completed. Create a new order to try again.",
        statusUpdatedTitle: "Payment status updated",
        statusUpdatedMessage: "The payment status changed. You can go back and create a new order if needed.",
      },
    },
    modelCatalog: {
      title: "Model catalog",
      signInHint: (cloudName: string) => `Sign in to ${cloudName} to browse the model catalog.`,
      loading: "Loading catalog...",
      noModels: "No models available.",
      models: "Models",
      token: "Token",
      nonToken: "Non-token",
      bestSavings: "Best savings",
      group: "Group",
      allModels: "All models",
      platformModels: (count: number) => `${count} platform models`,
      selectGroup: (platform: string) => `Select ${platform} group`,
      selectGroupPlaceholder: "Select group",
      search: "Search",
      searchAllModels: "Search all models",
      searchModelsInGroup: "Search models in group",
      fallbackAcrossGroups: (platform: string) => `Fallback view across all ${platform} groups.`,
      noSearchMatch: "No models match this search.",
      runtimeUnknown: "Runtime status has not been observed yet.",
      status: "Status",
      groups: (count: number) => `${count} groups`,
      groupDescription: (count: number, rate: number, status?: string) =>
        `${count} models · ${rate}x${status ? ` · ${status}` : ""}`,
    },
    modelCard: {
      actualPaid: "Actual Paid",
      balancePrice: "Balance Price",
      groups: (count: number) => `${count} groups`,
      input: "Input /MTok",
      output: "Output /MTok",
      perRequest: "Per Request",
      perImage: "Per Image",
      savings: "Savings",
      cachePricing: "Cache Pricing",
      write: "Write /MTok",
      read: "Read /MTok",
      promptCaching: "prompt caching",
      alsoAvailableIn: "Also available in",
      savingsSuffix: "savings",
    },
    cloudPanel: {
      sections: {
        overview: "Overview",
        keys: "API Keys",
        routing: "Routing",
        catalog: "Model Catalog",
        usage: "Usage",
        status: "Model Status",
        referral: "Referral",
      },
      browseOneSection: "Browse one section at a time.",
      accountTitle: "Account",
      accountFallback: "Account",
      signIn: "Sign in",
      signInBody: (cloudName: string, appName: string) =>
        `Connect with GitHub for ${cloudName} billing, API keys, routing groups, and the model catalog. On first sign-in, ${appName} tries to fill in any missing Claude Code or Codex route automatically. Existing device routes stay unchanged until you explicitly switch a key or group.`,
      loginWithGitHub: "Login with GitHub",
      connectedHint: (cloudName: string) =>
        `Your ${cloudName} session is connected. Use the sections on the left to manage keys, routing, and models without mixing those controls together.`,
      signedInAs: (account: string) => `Signed in as ${account}`,
      logout: "Logout",
      cloudControlTitle: "Cloud control",
      cloudControlHint: (cloudName: string) =>
        `Choose a Cloud group/route first; ${cloudName} will create or reuse an API key when a route needs one. Existing running agents keep their current route, and new sessions pick up changes from the model selector.`,
      createApiKey: "Create API key",
      switchGroup: "Switch group",
      viewModels: "View models",
      balanceUsageTitle: "Balance & usage",
      retry: "Retry",
      balance: "Balance",
      recharge: "Recharge",
      today: "Today",
      week: "Week",
      month: "Month",
      requests: "requests",
      currentRoutesTitle: "Current routes",
      notConfigured: "Not configured",
      noActiveRoute: (scope: string) => `This device does not have an active ${scope} route yet.`,
      customRoute: "Custom route",
      key: "Key",
      group: "Group",
      none: "none",
      totalSpend: "Total spend",
      quota: "Quota",
      unlimitedQuota: "Unlimited quota",
      routeUsageUnavailable: (cloudName: string) =>
        `This device is using a route that does not match a key in the current ${cloudName} account, so per-route usage is unavailable here.`,
      chooseMatchingGroup: "Choose group",
      createMatchingApiKey: "Create API key",
      signInRequiredTitle: "Sign in required",
      signInRequiredBody: (overview: string) =>
        `Open ${overview} to sign in before managing API keys, routing, usage, model status, or the model catalog.`,
      goToOverview: "Go to Overview",
      sessionExpired: "Session expired",
      loginAgainBeforePayment: "Please log in again before opening payment.",
      unableOpenPayment: "Unable to open payment",
    },
  },
} as const;

export function getSub2APIMessages(locale: string | null | undefined = DEFAULT_LOCALE) {
  return sub2apiMessages[normalizeSub2APILocale(locale)];
}
