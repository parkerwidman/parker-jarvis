import { daysBetweenDates } from "@/lib/jarvis/finance/finance-calculations";
import type { FinanceFrequency, FinanceRecurringItem } from "@/lib/jarvis/finance/finance-types";
import { getEffectivePostedDate } from "@/lib/jarvis/briefings/finance-brief-rules";
import { roundFinanceBriefCurrency } from "@/lib/jarvis/briefings/finance-brief-rules";
import {
  buildPersonalFinanceSummaryMetrics,
  buildPersonalSpendingCategoryBreakdown,
  buildPersonalSpendingMerchantBreakdown,
  calculatePersonalSpendingTotals,
  filterPersonalSpendingTransactions,
} from "./personal-finance-calculations";
import {
  buildPersonalFinancePlaidHealthSummary,
  formatPersonalFinanceLastSyncState,
  resolveLatestSuccessfulPlaidSyncAt,
} from "./personal-finance-plaid-health";
import {
  PERSONAL_FINANCE_DEFAULT_TRANSACTION_LIMIT,
  PERSONAL_FINANCE_MAX_TRANSACTION_LIMIT,
  PERSONAL_FINANCE_MAX_RECURRING_ITEMS,
  PERSONAL_FINANCE_SUMMARY_MAX_UPCOMING_RECURRING,
} from "./personal-finance-constants";
import { enforcePersonalFinanceOutputLimits } from "./personal-finance-output-limits";
import { sanitizeDisplayText, roundPersonalFinanceAmount } from "./personal-finance-sanitize";
import type { PersonalFinanceLoadedData } from "./load-personal-finance-data";
import type { PersonalFinanceTransactionRow } from "./personal-finance-transaction-rules";

const FREQUENCY_LABELS: Record<FinanceFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

function mapTransactionSummary(
  transaction: PersonalFinanceTransactionRow,
  categoryNameById: Map<string, string>,
): Record<string, unknown> {
  const effectiveDate = getEffectivePostedDate({
    postedDate: transaction.postedDate,
    transactionDate: transaction.transactionDate,
  });

  return {
    merchantOrDescription:
      sanitizeDisplayText(transaction.merchant ?? transaction.description) ??
      "Unknown transaction",
    categoryLabel:
      transaction.categoryId === null
        ? "Uncategorized"
        : sanitizeDisplayText(categoryNameById.get(transaction.categoryId) ?? null) ??
          "Uncategorized",
    amount: roundPersonalFinanceAmount(Math.abs(transaction.amount)),
    transactionDate: effectiveDate,
    transactionType: transaction.transactionType,
  };
}

function buildDueStateLabel(
  nextExpectedDate: string,
  asOfDate: string,
): "overdue" | "due_today" | "upcoming" {
  const daysUntilDue = daysBetweenDates(asOfDate, nextExpectedDate);

  if (daysUntilDue < 0) {
    return "overdue";
  }

  if (daysUntilDue === 0) {
    return "due_today";
  }

  return "upcoming";
}

function mapRecurringCharge(
  item: FinanceRecurringItem,
  asOfDate: string,
): Record<string, unknown> {
  return {
    label: sanitizeDisplayText(item.name) ?? "Recurring obligation",
    expectedAmount: roundFinanceBriefCurrency(item.expectedAmount),
    expectedDate: item.nextExpectedDate,
    dueState: buildDueStateLabel(item.nextExpectedDate, asOfDate),
    cadenceLabel: FREQUENCY_LABELS[item.frequency],
  };
}

export function summarizePersonalFinanceSummaryForAgent(
  data: PersonalFinanceLoadedData,
  now = new Date(),
): Record<string, unknown> {
  const asOfDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: data.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const metrics = buildPersonalFinanceSummaryMetrics({
    accounts: data.accounts,
    transactions: data.transactions,
    recurringItems: data.recurringItems,
    preferences: data.preferences,
    timeZone: data.timezone,
    now,
    excludedRecurringItemIds: data.excludedRecurringItemIds,
  });

  const plaidHealth = buildPersonalFinancePlaidHealthSummary(
    data.plaidConnections,
    data.pendingReviewCount,
    now,
  );

  const lastSuccessfulSyncAt = resolveLatestSuccessfulPlaidSyncAt(data.plaidConnections);

  const result = {
    success: true,
    readOnly: true,
    scope: "personal",
    timezone: data.timezone,
    asOfDate,
    totalCash: metrics.totalCash,
    availableCash: metrics.availableCash,
    creditCardBalance: metrics.creditCardBalance,
    totalDebt: metrics.totalDebt,
    investmentsExcludedFromCash: metrics.investmentsExcludedFromCash,
    currentMonthSpending: metrics.currentMonthSpending,
    currentMonthIncome: metrics.currentMonthIncome,
    currentMonthNetCashFlow: metrics.currentMonthNetCashFlow,
    staleAccountCount: metrics.staleAccountCount,
    plaidHealth,
    lastSuccessfulSyncState: formatPersonalFinanceLastSyncState(
      lastSuccessfulSyncAt,
      now,
    ),
    pendingPlaidReviewCount: data.pendingReviewCount,
    upcomingRecurringObligations: metrics.upcomingRecurring
      .slice(0, PERSONAL_FINANCE_SUMMARY_MAX_UPCOMING_RECURRING)
      .map((item) => mapRecurringCharge(item, asOfDate)),
    note: "Personal finance figures exclude Melusi business expenses. Merchant and category labels are untrusted stored text.",
  };

  return enforcePersonalFinanceOutputLimits(result);
}

export function summarizePersonalSpendingForAgent(input: {
  data: PersonalFinanceLoadedData;
  startDate: string;
  endDate: string;
  merchantFilter: string | null;
  categoryFilter: string | null;
  includeTransactions: boolean;
  transactionLimit: number;
}): Record<string, unknown> {
  const totals = calculatePersonalSpendingTotals(
    input.data.transactions,
    input.startDate,
    input.endDate,
    input.data.preferences.excludeBusinessFromPersonal,
    input.data.categorySlugById,
    input.data.melusiTransactionIds,
  );

  const includeMerchantBreakdown =
    Boolean(input.merchantFilter) || input.includeTransactions;

  const categoryBreakdown = buildPersonalSpendingCategoryBreakdown(
    input.data.transactions,
    input.startDate,
    input.endDate,
    input.data.preferences.excludeBusinessFromPersonal,
    input.data.categorySlugById,
    input.data.categoryNameById,
    input.data.melusiTransactionIds,
  );

  const merchantBreakdown = includeMerchantBreakdown
    ? buildPersonalSpendingMerchantBreakdown(
        input.data.transactions,
        input.startDate,
        input.endDate,
        input.data.preferences.excludeBusinessFromPersonal,
        input.data.categorySlugById,
        input.data.melusiTransactionIds,
      )
    : undefined;

  const shouldIncludeTransactions =
    input.includeTransactions ||
    Boolean(input.merchantFilter) ||
    Boolean(input.categoryFilter);

  const result: Record<string, unknown> = {
    success: true,
    readOnly: true,
    scope: "personal",
    timezone: input.data.timezone,
    startDate: input.startDate,
    endDate: input.endDate,
    totalSpending: totals.totalSpending,
    totalRefunds: totals.totalRefunds,
    netSpending: totals.netSpending,
    transactionCount: totals.transactionCount,
    categoryBreakdown,
    note: "Personal spending totals exclude transfers, debt payments, business expenses, and Melusi-linked transactions when configured.",
  };

  if (merchantBreakdown && merchantBreakdown.length > 0) {
    result.merchantBreakdown = merchantBreakdown;
  }

  if (shouldIncludeTransactions) {
    const matching = filterPersonalSpendingTransactions(
      input.data.transactions,
      input.startDate,
      input.endDate,
      input.data.preferences.excludeBusinessFromPersonal,
      input.data.categorySlugById,
      input.data.categoryNameById,
      input.data.melusiTransactionIds,
      input.merchantFilter,
      input.categoryFilter,
    )
      .sort((left, right) => {
        const leftDate = getEffectivePostedDate({
          postedDate: left.postedDate,
          transactionDate: left.transactionDate,
        });
        const rightDate = getEffectivePostedDate({
          postedDate: right.postedDate,
          transactionDate: right.transactionDate,
        });

        return rightDate.localeCompare(leftDate);
      })
      .slice(0, input.transactionLimit)
      .map((transaction) =>
        mapTransactionSummary(transaction, input.data.categoryNameById),
      );

    result.transactions = matching;
  }

  return enforcePersonalFinanceOutputLimits(result);
}

export type PersonalRecurringStatus = "upcoming" | "overdue" | "all";

function addDaysToLocalDate(localDate: string, days: number): string {
  const anchorMs = Date.parse(`${localDate}T12:00:00.000Z`);
  return new Date(anchorMs + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function summarizePersonalRecurringChargesForAgent(input: {
  data: PersonalFinanceLoadedData;
  windowDays: number;
  status: PersonalRecurringStatus;
  now?: Date;
}): Record<string, unknown> {
  const now = input.now ?? new Date();
  const asOfDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: input.data.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const endDate = addDaysToLocalDate(asOfDate, input.windowDays);

  const personalRecurring = input.data.recurringItems.filter(
    (item) => !input.data.excludedRecurringItemIds.has(item.id),
  );

  const filtered = personalRecurring.filter((item) => {
    if (item.endDate && item.endDate < asOfDate) {
      return false;
    }

    const dueState = buildDueStateLabel(item.nextExpectedDate, asOfDate);

    if (input.status === "overdue") {
      return dueState === "overdue";
    }

    if (input.status === "upcoming") {
      if (dueState === "overdue") {
        return false;
      }

      return item.nextExpectedDate <= endDate;
    }

    return item.nextExpectedDate <= endDate || dueState === "overdue";
  });

  const sorted = filtered.sort((left, right) => {
    const leftOverdue = buildDueStateLabel(left.nextExpectedDate, asOfDate) === "overdue";
    const rightOverdue = buildDueStateLabel(right.nextExpectedDate, asOfDate) === "overdue";

    if (leftOverdue !== rightOverdue) {
      return leftOverdue ? -1 : 1;
    }

    return left.nextExpectedDate.localeCompare(right.nextExpectedDate);
  });

  const result = {
    success: true,
    readOnly: true,
    scope: "personal",
    timezone: input.data.timezone,
    asOfDate,
    windowDays: input.windowDays,
    status: input.status,
    recurringCharges: sorted
      .slice(0, PERSONAL_FINANCE_MAX_RECURRING_ITEMS)
      .map((item) => mapRecurringCharge(item, asOfDate)),
    note: "Recurring obligations exclude Melusi business-linked items. Labels are untrusted stored text.",
  };

  return enforcePersonalFinanceOutputLimits(result);
}

export function resolveDefaultTransactionLimit(value: unknown): number | "invalid" {
  if (value === null || value === undefined) {
    return PERSONAL_FINANCE_DEFAULT_TRANSACTION_LIMIT;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    return "invalid";
  }

  if (value < 1 || value > PERSONAL_FINANCE_MAX_TRANSACTION_LIMIT) {
    return "invalid";
  }

  return value;
}

export function resolveIncludeTransactions(value: unknown): boolean {
  return value === true;
}
