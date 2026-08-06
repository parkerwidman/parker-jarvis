import "server-only";

import { resolveTimeZone } from "@/lib/jarvis/dashboard/command-center-utils";
import { buildFinanceAlerts } from "@/lib/jarvis/finance/finance-alerts";
import {
  buildFinanceSummary,
  daysBetweenDates,
  getCalendarMonthDateRange,
  getCurrentCalendarMonth,
} from "@/lib/jarvis/finance/finance-calculations";
import { ensureFinanceFoundation } from "@/lib/jarvis/finance/ensure-finance-foundation";
import type {
  FinanceAccount,
  FinanceAccountType,
  FinanceAlert,
  FinanceAlertKind,
  FinanceCategory,
  FinancePersonalOrBusiness,
  FinancePreferences,
  FinanceRecurringItem,
  FinanceRecurringType,
  FinanceTransaction,
  FinanceTransactionStatus,
  FinanceTransactionType,
} from "@/lib/jarvis/finance/finance-types";
import { loadSafePlaidConnections } from "@/lib/jarvis/integrations/plaid/plaid-connection-tools";
import type { SupabaseClient } from "@supabase/supabase-js";

const TRANSACTION_LOOKBACK_DAYS = 45;
const MAX_TRANSACTIONS = 500;
const MAX_RECENT_TRANSACTIONS = 20;
const MAX_TOP_CATEGORIES = 8;
const MAX_ALERTS = 8;

const FINANCE_ACCOUNT_COLUMNS =
  "id, user_id, name, institution_name, account_type, current_balance, available_balance, balance_as_of, currency, last_four, active, hidden, notes, created_at, updated_at";

const FINANCE_CATEGORY_COLUMNS =
  "id, user_id, name, slug, category_kind, is_system, sort_order, active, created_at, updated_at";

const FINANCE_TRANSACTION_COLUMNS =
  "id, user_id, account_id, category_id, transaction_date, posted_date, amount, merchant, description, transaction_type, status, notes, source, deduplication_fingerprint, recurring_item_id, personal_or_business, created_at, updated_at";

const FINANCE_RECURRING_ITEM_COLUMNS =
  "id, user_id, name, recurring_type, expected_amount, amount_variability, frequency, next_expected_date, account_id, category_id, autopay, active, reminder_days, end_date, notes, source, created_at, updated_at";

const ALERT_PRIORITY: Record<FinanceAlertKind, number> = {
  cash_below_target: 100,
  monthly_spending_above_limit: 90,
  recurring_due_soon: 80,
  stale_balance: 70,
  large_transaction: 60,
  possible_duplicate: 50,
  uncategorized_transaction: 40,
};

type FinanceAccountRow = {
  id: string;
  user_id: string;
  name: string;
  institution_name: string | null;
  account_type: FinanceAccountType;
  current_balance: unknown;
  available_balance: unknown;
  balance_as_of: string;
  currency: "USD";
  last_four: string | null;
  active: boolean;
  hidden: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type FinanceCategoryRow = {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  category_kind: FinanceCategory["categoryKind"];
  is_system: boolean;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type FinanceTransactionRow = {
  id: string;
  user_id: string;
  account_id: string | null;
  category_id: string | null;
  transaction_date: string;
  posted_date: string | null;
  amount: unknown;
  merchant: string | null;
  description: string | null;
  transaction_type: FinanceTransactionType;
  status: FinanceTransactionStatus;
  notes: string | null;
  source: "manual" | "plaid";
  deduplication_fingerprint: string | null;
  recurring_item_id: string | null;
  personal_or_business: FinancePersonalOrBusiness;
  created_at: string;
  updated_at: string;
};

type FinanceRecurringItemRow = {
  id: string;
  user_id: string;
  name: string;
  recurring_type: FinanceRecurringType;
  expected_amount: unknown;
  amount_variability: FinanceRecurringItem["amountVariability"];
  frequency: FinanceRecurringItem["frequency"];
  next_expected_date: string;
  account_id: string | null;
  category_id: string | null;
  autopay: boolean;
  active: boolean;
  reminder_days: number;
  end_date: string | null;
  notes: string | null;
  source: "manual";
  created_at: string;
  updated_at: string;
};

export type FinanceCommandCenterAccount = {
  id: string;
  name: string;
  institutionName: string | null;
  accountType: FinanceAccountType;
  currentBalance: number;
  availableBalance: number | null;
  lastFour: string | null;
  balanceAsOf: string;
  balanceIsStale: boolean;
};

export type FinanceCommandCenterCategorySpending = {
  categoryId: string | null;
  name: string;
  amount: number;
  sharePercent: number;
};

export type FinanceCommandCenterTransaction = {
  id: string;
  merchantOrDescription: string;
  transactionDate: string;
  amount: number;
  transactionType: FinanceTransactionType;
  status: FinanceTransactionStatus;
  accountName: string | null;
  categoryName: string | null;
  personalOrBusiness: FinancePersonalOrBusiness;
};

export type FinanceCommandCenterData = {
  timezone: string;
  currentMonthLabel: string;
  totalCash: number | null;
  availableCash: number | null;
  creditCardBalance: number | null;
  totalDebt: number | null;
  currentMonthIncome: number | null;
  currentMonthSpending: number | null;
  currentMonthNetCashFlow: number | null;
  accounts: FinanceCommandCenterAccount[];
  topSpendingCategories: FinanceCommandCenterCategorySpending[];
  recentTransactions: FinanceCommandCenterTransaction[];
  pendingTransactionCount: number;
  alerts: FinanceAlert[];
  connectedPlaidConnectionCount: number;
  linkedPlaidAccountCount: number;
  latestSuccessfulPlaidSyncAt: string | null;
  anyConnectionNeedsAttention: boolean;
  excludeBusinessFromPersonal: boolean;
};

export type LoadFinanceCommandCenterResult =
  | { success: true; data: FinanceCommandCenterData }
  | { success: false; error: string };

function toNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function toRequiredNumber(value: unknown): number {
  return toNumeric(value) ?? 0;
}

function subtractDaysFromDate(localDate: string, days: number): string {
  const anchorMs = Date.parse(`${localDate}T12:00:00.000Z`);
  return new Date(anchorMs - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function formatCurrentMonthLabel(timeZone: string, now: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long",
    year: "numeric",
  }).format(now);
}

function mapFinanceAccountRow(row: FinanceAccountRow): FinanceAccount {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    institutionName: row.institution_name,
    accountType: row.account_type,
    currentBalance: toRequiredNumber(row.current_balance),
    availableBalance: toNumeric(row.available_balance),
    balanceAsOf: row.balance_as_of,
    currency: row.currency,
    lastFour: row.last_four,
    active: row.active,
    hidden: row.hidden,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFinanceCategoryRow(row: FinanceCategoryRow): FinanceCategory {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    slug: row.slug,
    categoryKind: row.category_kind,
    isSystem: row.is_system,
    sortOrder: row.sort_order,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFinanceTransactionRow(row: FinanceTransactionRow): FinanceTransaction | null {
  const amount = toNumeric(row.amount);

  if (amount === null || amount === 0) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id,
    categoryId: row.category_id,
    transactionDate: row.transaction_date,
    postedDate: row.posted_date,
    amount,
    merchant: row.merchant,
    description: row.description,
    transactionType: row.transaction_type,
    status: row.status,
    notes: row.notes,
    source: row.source,
    deduplicationFingerprint: row.deduplication_fingerprint,
    recurringItemId: row.recurring_item_id,
    personalOrBusiness: row.personal_or_business,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFinanceRecurringItemRow(row: FinanceRecurringItemRow): FinanceRecurringItem | null {
  const expectedAmount = toNumeric(row.expected_amount);

  if (expectedAmount === null || expectedAmount <= 0) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    recurringType: row.recurring_type,
    expectedAmount,
    amountVariability: row.amount_variability,
    frequency: row.frequency,
    nextExpectedDate: row.next_expected_date,
    accountId: row.account_id,
    categoryId: row.category_id,
    autopay: row.autopay,
    active: row.active,
    reminderDays: row.reminder_days,
    endDate: row.end_date,
    notes: row.notes,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function resolveMerchantOrDescription(transaction: FinanceTransaction): string {
  const merchant = transaction.merchant?.trim();
  if (merchant) {
    return merchant;
  }

  const description = transaction.description?.trim();
  if (description) {
    return description;
  }

  return "Unknown transaction";
}

function getAlertDedupeKey(alert: FinanceAlert): string {
  return [
    alert.kind,
    alert.accountId ?? "",
    alert.transactionId ?? "",
    alert.recurringItemId ?? "",
    alert.categoryId ?? "",
  ].join("|");
}

function rankAndLimitAlerts(alerts: FinanceAlert[]): FinanceAlert[] {
  const seen = new Set<string>();
  const ranked = [...alerts]
    .sort((left, right) => {
      const priorityDelta = ALERT_PRIORITY[right.kind] - ALERT_PRIORITY[left.kind];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return left.title.localeCompare(right.title);
    })
    .filter((alert) => {
      const key = getAlertDedupeKey(alert);
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });

  return ranked.slice(0, MAX_ALERTS);
}

function buildTopSpendingCategories(
  categorySpending: Record<string, number>,
  categories: FinanceCategory[],
  totalSpending: number | null,
): FinanceCommandCenterCategorySpending[] {
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const spendingDenominator = totalSpending && totalSpending > 0 ? totalSpending : 0;

  return Object.entries(categorySpending)
    .map(([categoryKey, amount]) => {
      const normalizedAmount = Math.max(0, amount);
      const categoryId = categoryKey === "uncategorized" ? null : categoryKey;
      const name =
        categoryId === null
          ? "Uncategorized"
          : (categoryNames.get(categoryId) ?? "Unknown category");

      return {
        categoryId,
        name,
        amount: normalizedAmount,
        sharePercent:
          spendingDenominator > 0
            ? Math.round((normalizedAmount / spendingDenominator) * 1000) / 10
            : 0,
      };
    })
    .filter((entry) => entry.amount > 0)
    .sort((left, right) => right.amount - left.amount)
    .slice(0, MAX_TOP_CATEGORIES);
}

function buildVisibleAccounts(
  accounts: FinanceAccount[],
  asOfDate: string,
  staleBalanceDays: number,
): FinanceCommandCenterAccount[] {
  return accounts
    .filter((account) => account.active && !account.hidden)
    .map((account) => ({
      id: account.id,
      name: account.name,
      institutionName: account.institutionName,
      accountType: account.accountType,
      currentBalance: account.currentBalance,
      availableBalance: account.availableBalance,
      lastFour: account.lastFour,
      balanceAsOf: account.balanceAsOf,
      balanceIsStale: daysBetweenDates(account.balanceAsOf, asOfDate) > staleBalanceDays,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function buildRecentTransactions(
  transactions: FinanceTransaction[],
  accounts: FinanceAccount[],
  categories: FinanceCategory[],
): FinanceCommandCenterTransaction[] {
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));

  return transactions
    .filter((transaction) => transaction.status !== "void")
    .sort((left, right) => {
      const dateDelta = right.transactionDate.localeCompare(left.transactionDate);
      if (dateDelta !== 0) {
        return dateDelta;
      }

      return right.createdAt.localeCompare(left.createdAt);
    })
    .slice(0, MAX_RECENT_TRANSACTIONS)
    .map((transaction) => ({
      id: transaction.id,
      merchantOrDescription: resolveMerchantOrDescription(transaction),
      transactionDate: transaction.transactionDate,
      amount: transaction.amount,
      transactionType: transaction.transactionType,
      status: transaction.status,
      accountName: transaction.accountId
        ? (accountNames.get(transaction.accountId) ?? null)
        : null,
      categoryName: transaction.categoryId
        ? (categoryNames.get(transaction.categoryId) ?? null)
        : null,
      personalOrBusiness: transaction.personalOrBusiness,
    }));
}

function summarizePlaidConnections(
  connections: Awaited<ReturnType<typeof loadSafePlaidConnections>>,
): {
  connectedPlaidConnectionCount: number;
  linkedPlaidAccountCount: number;
  latestSuccessfulPlaidSyncAt: string | null;
  anyConnectionNeedsAttention: boolean;
} {
  let linkedPlaidAccountCount = 0;
  let latestSuccessfulPlaidSyncAt: string | null = null;
  let anyConnectionNeedsAttention = false;

  for (const connection of connections) {
    linkedPlaidAccountCount += connection.linkedAccountsCount ?? 0;

    if (
      connection.reconnectRequired ||
      connection.status === "error" ||
      Boolean(connection.lastErrorCode)
    ) {
      anyConnectionNeedsAttention = true;
    }

    if (!connection.lastSuccessfulSyncAt) {
      continue;
    }

    if (
      !latestSuccessfulPlaidSyncAt ||
      connection.lastSuccessfulSyncAt > latestSuccessfulPlaidSyncAt
    ) {
      latestSuccessfulPlaidSyncAt = connection.lastSuccessfulSyncAt;
    }
  }

  return {
    connectedPlaidConnectionCount: connections.filter((connection) => connection.connected)
      .length,
    linkedPlaidAccountCount,
    latestSuccessfulPlaidSyncAt,
    anyConnectionNeedsAttention,
  };
}

export async function loadFinanceCommandCenter(
  supabase: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<LoadFinanceCommandCenterResult> {
  const foundation = await ensureFinanceFoundation(supabase, userId);

  if (!foundation.success) {
    return { success: false, error: foundation.error };
  }

  const preferences: FinancePreferences = foundation.preferences;

  const { data: profileRow, error: profileError } = await supabase
    .from("jarvis_profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    return { success: false, error: "Could not load finance profile settings." };
  }

  const timezone = resolveTimeZone(
    (profileRow as { timezone?: string | null } | null)?.timezone,
  );
  const month = getCurrentCalendarMonth(timezone, now);
  const { startDate: monthStartDate } = getCalendarMonthDateRange(month.year, month.month);
  const transactionStartDate = subtractDaysFromDate(
    monthStartDate,
    TRANSACTION_LOOKBACK_DAYS,
  );
  const asOfDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const [
    accountsResult,
    categoriesResult,
    transactionsResult,
    recurringItemsResult,
    plaidConnectionsResult,
  ] = await Promise.all([
    supabase
      .from("finance_accounts")
      .select(FINANCE_ACCOUNT_COLUMNS)
      .eq("user_id", userId),
    supabase
      .from("finance_categories")
      .select(FINANCE_CATEGORY_COLUMNS)
      .eq("user_id", userId),
    supabase
      .from("finance_transactions")
      .select(FINANCE_TRANSACTION_COLUMNS)
      .eq("user_id", userId)
      .gte("transaction_date", transactionStartDate)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(MAX_TRANSACTIONS),
    supabase
      .from("finance_recurring_items")
      .select(FINANCE_RECURRING_ITEM_COLUMNS)
      .eq("user_id", userId)
      .eq("active", true),
    loadSafePlaidConnections(supabase, userId).catch(() => null),
  ]);

  if (accountsResult.error) {
    return { success: false, error: "Could not load finance accounts." };
  }

  if (categoriesResult.error) {
    return { success: false, error: "Could not load finance categories." };
  }

  if (transactionsResult.error) {
    return { success: false, error: "Could not load finance transactions." };
  }

  if (recurringItemsResult.error) {
    return { success: false, error: "Could not load finance recurring items." };
  }

  if (!plaidConnectionsResult) {
    return { success: false, error: "Could not load Plaid connection summaries." };
  }

  const accounts = ((accountsResult.data ?? []) as FinanceAccountRow[]).map(
    mapFinanceAccountRow,
  );
  const categories = ((categoriesResult.data ?? []) as FinanceCategoryRow[]).map(
    mapFinanceCategoryRow,
  );
  const transactions = ((transactionsResult.data ?? []) as FinanceTransactionRow[])
    .map(mapFinanceTransactionRow)
    .filter((transaction): transaction is FinanceTransaction => transaction !== null);
  const recurringItems = ((recurringItemsResult.data ?? []) as FinanceRecurringItemRow[])
    .map(mapFinanceRecurringItemRow)
    .filter((item): item is FinanceRecurringItem => item !== null);

  const summary = buildFinanceSummary({
    accounts,
    transactions,
    recurringItems,
    preferences,
    timeZone: timezone,
    now,
    month,
  });

  const alerts = rankAndLimitAlerts(
    buildFinanceAlerts({
      accounts,
      transactions,
      recurringItems,
      preferences,
      totalCash: summary.totalCash,
      timeZone: timezone,
      now,
    }),
  );

  const plaidSummary = summarizePlaidConnections(plaidConnectionsResult);

  return {
    success: true,
    data: {
      timezone,
      currentMonthLabel: formatCurrentMonthLabel(timezone, now),
      totalCash: summary.totalCash,
      availableCash: summary.availableCash,
      creditCardBalance: summary.creditCardBalance,
      totalDebt: summary.totalDebt,
      currentMonthIncome: summary.currentMonthIncome,
      currentMonthSpending: summary.currentMonthSpending,
      currentMonthNetCashFlow: summary.currentMonthNetCashFlow,
      accounts: buildVisibleAccounts(
        accounts,
        asOfDate,
        preferences.staleBalanceDays,
      ),
      topSpendingCategories: buildTopSpendingCategories(
        summary.categorySpending,
        categories,
        summary.currentMonthSpending,
      ),
      recentTransactions: buildRecentTransactions(transactions, accounts, categories),
      pendingTransactionCount: transactions.filter(
        (transaction) => transaction.status === "pending",
      ).length,
      alerts,
      connectedPlaidConnectionCount: plaidSummary.connectedPlaidConnectionCount,
      linkedPlaidAccountCount: plaidSummary.linkedPlaidAccountCount,
      latestSuccessfulPlaidSyncAt: plaidSummary.latestSuccessfulPlaidSyncAt,
      anyConnectionNeedsAttention: plaidSummary.anyConnectionNeedsAttention,
      excludeBusinessFromPersonal: preferences.excludeBusinessFromPersonal,
    },
  };
}
