import {
  daysBetweenDates,
  getCalendarMonthDateRange,
  getCurrentCalendarMonth,
  buildFinanceSummary,
} from "@/lib/jarvis/finance/finance-calculations";
import type {
  FinanceAccount,
  FinanceCategory,
  FinancePreferences,
  FinanceRecurringItem,
} from "@/lib/jarvis/finance/finance-types";
import {
  getPersonalRecurringDueWithinDays,
  roundFinanceBriefCurrency,
} from "@/lib/jarvis/briefings/finance-brief-rules";
import {
  PERSONAL_FINANCE_MAX_CATEGORY_GROUPS,
  PERSONAL_FINANCE_MAX_MERCHANT_GROUPS,
  PERSONAL_FINANCE_MAX_SPENDING_WINDOW_DAYS,
} from "./personal-finance-constants";
import {
  isPersonalSpendingExpense,
  isPersonalSpendingRefund,
  isTransactionInPersonalSpendingDateRange,
  matchesPersonalFinanceCategoryFilter,
  matchesPersonalFinanceMerchantFilter,
  shouldIncludeInPersonalSpendingTotals,
  type PersonalFinanceTransactionRow,
} from "./personal-finance-transaction-rules";
import { sanitizeDisplayText } from "./personal-finance-sanitize";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type PersonalFinanceSpendingDateRange =
  | { ok: true; startDate: string; endDate: string }
  | { ok: false; error: "invalid_date_range" };

export function parsePersonalFinanceDate(value: unknown): string | "invalid" {
  if (typeof value !== "string") {
    return "invalid";
  }

  const trimmed = value.trim();

  if (!DATE_PATTERN.test(trimmed)) {
    return "invalid";
  }

  const parsed = Date.parse(`${trimmed}T12:00:00.000Z`);

  if (!Number.isFinite(parsed)) {
    return "invalid";
  }

  return trimmed;
}

export function resolvePersonalFinanceSpendingDateRange(input: {
  startDate?: unknown;
  endDate?: unknown;
  timeZone: string;
  now?: Date;
}): PersonalFinanceSpendingDateRange {
  const now = input.now ?? new Date();
  const month = getCurrentCalendarMonth(input.timeZone, now);
  const defaultRange = getCalendarMonthDateRange(month.year, month.month);

  const parsedStart =
    input.startDate === undefined || input.startDate === null
      ? defaultRange.startDate
      : parsePersonalFinanceDate(input.startDate);
  const parsedEnd =
    input.endDate === undefined || input.endDate === null
      ? defaultRange.endDate
      : parsePersonalFinanceDate(input.endDate);

  if (parsedStart === "invalid" || parsedEnd === "invalid") {
    return { ok: false, error: "invalid_date_range" };
  }

  if (parsedStart > parsedEnd) {
    return { ok: false, error: "invalid_date_range" };
  }

  const windowDays = daysBetweenDates(parsedStart, parsedEnd) + 1;

  if (windowDays > PERSONAL_FINANCE_MAX_SPENDING_WINDOW_DAYS) {
    return { ok: false, error: "invalid_date_range" };
  }

  return {
    ok: true,
    startDate: parsedStart,
    endDate: parsedEnd,
  };
}

export type PersonalFinanceSpendingTotals = {
  totalSpending: number;
  totalRefunds: number;
  netSpending: number;
  transactionCount: number;
};

export function calculatePersonalSpendingTotals(
  transactions: PersonalFinanceTransactionRow[],
  startDate: string,
  endDate: string,
  excludeBusinessFromPersonal: boolean,
  categorySlugById: Map<string, string>,
  melusiTransactionIds: Set<string>,
): PersonalFinanceSpendingTotals {
  let totalSpending = 0;
  let totalRefunds = 0;
  let transactionCount = 0;

  for (const transaction of transactions) {
    if (
      !shouldIncludeInPersonalSpendingTotals(
        transaction,
        excludeBusinessFromPersonal,
        categorySlugById,
        melusiTransactionIds,
      )
    ) {
      continue;
    }

    if (!isTransactionInPersonalSpendingDateRange(transaction, startDate, endDate)) {
      continue;
    }

    if (isPersonalSpendingExpense(transaction)) {
      totalSpending += Math.abs(transaction.amount);
      transactionCount += 1;
      continue;
    }

    if (isPersonalSpendingRefund(transaction)) {
      totalRefunds += transaction.amount;
      transactionCount += 1;
    }
  }

  return {
    totalSpending: roundFinanceBriefCurrency(totalSpending),
    totalRefunds: roundFinanceBriefCurrency(totalRefunds),
    netSpending: roundFinanceBriefCurrency(Math.max(0, totalSpending - totalRefunds)),
    transactionCount,
  };
}

export type PersonalFinanceSpendingGroup = {
  label: string;
  amount: number;
};

export function buildPersonalSpendingCategoryBreakdown(
  transactions: PersonalFinanceTransactionRow[],
  startDate: string,
  endDate: string,
  excludeBusinessFromPersonal: boolean,
  categorySlugById: Map<string, string>,
  categoryNameById: Map<string, string>,
  melusiTransactionIds: Set<string>,
): PersonalFinanceSpendingGroup[] {
  const totals = new Map<string, number>();

  for (const transaction of transactions) {
    if (
      !shouldIncludeInPersonalSpendingTotals(
        transaction,
        excludeBusinessFromPersonal,
        categorySlugById,
        melusiTransactionIds,
      )
    ) {
      continue;
    }

    if (!isTransactionInPersonalSpendingDateRange(transaction, startDate, endDate)) {
      continue;
    }

    let delta = 0;

    if (isPersonalSpendingExpense(transaction)) {
      delta = Math.abs(transaction.amount);
    } else if (isPersonalSpendingRefund(transaction)) {
      delta = -transaction.amount;
    }

    if (delta === 0) {
      continue;
    }

    const label =
      transaction.categoryId === null
        ? "Uncategorized"
        : (categoryNameById.get(transaction.categoryId) ?? "Uncategorized");

    totals.set(label, roundFinanceBriefCurrency((totals.get(label) ?? 0) + delta));
  }

  return [...totals.entries()]
    .map(([label, amount]) => ({
      label: sanitizeDisplayText(label) ?? "Uncategorized",
      amount: roundFinanceBriefCurrency(Math.max(0, amount)),
    }))
    .filter((entry) => entry.amount > 0)
    .sort((left, right) => {
      const amountDelta = right.amount - left.amount;
      if (amountDelta !== 0) {
        return amountDelta;
      }

      return left.label.localeCompare(right.label);
    })
    .slice(0, PERSONAL_FINANCE_MAX_CATEGORY_GROUPS);
}

export function buildPersonalSpendingMerchantBreakdown(
  transactions: PersonalFinanceTransactionRow[],
  startDate: string,
  endDate: string,
  excludeBusinessFromPersonal: boolean,
  categorySlugById: Map<string, string>,
  melusiTransactionIds: Set<string>,
): PersonalFinanceSpendingGroup[] {
  const totals = new Map<string, number>();

  for (const transaction of transactions) {
    if (
      !shouldIncludeInPersonalSpendingTotals(
        transaction,
        excludeBusinessFromPersonal,
        categorySlugById,
        melusiTransactionIds,
      )
    ) {
      continue;
    }

    if (!isTransactionInPersonalSpendingDateRange(transaction, startDate, endDate)) {
      continue;
    }

    let delta = 0;

    if (isPersonalSpendingExpense(transaction)) {
      delta = Math.abs(transaction.amount);
    } else if (isPersonalSpendingRefund(transaction)) {
      delta = -transaction.amount;
    }

    if (delta === 0) {
      continue;
    }

    const label =
      sanitizeDisplayText(transaction.merchant ?? transaction.description) ??
      "Unknown merchant";

    totals.set(label, roundFinanceBriefCurrency((totals.get(label) ?? 0) + delta));
  }

  return [...totals.entries()]
    .map(([label, amount]) => ({
      label,
      amount: roundFinanceBriefCurrency(Math.max(0, amount)),
    }))
    .filter((entry) => entry.amount > 0)
    .sort((left, right) => {
      const amountDelta = right.amount - left.amount;
      if (amountDelta !== 0) {
        return amountDelta;
      }

      return left.label.localeCompare(right.label);
    })
    .slice(0, PERSONAL_FINANCE_MAX_MERCHANT_GROUPS);
}

export function filterPersonalSpendingTransactions(
  transactions: PersonalFinanceTransactionRow[],
  startDate: string,
  endDate: string,
  excludeBusinessFromPersonal: boolean,
  categorySlugById: Map<string, string>,
  categoryNameById: Map<string, string>,
  melusiTransactionIds: Set<string>,
  merchantFilter: string | null,
  categoryFilter: string | null,
): PersonalFinanceTransactionRow[] {
  return transactions.filter((transaction) => {
    if (
      !shouldIncludeInPersonalSpendingTotals(
        transaction,
        excludeBusinessFromPersonal,
        categorySlugById,
        melusiTransactionIds,
      )
    ) {
      return false;
    }

    if (!isTransactionInPersonalSpendingDateRange(transaction, startDate, endDate)) {
      return false;
    }

    if (
      merchantFilter &&
      !matchesPersonalFinanceMerchantFilter(transaction, merchantFilter)
    ) {
      return false;
    }

    if (
      categoryFilter &&
      !matchesPersonalFinanceCategoryFilter(
        transaction,
        categoryFilter,
        categoryNameById,
      )
    ) {
      return false;
    }

    return true;
  });
}

export function buildPersonalFinanceSummaryMetrics(input: {
  accounts: FinanceAccount[];
  transactions: PersonalFinanceTransactionRow[];
  recurringItems: FinanceRecurringItem[];
  preferences: FinancePreferences;
  timeZone: string;
  now?: Date;
  excludedRecurringItemIds: Set<string>;
}) {
  const financeTransactions = input.transactions.map((transaction) => ({
    id: transaction.id,
    userId: "owner",
    accountId: transaction.accountId,
    categoryId: transaction.categoryId,
    transactionDate: transaction.transactionDate,
    postedDate: transaction.postedDate,
    amount: transaction.amount,
    merchant: transaction.merchant,
    description: transaction.description,
    transactionType: transaction.transactionType,
    status: transaction.status,
    notes: null,
    source: transaction.source === "plaid" ? ("plaid" as const) : ("manual" as const),
    deduplicationFingerprint: transaction.deduplicationFingerprint,
    recurringItemId: transaction.recurringItemId,
    personalOrBusiness: transaction.personalOrBusiness,
    createdAt: "",
    updatedAt: "",
  }));

  const summary = buildFinanceSummary({
    accounts: input.accounts,
    transactions: financeTransactions,
    recurringItems: input.recurringItems.filter(
      (item) => !input.excludedRecurringItemIds.has(item.id),
    ),
    preferences: input.preferences,
    timeZone: input.timeZone,
    now: input.now,
  });

  const now = input.now ?? new Date();
  const asOfDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: input.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  return {
    totalCash: summary.totalCash,
    availableCash: summary.availableCash,
    creditCardBalance: summary.creditCardBalance,
    totalDebt: summary.totalDebt,
    currentMonthSpending: summary.currentMonthSpending,
    currentMonthIncome: summary.currentMonthIncome,
    currentMonthNetCashFlow: summary.currentMonthNetCashFlow,
    staleAccountCount: summary.staleAccounts.length,
    investmentsExcludedFromCash: input.accounts.some(
      (account) =>
        account.active && !account.hidden && account.accountType === "investment",
    ),
    upcomingRecurring: getPersonalRecurringDueWithinDays(
      input.recurringItems,
      asOfDate,
      input.preferences.defaultReminderDays,
      input.excludedRecurringItemIds,
    ),
  };
}

export function buildMelusiExcludedRecurringItemIds(
  melusiTransactionIds: string[],
  transactions: PersonalFinanceTransactionRow[],
): Set<string> {
  const melusiTransactionIdSet = new Set(melusiTransactionIds);
  const excluded = new Set<string>();

  for (const transaction of transactions) {
    if (!transaction.recurringItemId) {
      continue;
    }

    if (melusiTransactionIdSet.has(transaction.id)) {
      excluded.add(transaction.recurringItemId);
    }
  }

  return excluded;
}

export function resolveCategoryMaps(categories: FinanceCategory[]): {
  slugById: Map<string, string>;
  nameById: Map<string, string>;
} {
  const slugById = new Map<string, string>();
  const nameById = new Map<string, string>();

  for (const category of categories) {
    slugById.set(category.id, category.slug);
    nameById.set(category.id, category.name);
  }

  return { slugById, nameById };
}
