export interface ActualPaidPricingContext {
  balanceCreditCnyPerUsd: number | null;
  usdExchangeRate: number | null;
  locale?: string | null;
}

function isPositiveFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function shouldDisplayActualPaidInUsd(locale: string | null | undefined): boolean {
  return (locale ?? "").trim().toLowerCase().startsWith("en");
}

function formatPriceNumber(value: number): string {
  if (value === 0) {
    return "0.0000";
  }
  if (Math.abs(value) >= 100) {
    return value.toFixed(2);
  }
  if (Math.abs(value) >= 10) {
    return value.toFixed(3);
  }
  return value.toFixed(4);
}

export function formatUsdPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return "--";
  }
  return `$${formatPriceNumber(value)}`;
}

export function formatActualPaidPrice(
  valueUsd: number | null | undefined,
  context: ActualPaidPricingContext | null | undefined,
): string {
  if (valueUsd == null || !Number.isFinite(valueUsd)) {
    return "--";
  }
  if (!context || !isPositiveFiniteNumber(context.balanceCreditCnyPerUsd)) {
    return formatUsdPrice(valueUsd);
  }

  const actualCny = valueUsd * context.balanceCreditCnyPerUsd;
  if (shouldDisplayActualPaidInUsd(context.locale) && isPositiveFiniteNumber(context.usdExchangeRate)) {
    return formatUsdPrice(actualCny / context.usdExchangeRate);
  }
  return `¥${formatPriceNumber(actualCny)}`;
}

export function getActualPaidSectionLabel(
  context: ActualPaidPricingContext | null | undefined,
): string {
  return context && isPositiveFiniteNumber(context.balanceCreditCnyPerUsd)
    ? "Actual Paid"
    : "Balance Price";
}
