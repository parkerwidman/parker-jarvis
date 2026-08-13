import type { FinanceAccountType } from "@/lib/jarvis/finance/finance-types";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export const FINANCE_ACCOUNT_TYPE_LABELS: Record<FinanceAccountType, string> = {
  checking: "Checking",
  savings: "Savings",
  cash: "Cash",
  credit_card: "Credit Card",
  investment: "Investment",
  loan: "Loan",
  other: "Other",
};

export function formatFinanceCurrency(value: number | null): string {
  if (value === null) {
    return "Unavailable";
  }

  return currencyFormatter.format(value);
}

export function formatFinanceDebt(value: number | null): string {
  if (value === null) {
    return "Unavailable";
  }

  return currencyFormatter.format(Math.abs(value));
}

export function formatFinanceDate(dateStr: string, timeZone: string): string {
  return new Date(`${dateStr}T12:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

export function formatFinanceDateTime(
  isoString: string | null,
  timeZone: string,
): string {
  if (!isoString) {
    return "No successful sync yet";
  }

  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export function netCashFlowTone(
  value: number | null,
): "positive" | "negative" | "neutral" | "unavailable" {
  if (value === null) {
    return "unavailable";
  }

  if (value > 0) {
    return "positive";
  }

  if (value < 0) {
    return "negative";
  }

  return "neutral";
}

export function formatAccountDisplayName(
  name: string,
  lastFour: string | null,
): string {
  if (!lastFour) {
    return name;
  }

  return `${name} — ${lastFour}`;
}
