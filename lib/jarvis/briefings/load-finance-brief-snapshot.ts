import "server-only";

import {
  FINANCE_BRIEF_MAX_RECENT_ACTIVITY,
  FINANCE_BRIEF_MAX_REVIEW_SAMPLES,
  FINANCE_BRIEF_MAX_STALE_ACCOUNT_LABELS,
  FINANCE_BRIEF_RECURRING_DUE_DAYS,
  calculateFinanceBriefAvailableCash,
  evaluatePlaidConnectionAttention,
  evaluatePlaidSyncHealth,
  getFinanceBriefStaleAccounts,
  getPersonalRecurringDueWithinDays,
  isLargePersonalExpenseCandidate,
  isRefundReceivedCandidate,
  resolveFinanceBriefActivityLowerBoundDate,
  resolveMerchantOrDescription,
  roundFinanceBriefCurrency,
  type FinanceBriefSyncHealthState,
  type FinanceBriefTransactionRow,
} from "@/lib/jarvis/briefings/finance-brief-rules";
import {
  getLocalDateString,
  resolveTimeZone,
} from "@/lib/jarvis/dashboard/command-center-utils";
import {
  FINANCE_DEFAULT_PREFERENCES,
  type FinanceAccount,
  type FinanceAccountType,
  type FinancePersonalOrBusiness,
  type FinancePreferences,
  type FinanceRecurringItem,
  type FinanceRecurringType,
  type FinanceTransactionStatus,
  type FinanceTransactionType,
} from "@/lib/jarvis/finance/finance-types";
import { loadSafePlaidConnections } from "@/lib/jarvis/integrations/plaid/plaid-connection-tools";
import { loadCurrentRuntimePlaidFinanceIds } from "@/lib/jarvis/integrations/plaid/plaid-environment-guard";
import type { PlaidSafeConnectionSummary } from "@/lib/jarvis/integrations/plaid/plaid-types";
import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FINANCE_ACCOUNT_COLUMNS =
  "id, user_id, name, institution_name, account_type, current_balance, available_balance, balance_as_of, currency, last_four, active, hidden, notes, source, created_at, updated_at";

const FINANCE_TRANSACTION_COLUMNS =
  "id, user_id, account_id, category_id, transaction_date, posted_date, amount, merchant, description, transaction_type, status, notes, source, deduplication_fingerprint, recurring_item_id, personal_or_business, created_at, updated_at";

const FINANCE_RECURRING_ITEM_COLUMNS =
  "id, user_id, name, recurring_type, expected_amount, amount_variability, frequency, next_expected_date, account_id, category_id, autopay, active, reminder_days, end_date, notes, source, created_at, updated_at";

const FINANCE_PREFERENCES_COLUMNS =
  "user_id, default_currency, minimum_cash_target, monthly_spending_limit, monthly_income_target, large_transaction_threshold, stale_balance_days, default_reminder_days, exclude_business_from_personal, created_at, updated_at";

const FINANCE_BUSINESS_EXPENSE_DETAIL_COLUMNS = "transaction_id";

const REVIEW_ITEM_SAMPLE_COLUMNS =
  "merchant, amount, transaction_date, posted_date";

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
  source: "manual" | "plaid";
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
  source: "manual" | "plaid" | "rocket_money_csv";
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

type FinancePreferencesRow = {
  user_id: string;
  default_currency: "USD";
  minimum_cash_target: number | null;
  monthly_spending_limit: number | null;
  monthly_income_target: number | null;
  large_transaction_threshold: number | null;
  stale_balance_days: number;
  default_reminder_days: number;
  exclude_business_from_personal: boolean;
  created_at: string;
  updated_at: string;
};

type ReviewSampleRow = {
  merchant: string | null;
  amount: unknown;
  transaction_date: string;
  posted_date: string;
};

export type FinanceBriefConnectionAttention = {
  institutionName: string | null;
  status: PlaidSafeConnectionSummary["status"];
};

export type FinanceBriefSyncHealthSignal = {
  institutionName: string | null;
  state: FinanceBriefSyncHealthState;
  lastSuccessfulSyncAt: string | null;
};

export type FinanceBriefPendingReviewSample = {
  merchant: string | null;
  amount: number;
  date: string;
};

export type FinanceBriefLargeTransaction = {
  date: string;
  merchant: string | null;
  amount: number;
};

export type FinanceBriefRefundReceived = {
  date: string;
  merchant: string | null;
  amount: number;
};

export type FinanceBriefUpcomingRecurring = {
  name: string;
  expectedAmount: number | null;
  nextExpectedDate: string;
  autopay: boolean;
};

export type FinanceBriefStaleAccountLabel = {
  name: string;
};

export type FinanceBriefSnapshot = {
  timezone: string;
  localDate: string;
  activityLowerBoundDate: string;
  preferences: FinancePreferences;
  availableCash: number | null;
  hasFinanceData: boolean;
  connectionAttention: FinanceBriefConnectionAttention[];
  syncHealthSignals: FinanceBriefSyncHealthSignal[];
  pendingReviewCount: number;
  pendingReviewSamples: FinanceBriefPendingReviewSample[];
  largeTransactions: FinanceBriefLargeTransaction[];
  refundsReceived: FinanceBriefRefundReceived[];
  upcomingRecurringObligations: FinanceBriefUpcomingRecurring[];
  lowCashActive: boolean;
  aggregateAvailableCash: number | null;
  minimumCashTarget: number | null;
  staleBalanceCount: number;
  staleAccountLabels: FinanceBriefStaleAccountLabel[];
};

export type LoadFinanceBriefSnapshotOptions = {
  now?: Date;
  since?: string;
};

export type LoadFinanceBriefSnapshotResult =
  | { success: true; snapshot: FinanceBriefSnapshot }
  | { success: false; errorCode: string };

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

function mapFinancePreferencesRow(row: FinancePreferencesRow): FinancePreferences {
  return {
    userId: row.user_id,
    defaultCurrency: row.default_currency,
    minimumCashTarget: row.minimum_cash_target,
    monthlySpendingLimit: row.monthly_spending_limit,
    monthlyIncomeTarget: row.monthly_income_target,
    largeTransactionThreshold: row.large_transaction_threshold,
    staleBalanceDays: row.stale_balance_days,
    defaultReminderDays: row.default_reminder_days,
    excludeBusinessFromPersonal: row.exclude_business_from_personal,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildDefaultPreferences(userId: string): FinancePreferences {
  const now = new Date().toISOString();

  return {
    userId,
    defaultCurrency: FINANCE_DEFAULT_PREFERENCES.defaultCurrency,
    minimumCashTarget: FINANCE_DEFAULT_PREFERENCES.minimumCashTarget,
    monthlySpendingLimit: FINANCE_DEFAULT_PREFERENCES.monthlySpendingLimit,
    monthlyIncomeTarget: FINANCE_DEFAULT_PREFERENCES.monthlyIncomeTarget,
    largeTransactionThreshold: FINANCE_DEFAULT_PREFERENCES.largeTransactionThreshold,
    staleBalanceDays: FINANCE_DEFAULT_PREFERENCES.staleBalanceDays,
    defaultReminderDays: FINANCE_DEFAULT_PREFERENCES.defaultReminderDays,
    excludeBusinessFromPersonal: FINANCE_DEFAULT_PREFERENCES.excludeBusinessFromPersonal,
    createdAt: now,
    updatedAt: now,
  };
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

function mapFinanceTransactionRow(
  row: FinanceTransactionRow,
): FinanceBriefTransactionRow | null {
  const amount = toNumeric(row.amount);

  if (amount === null || amount === 0) {
    return null;
  }

  return {
    id: row.id,
    transactionDate: row.transaction_date,
    postedDate: row.posted_date,
    amount,
    merchant: row.merchant,
    description: row.description,
    transactionType: row.transaction_type,
    status: row.status,
    personalOrBusiness: row.personal_or_business,
    recurringItemId: row.recurring_item_id,
    source: row.source,
  };
}

function mapFinanceRecurringItemRow(
  row: FinanceRecurringItemRow,
): FinanceRecurringItem | null {
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

function isPlaidAccountInRuntimeEnvironment(
  row: FinanceAccountRow,
  runtimePlaidAccountIds: Set<string>,
): boolean {
  if (row.source !== "plaid") {
    return true;
  }

  return runtimePlaidAccountIds.has(row.id);
}

function isPlaidTransactionInRuntimeEnvironment(
  row: FinanceTransactionRow,
  runtimePlaidTransactionIds: Set<string>,
): boolean {
  if (row.source !== "plaid") {
    return true;
  }

  return runtimePlaidTransactionIds.has(row.id);
}

function buildConnectionAttentionSignals(
  connections: PlaidSafeConnectionSummary[],
): FinanceBriefConnectionAttention[] {
  return connections
    .filter((connection) => evaluatePlaidConnectionAttention(connection))
    .map((connection) => ({
      institutionName: connection.institutionName,
      status: connection.status,
    }));
}

function buildSyncHealthSignals(
  connections: PlaidSafeConnectionSummary[],
  now: Date,
): FinanceBriefSyncHealthSignal[] {
  const signals: FinanceBriefSyncHealthSignal[] = [];

  for (const connection of connections) {
    const state = evaluatePlaidSyncHealth(connection, now);

    if (!state) {
      continue;
    }

    signals.push({
      institutionName: connection.institutionName,
      state,
      lastSuccessfulSyncAt: connection.lastSuccessfulSyncAt,
    });
  }

  return signals;
}

function buildLargeTransactions(
  transactions: FinanceBriefTransactionRow[],
  excludeBusinessFromPersonal: boolean,
  largeTransactionThreshold: number | null,
  lowerBoundDate: string,
  upperBoundDate: string,
): FinanceBriefLargeTransaction[] {
  if (largeTransactionThreshold === null || largeTransactionThreshold <= 0) {
    return [];
  }

  return transactions
    .filter((transaction) =>
      isLargePersonalExpenseCandidate(
        transaction,
        excludeBusinessFromPersonal,
        largeTransactionThreshold,
        lowerBoundDate,
        upperBoundDate,
      ),
    )
    .sort((left, right) =>
      getEffectivePostedDate(right).localeCompare(getEffectivePostedDate(left)),
    )
    .slice(0, FINANCE_BRIEF_MAX_RECENT_ACTIVITY)
    .map((transaction) => ({
      date: getEffectivePostedDate(transaction),
      merchant: resolveMerchantOrDescription(transaction),
      amount: roundFinanceBriefCurrency(Math.abs(transaction.amount)),
    }));
}

function buildRefundsReceived(
  transactions: FinanceBriefTransactionRow[],
  excludeBusinessFromPersonal: boolean,
  lowerBoundDate: string,
  upperBoundDate: string,
): FinanceBriefRefundReceived[] {
  return transactions
    .filter((transaction) =>
      isRefundReceivedCandidate(
        transaction,
        excludeBusinessFromPersonal,
        lowerBoundDate,
        upperBoundDate,
      ),
    )
    .sort((left, right) =>
      getEffectivePostedDate(right).localeCompare(getEffectivePostedDate(left)),
    )
    .slice(0, FINANCE_BRIEF_MAX_RECENT_ACTIVITY)
    .map((transaction) => ({
      date: getEffectivePostedDate(transaction),
      merchant: resolveMerchantOrDescription(transaction),
      amount: roundFinanceBriefCurrency(transaction.amount),
    }));
}

function getEffectivePostedDate(transaction: FinanceBriefTransactionRow): string {
  return transaction.postedDate ?? transaction.transactionDate;
}

function buildMelusiExcludedRecurringItemIds(
  melusiTransactionIds: string[],
  transactions: FinanceBriefTransactionRow[],
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

function buildUpcomingRecurringObligations(
  recurringItems: FinanceRecurringItem[],
  asOfDate: string,
  excludedRecurringItemIds: Set<string>,
): FinanceBriefUpcomingRecurring[] {
  return getPersonalRecurringDueWithinDays(
    recurringItems,
    asOfDate,
    FINANCE_BRIEF_RECURRING_DUE_DAYS,
    excludedRecurringItemIds,
  )
    .slice(0, FINANCE_BRIEF_MAX_RECENT_ACTIVITY)
    .map((item) => ({
      name: item.name,
      expectedAmount: roundFinanceBriefCurrency(item.expectedAmount),
      nextExpectedDate: item.nextExpectedDate,
      autopay: item.autopay,
    }));
}

function buildPendingReviewSamples(
  rows: ReviewSampleRow[],
): FinanceBriefPendingReviewSample[] {
  return rows.slice(0, FINANCE_BRIEF_MAX_REVIEW_SAMPLES).map((row) => ({
    merchant: row.merchant?.trim() || null,
    amount: roundFinanceBriefCurrency(Math.abs(toRequiredNumber(row.amount))),
    date: row.posted_date ?? row.transaction_date,
  }));
}

export async function loadFinanceBriefSnapshot(
  supabase: SupabaseClient,
  userId: string,
  options: LoadFinanceBriefSnapshotOptions = {},
): Promise<LoadFinanceBriefSnapshotResult> {
  const trimmedUserId = userId.trim();

  if (!trimmedUserId || !UUID_REGEX.test(trimmedUserId)) {
    return { success: false, errorCode: "invalid_user" };
  }

  const now = options.now ?? new Date();

  if (Number.isNaN(now.getTime())) {
    return { success: false, errorCode: "invalid_timestamp" };
  }

  if (options.since !== undefined && !Number.isFinite(Date.parse(options.since))) {
    return { success: false, errorCode: "invalid_activity_window" };
  }

  const { data: profileRow, error: profileError } = await supabase
    .from("jarvis_profiles")
    .select("timezone")
    .eq("user_id", trimmedUserId)
    .maybeSingle();

  if (profileError) {
    return { success: false, errorCode: "profile_load_failed" };
  }

  const timezone = resolveTimeZone(
    (profileRow as { timezone?: string | null } | null)?.timezone,
  );
  const localDate = getLocalDateString(timezone, now);
  const activityLowerBoundDate = resolveFinanceBriefActivityLowerBoundDate({
    since: options.since,
    timeZone: timezone,
    localDate,
  });

  const preferencesResult = await supabase
    .from("finance_preferences")
    .select(FINANCE_PREFERENCES_COLUMNS)
    .eq("user_id", trimmedUserId)
    .maybeSingle();

  if (preferencesResult.error) {
    return { success: false, errorCode: "preferences_load_failed" };
  }

  const preferences = preferencesResult.data
    ? mapFinancePreferencesRow(preferencesResult.data as FinancePreferencesRow)
    : buildDefaultPreferences(trimmedUserId);

  const [
    accountsResult,
    transactionsResult,
    recurringItemsResult,
    melusiDetailsResult,
    pendingReviewCountResult,
    pendingReviewSamplesResult,
    plaidConnections,
    runtimePlaidFinanceIds,
  ] = await Promise.all([
    supabase
      .from("finance_accounts")
      .select(FINANCE_ACCOUNT_COLUMNS)
      .eq("user_id", trimmedUserId),
    supabase
      .from("finance_transactions")
      .select(FINANCE_TRANSACTION_COLUMNS)
      .eq("user_id", trimmedUserId)
      .gte("transaction_date", activityLowerBoundDate)
      .order("transaction_date", { ascending: false })
      .limit(500),
    supabase
      .from("finance_recurring_items")
      .select(FINANCE_RECURRING_ITEM_COLUMNS)
      .eq("user_id", trimmedUserId)
      .eq("active", true),
    supabase
      .from("finance_business_expense_details")
      .select(FINANCE_BUSINESS_EXPENSE_DETAIL_COLUMNS)
      .eq("user_id", trimmedUserId)
      .eq("business_context", "melusi"),
    supabase
      .from("plaid_transaction_match_review_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", trimmedUserId)
      .eq("review_status", "pending"),
    supabase
      .from("plaid_transaction_match_review_items")
      .select(REVIEW_ITEM_SAMPLE_COLUMNS)
      .eq("user_id", trimmedUserId)
      .eq("review_status", "pending")
      .order("posted_date", { ascending: false })
      .limit(FINANCE_BRIEF_MAX_REVIEW_SAMPLES),
    loadSafePlaidConnections(supabase, trimmedUserId).catch(() => []),
    loadCurrentRuntimePlaidFinanceIds(supabase, trimmedUserId).catch(() => ({
      accountIds: new Set<string>(),
      transactionIds: new Set<string>(),
    })),
  ]);

  if (accountsResult.error) {
    return { success: false, errorCode: "accounts_load_failed" };
  }

  if (transactionsResult.error) {
    return { success: false, errorCode: "transactions_load_failed" };
  }

  if (recurringItemsResult.error) {
    return { success: false, errorCode: "recurring_load_failed" };
  }

  if (melusiDetailsResult.error) {
    return { success: false, errorCode: "melusi_details_load_failed" };
  }

  if (pendingReviewCountResult.error || pendingReviewSamplesResult.error) {
    return { success: false, errorCode: "review_items_load_failed" };
  }

  const accounts = ((accountsResult.data ?? []) as FinanceAccountRow[])
    .filter((row) =>
      isPlaidAccountInRuntimeEnvironment(row, runtimePlaidFinanceIds.accountIds),
    )
    .map(mapFinanceAccountRow);

  const transactions = ((transactionsResult.data ?? []) as FinanceTransactionRow[])
    .filter((row) =>
      isPlaidTransactionInRuntimeEnvironment(
        row,
        runtimePlaidFinanceIds.transactionIds,
      ),
    )
    .map(mapFinanceTransactionRow)
    .filter(
      (transaction): transaction is FinanceBriefTransactionRow =>
        transaction !== null,
    );

  const recurringItems = ((recurringItemsResult.data ?? []) as FinanceRecurringItemRow[])
    .map(mapFinanceRecurringItemRow)
    .filter((item): item is FinanceRecurringItem => item !== null);

  const melusiTransactionIds = (
    (melusiDetailsResult.data ?? []) as Array<{ transaction_id: string }>
  ).map((row) => row.transaction_id);

  const excludedRecurringItemIds = buildMelusiExcludedRecurringItemIds(
    melusiTransactionIds,
    transactions,
  );

  const activeAccounts = accounts.filter((account) => account.active && !account.hidden);
  const availableCash = calculateFinanceBriefAvailableCash(activeAccounts);
  const minimumCashTarget =
    preferences.minimumCashTarget !== null && preferences.minimumCashTarget > 0
      ? preferences.minimumCashTarget
      : null;
  const lowCashActive =
    minimumCashTarget !== null &&
    availableCash !== null &&
    availableCash < minimumCashTarget;

  const staleAccounts = getFinanceBriefStaleAccounts(
    activeAccounts,
    localDate,
    preferences.staleBalanceDays,
  );

  const connectionAttention = buildConnectionAttentionSignals(plaidConnections);
  const syncHealthSignals = buildSyncHealthSignals(plaidConnections, now);
  const largeTransactions = buildLargeTransactions(
    transactions,
    preferences.excludeBusinessFromPersonal,
    preferences.largeTransactionThreshold,
    activityLowerBoundDate,
    localDate,
  );
  const refundsReceived = buildRefundsReceived(
    transactions,
    preferences.excludeBusinessFromPersonal,
    activityLowerBoundDate,
    localDate,
  );
  const upcomingRecurringObligations = buildUpcomingRecurringObligations(
    recurringItems,
    localDate,
    excludedRecurringItemIds,
  );

  const pendingReviewCount = pendingReviewCountResult.count ?? 0;
  const pendingReviewSamples = buildPendingReviewSamples(
    (pendingReviewSamplesResult.data ?? []) as ReviewSampleRow[],
  );

  const hasFinanceData =
    accounts.length > 0 ||
    transactions.length > 0 ||
    recurringItems.length > 0 ||
    plaidConnections.length > 0;

  return {
    success: true,
    snapshot: {
      timezone,
      localDate,
      activityLowerBoundDate,
      preferences,
      availableCash,
      hasFinanceData,
      connectionAttention,
      syncHealthSignals,
      pendingReviewCount,
      pendingReviewSamples,
      largeTransactions,
      refundsReceived,
      upcomingRecurringObligations,
      lowCashActive,
      aggregateAvailableCash: availableCash,
      minimumCashTarget,
      staleBalanceCount: staleAccounts.length,
      staleAccountLabels: staleAccounts
        .slice(0, FINANCE_BRIEF_MAX_STALE_ACCOUNT_LABELS)
        .map((account) => ({ name: account.name })),
    },
  };
}
