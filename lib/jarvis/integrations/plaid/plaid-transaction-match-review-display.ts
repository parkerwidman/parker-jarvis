import type { FinancePersonalOrBusiness, FinanceTransactionType } from "@/lib/jarvis/finance/finance-types";
import type { PlaidMatchReasonCode } from "@/lib/jarvis/integrations/plaid/plaid-transaction-match-types";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const PERSONAL_OR_BUSINESS_LABELS: Record<FinancePersonalOrBusiness, string> = {
  personal: "Personal",
  business: "Business",
  unclassified: "Unclassified",
};

const TRANSACTION_TYPE_LABELS: Record<FinanceTransactionType, string> = {
  income: "Income",
  expense: "Expense",
  refund: "Refund",
  transfer: "Transfer",
  adjustment: "Adjustment",
};

const MATCH_REASON_LABELS: Record<PlaidMatchReasonCode, string> = {
  amount: "Same amount",
  date: "Close transaction date",
  posted_date: "Close posted date",
  merchant: "Similar merchant",
  description: "Similar description",
  transaction_type: "Same transaction type",
  account: "Same linked account",
};

export function formatPlaidReviewAmount(
  amount: number,
  transactionType: FinanceTransactionType,
): string {
  switch (transactionType) {
    case "income":
    case "refund":
      return currencyFormatter.format(Math.abs(amount));
    case "expense":
      return currencyFormatter.format(amount);
    default:
      return currencyFormatter.format(amount);
  }
}

export function formatPlaidReviewDate(dateStr: string, timeZone: string): string {
  return new Date(`${dateStr}T12:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

export function formatPlaidReviewDateTime(
  isoString: string,
  timeZone: string,
): string {
  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export function formatPersonalOrBusinessLabel(
  value: FinancePersonalOrBusiness,
): string {
  return PERSONAL_OR_BUSINESS_LABELS[value];
}

export function formatTransactionTypeLabel(
  value: FinanceTransactionType,
): string {
  return TRANSACTION_TYPE_LABELS[value];
}

export function formatMatchReasonLabels(
  reasonCodes: readonly PlaidMatchReasonCode[],
): string[] {
  return reasonCodes.map((code) => MATCH_REASON_LABELS[code]);
}

export function buildReviewPauseReason(candidateCount: number): string {
  if (candidateCount > 1) {
    return "Jarvis found multiple Rocket Money transactions that could match this bank activity.";
  }

  return "Jarvis found a possible Rocket Money match but was not confident enough to link it automatically.";
}

export function buildResolutionOutcomeLabel(
  status: "matched_existing" | "imported_new",
): string {
  if (status === "matched_existing") {
    return "Matched existing Rocket Money transaction";
  }

  return "Imported as new Plaid transaction";
}

export function buildAccountDisplayLabel(input: {
  institutionName: string | null;
  accountName: string;
  lastFour: string | null;
}): string {
  const parts: string[] = [];

  if (input.institutionName) {
    parts.push(input.institutionName);
  }

  parts.push(input.accountName);

  if (input.lastFour) {
    parts.push(`••••${input.lastFour}`);
  }

  return parts.join(" · ");
}

export function buildMerchantDisplayLabel(
  merchant: string | null,
  description: string | null,
): string {
  if (merchant) {
    return merchant;
  }

  if (description) {
    return description;
  }

  return "Unknown merchant";
}

export function buildRecurringStatusLabel(input: {
  recurringItemName: string | null;
  recurringFrequency: string | null;
}): string | null {
  if (!input.recurringItemName) {
    return null;
  }

  if (input.recurringFrequency) {
    return `Recurring · ${input.recurringItemName} (${input.recurringFrequency})`;
  }

  return `Recurring · ${input.recurringItemName}`;
}
