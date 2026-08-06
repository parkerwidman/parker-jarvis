import "server-only";

import { resolveTimeZone } from "@/lib/jarvis/dashboard/command-center-utils";
import { ensureFinanceFoundation } from "@/lib/jarvis/finance/ensure-finance-foundation";
import type {
  FinanceAccount,
  FinanceAccountType,
  FinanceCategory,
  FinancePersonalOrBusiness,
  FinancePreferences,
  FinanceRecurringItem,
  FinanceRecurringType,
  FinanceTransactionStatus,
  FinanceTransactionType,
} from "@/lib/jarvis/finance/finance-types";
import { loadSafePlaidConnections } from "@/lib/jarvis/integrations/plaid/plaid-connection-tools";
import { loadCurrentRuntimePlaidFinanceIds } from "@/lib/jarvis/integrations/plaid/plaid-environment-guard";
import { loadPlaidTransactionMatchReviewPendingCount } from "@/lib/jarvis/integrations/plaid/load-plaid-transaction-match-review";
import type { PlaidSafeConnectionSummary } from "@/lib/jarvis/integrations/plaid/plaid-types";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildMelusiExcludedRecurringItemIds,
  resolveCategoryMaps,
} from "./personal-finance-calculations";
import { selectCanonicalPersonalFinanceTransactions, type PersonalFinanceTransactionRow } from "./personal-finance-transaction-rules";
import { PERSONAL_FINANCE_MAX_TRANSACTIONS_LOAD } from "./personal-finance-constants";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FINANCE_ACCOUNT_COLUMNS =
  "id, user_id, name, institution_name, account_type, current_balance, available_balance, balance_as_of, currency, last_four, active, hidden, notes, source, created_at, updated_at";

const FINANCE_CATEGORY_COLUMNS =
  "id, user_id, name, slug, category_kind, is_system, sort_order, active, created_at, updated_at";

const FINANCE_TRANSACTION_COLUMNS =
  "id, user_id, account_id, category_id, transaction_date, posted_date, amount, merchant, description, transaction_type, status, notes, source, deduplication_fingerprint, recurring_item_id, personal_or_business, created_at, updated_at";

const FINANCE_RECURRING_ITEM_COLUMNS =
  "id, user_id, name, recurring_type, expected_amount, amount_variability, frequency, next_expected_date, account_id, category_id, autopay, active, reminder_days, end_date, notes, source, created_at, updated_at";

const FINANCE_BUSINESS_EXPENSE_DETAIL_COLUMNS = "transaction_id";

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

export type PersonalFinanceLoadedData = {
  timezone: string;
  preferences: FinancePreferences;
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  transactions: PersonalFinanceTransactionRow[];
  recurringItems: FinanceRecurringItem[];
  melusiTransactionIds: Set<string>;
  excludedRecurringItemIds: Set<string>;
  categorySlugById: Map<string, string>;
  categoryNameById: Map<string, string>;
  plaidConnections: PlaidSafeConnectionSummary[];
  pendingReviewCount: number;
};

export type LoadPersonalFinanceDataResult =
  | { success: true; data: PersonalFinanceLoadedData }
  | { success: false; errorCode: "unauthorized" | "finance_data_unavailable" | "finance_query_failed" };

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

function mapFinanceTransactionRow(
  row: FinanceTransactionRow,
  mappedFinanceTransactionIds: Set<string>,
): PersonalFinanceTransactionRow | null {
  const amount = toNumeric(row.amount);

  if (amount === null || amount === 0) {
    return null;
  }

  return {
    id: row.id,
    accountId: row.account_id,
    categoryId: row.category_id,
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
    deduplicationFingerprint: row.deduplication_fingerprint,
    isPlaidMapped: mappedFinanceTransactionIds.has(row.id),
  };
}

async function loadMappedFinanceTransactionIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("plaid_finance_transaction_mappings")
    .select("finance_transaction_id")
    .eq("user_id", userId)
    .is("removed_at", null);

  if (error) {
    throw new Error("finance_query_failed");
  }

  return new Set(
    ((data ?? []) as Array<{ finance_transaction_id: string }>).map(
      (row) => row.finance_transaction_id,
    ),
  );
}

export async function loadPersonalFinanceData(
  supabase: SupabaseClient,
  userId: string,
  transactionStartDate: string,
): Promise<LoadPersonalFinanceDataResult> {
  const trimmedUserId = userId.trim();

  if (!trimmedUserId || !UUID_REGEX.test(trimmedUserId)) {
    return { success: false, errorCode: "unauthorized" };
  }

  const foundation = await ensureFinanceFoundation(supabase, trimmedUserId);

  if (!foundation.success) {
    return { success: false, errorCode: "finance_data_unavailable" };
  }

  const { data: profileRow, error: profileError } = await supabase
    .from("jarvis_profiles")
    .select("timezone")
    .eq("user_id", trimmedUserId)
    .maybeSingle();

  if (profileError) {
    return { success: false, errorCode: "finance_query_failed" };
  }

  const timezone = resolveTimeZone(
    (profileRow as { timezone?: string | null } | null)?.timezone,
  );

  try {
    const [
      accountsResult,
      categoriesResult,
      transactionsResult,
      recurringItemsResult,
      melusiDetailsResult,
      mappedFinanceTransactionIds,
      plaidConnections,
      pendingReviewCount,
      runtimePlaidFinanceIds,
    ] = await Promise.all([
      supabase
        .from("finance_accounts")
        .select(FINANCE_ACCOUNT_COLUMNS)
        .eq("user_id", trimmedUserId),
      supabase
        .from("finance_categories")
        .select(FINANCE_CATEGORY_COLUMNS)
        .eq("user_id", trimmedUserId),
      supabase
        .from("finance_transactions")
        .select(FINANCE_TRANSACTION_COLUMNS)
        .eq("user_id", trimmedUserId)
        .gte("transaction_date", transactionStartDate)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(PERSONAL_FINANCE_MAX_TRANSACTIONS_LOAD),
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
      loadMappedFinanceTransactionIds(supabase, trimmedUserId),
      loadSafePlaidConnections(supabase, trimmedUserId).catch(() => []),
      loadPlaidTransactionMatchReviewPendingCount(supabase, trimmedUserId),
      loadCurrentRuntimePlaidFinanceIds(supabase, trimmedUserId).catch(() => ({
        accountIds: new Set<string>(),
        transactionIds: new Set<string>(),
      })),
    ]);

    if (
      accountsResult.error ||
      categoriesResult.error ||
      transactionsResult.error ||
      recurringItemsResult.error ||
      melusiDetailsResult.error
    ) {
      return { success: false, errorCode: "finance_query_failed" };
    }

    const accounts = ((accountsResult.data ?? []) as FinanceAccountRow[])
      .filter((row) =>
        isPlaidAccountInRuntimeEnvironment(row, runtimePlaidFinanceIds.accountIds),
      )
      .map(mapFinanceAccountRow);

    const categories = ((categoriesResult.data ?? []) as FinanceCategoryRow[]).map(
      mapFinanceCategoryRow,
    );

    const rawTransactions = ((transactionsResult.data ?? []) as FinanceTransactionRow[])
      .filter((row) =>
        isPlaidTransactionInRuntimeEnvironment(
          row,
          runtimePlaidFinanceIds.transactionIds,
        ),
      )
      .map((row) => mapFinanceTransactionRow(row, mappedFinanceTransactionIds))
      .filter(
        (transaction): transaction is PersonalFinanceTransactionRow =>
          transaction !== null,
      );

    const transactions = selectCanonicalPersonalFinanceTransactions(rawTransactions);

    const recurringItems = ((recurringItemsResult.data ?? []) as FinanceRecurringItemRow[])
      .map(mapFinanceRecurringItemRow)
      .filter((item): item is FinanceRecurringItem => item !== null);

    const melusiTransactionIds = new Set(
      ((melusiDetailsResult.data ?? []) as Array<{ transaction_id: string }>).map(
        (row) => row.transaction_id,
      ),
    );

    const excludedRecurringItemIds = buildMelusiExcludedRecurringItemIds(
      [...melusiTransactionIds],
      transactions,
    );

    const { slugById: categorySlugById, nameById: categoryNameById } =
      resolveCategoryMaps(categories);

    return {
      success: true,
      data: {
        timezone,
        preferences: foundation.preferences,
        accounts,
        categories,
        transactions,
        recurringItems,
        melusiTransactionIds,
        excludedRecurringItemIds,
        categorySlugById,
        categoryNameById,
        plaidConnections,
        pendingReviewCount,
      },
    };
  } catch {
    return { success: false, errorCode: "finance_query_failed" };
  }
}
