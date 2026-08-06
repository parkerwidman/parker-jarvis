import "server-only";

import { ensureFinanceFoundation } from "@/lib/jarvis/finance/ensure-finance-foundation";
import type { FinanceAccountType } from "@/lib/jarvis/finance/finance-types";
import {
  fetchPlaidAccounts,
  fetchPlaidTransactionsSyncPage,
} from "@/lib/jarvis/integrations/plaid/plaid-client";
import {
  decryptStoredAccessToken,
  hasUsablePlaidCredentials,
  markPlaidConnectionErrorById,
} from "@/lib/jarvis/integrations/plaid/plaid-connection-tools";
import { getPlaidEnvironment } from "@/lib/jarvis/integrations/plaid/plaid-config";
import { loadRuntimePlaidConnectionRowById } from "@/lib/jarvis/integrations/plaid/plaid-environment-guard";
import {
  isInvestmentPlaidAccount,
  isSupportedUsdCurrency,
  mapPlaidAccountBalances,
  mapPlaidAccountType,
  mapPlaidCategorySlug,
  mapPlaidTransactionType,
  normalizePlaidTransactionAmount,
  resolvePlaidAccountLastFour,
  resolvePlaidAccountName,
  resolvePlaidMerchant,
  resolvePlaidPostedDate,
  resolvePlaidTransactionDate,
} from "@/lib/jarvis/integrations/plaid/plaid-sync-mappers";
import { matchPlaidPostedTransaction } from "@/lib/jarvis/integrations/plaid/plaid-transaction-match-service";
import type { PlaidPostedTransactionMatchInput } from "@/lib/jarvis/integrations/plaid/plaid-transaction-match-types";
import { resolvePlaidMappingRemovalDecision } from "@/lib/jarvis/integrations/plaid/plaid-transaction-removal-safety";
import type {
  PlaidConnectionRow,
  PlaidConnectionSyncResult,
  PlaidSafeErrorCode,
} from "@/lib/jarvis/integrations/plaid/plaid-types";
import { PlaidSafeError } from "@/lib/jarvis/integrations/plaid/plaid-types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountBase, RemovedTransaction, Transaction } from "plaid";

const SYNC_LOCK_MINUTES = 10;
const MAX_MUTATION_RESTARTS = 3;

type AccountMappingRow = {
  id: string;
  finance_account_id: string;
  provider_account_id: string;
};

type TransactionMappingRow = {
  id: string;
  finance_transaction_id: string;
  provider_transaction_id: string;
  provider_pending_transaction_id: string | null;
  removed_at: string | null;
};

type FinanceAccountRow = {
  id: string;
  active: boolean;
  account_type: FinanceAccountType;
};

type FinanceTransactionRow = {
  id: string;
  source: string;
  category_user_edited: boolean;
  personal_or_business_user_edited: boolean;
  notes_user_edited: boolean;
  personal_or_business: string;
  category_id: string | null;
  notes: string | null;
};

export type PlaidSyncCounts = {
  accountsCreated: number;
  accountsUpdated: number;
  transactionsAdded: number;
  transactionsModified: number;
  transactionsRemoved: number;
  transactionsMatchedExisting: number;
  transactionsReviewRequired: number;
  rocketMoneyMappingsRemoved: number;
  unclassifiedCount: number;
};

type SyncCounts = PlaidSyncCounts;

type UpsertResult = {
  added: boolean;
  modified: boolean;
  unclassified: boolean;
  matchedExisting: boolean;
  reviewRequired: boolean;
};

type RemoveResult = {
  voided: boolean;
  rocketMoneyMappingRemoved: boolean;
};

type SyncContext = {
  supabase: SupabaseClient;
  userId: string;
  connection: PlaidConnectionRow;
  accessToken: string;
  syncTimestamp: string;
  syncDate: string;
  institutionName: string | null;
  categorySlugToId: Map<string, string>;
  accountMappings: Map<string, AccountMappingRow>;
  investmentAccountIds: Set<string>;
};

const activeConnectionLocks = new Set<string>();

function isSyncLockActive(syncInProgressAt: string | null | undefined): boolean {
  if (!syncInProgressAt) {
    return false;
  }

  const startedMs = Date.parse(syncInProgressAt);
  if (!Number.isFinite(startedMs)) {
    return false;
  }

  return Date.now() - startedMs < SYNC_LOCK_MINUTES * 60_000;
}

function emptySyncCounts(): SyncCounts {
  return {
    accountsCreated: 0,
    accountsUpdated: 0,
    transactionsAdded: 0,
    transactionsModified: 0,
    transactionsRemoved: 0,
    transactionsMatchedExisting: 0,
    transactionsReviewRequired: 0,
    rocketMoneyMappingsRemoved: 0,
    unclassifiedCount: 0,
  };
}

function toSyncResult(
  connectionId: string,
  status: PlaidConnectionSyncResult["status"],
  counts: SyncCounts,
  errorCode?: PlaidSafeErrorCode,
): PlaidConnectionSyncResult {
  return {
    connectionId,
    status,
    accountsCreated: counts.accountsCreated,
    accountsUpdated: counts.accountsUpdated,
    transactionsAdded: counts.transactionsAdded,
    transactionsModified: counts.transactionsModified,
    transactionsRemoved: counts.transactionsRemoved,
    transactionsMatchedExisting: counts.transactionsMatchedExisting,
    transactionsReviewRequired: counts.transactionsReviewRequired,
    rocketMoneyMappingsRemoved: counts.rocketMoneyMappingsRemoved,
    unclassifiedCount: counts.unclassifiedCount,
    errorCode,
  };
}

function buildPostedMatchInput(
  context: SyncContext,
  transaction: Transaction,
): PlaidPostedTransactionMatchInput {
  const jarvisAmount = normalizePlaidTransactionAmount(transaction.amount);

  return {
    providerTransactionId: transaction.transaction_id,
    pendingProviderTransactionId: transaction.pending_transaction_id,
    transactionDate: resolvePlaidTransactionDate(transaction),
    postedDate: resolvePlaidPostedDate(transaction),
    amount: jarvisAmount,
    merchant: resolvePlaidMerchant(transaction),
    description: null,
    transactionType: mapPlaidTransactionType(transaction, jarvisAmount),
    status: transaction.pending ? "pending" : "posted",
  };
}

async function loadMappedFinanceTransaction(
  context: SyncContext,
  financeTransactionId: string,
): Promise<FinanceTransactionRow | null> {
  const { data, error } = await context.supabase
    .from("finance_transactions")
    .select(
      "id, source, category_user_edited, personal_or_business_user_edited, notes_user_edited, personal_or_business, category_id, notes",
    )
    .eq("id", financeTransactionId)
    .eq("user_id", context.userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as FinanceTransactionRow | null) ?? null;
}

function assertSafeMappedFinanceSource(source: string | null | undefined): void {
  if (source === "plaid" || source === "rocket_money_csv") {
    return;
  }

  throw new PlaidSafeError("sync_failed");
}

async function updateRocketMoneyMappingState(
  context: SyncContext,
  mapping: TransactionMappingRow,
  transaction: Transaction,
): Promise<void> {
  const { error: mappingError } = await context.supabase
    .from("plaid_finance_transaction_mappings")
    .update({
      provider_pending_transaction_id: transaction.pending_transaction_id,
      removed_at: null,
      provider_observed_at: context.syncTimestamp,
    })
    .eq("id", mapping.id)
    .eq("user_id", context.userId);

  if (mappingError) {
    throw mappingError;
  }
}

async function invokePostedTransactionMatcher(
  context: SyncContext,
  financeAccountId: string,
  matchInput: PlaidPostedTransactionMatchInput,
): Promise<
  | { outcome: "matched_existing" }
  | { outcome: "review_required" }
  | { outcome: "no_match" }
> {
  try {
    const result = await matchPlaidPostedTransaction(
      context.supabase,
      context.userId,
      context.connection.id,
      financeAccountId,
      matchInput,
      { observedAt: context.syncTimestamp },
    );

    if (result.outcome === "matched_existing") {
      return { outcome: "matched_existing" };
    }

    if (result.outcome === "review_required") {
      return { outcome: "review_required" };
    }

    return { outcome: "no_match" };
  } catch {
    throw new PlaidSafeError("sync_failed");
  }
}

async function acquireSyncLock(
  supabase: SupabaseClient,
  connection: PlaidConnectionRow,
): Promise<boolean> {
  if (activeConnectionLocks.has(connection.id)) {
    return false;
  }

  if (isSyncLockActive(connection.sync_in_progress_at)) {
    return false;
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("plaid_connections")
    .update({ sync_in_progress_at: now })
    .eq("id", connection.id)
    .eq("user_id", connection.user_id)
    .is("sync_in_progress_at", connection.sync_in_progress_at)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  activeConnectionLocks.add(connection.id);
  return true;
}

async function releaseSyncLock(
  supabase: SupabaseClient,
  connectionId: string,
  userId: string,
): Promise<void> {
  activeConnectionLocks.delete(connectionId);

  await supabase
    .from("plaid_connections")
    .update({ sync_in_progress_at: null })
    .eq("id", connectionId)
    .eq("user_id", userId);
}

async function loadCategorySlugMap(
  supabase: SupabaseClient,
  userId: string,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("finance_categories")
    .select("id, slug")
    .eq("user_id", userId)
    .eq("active", true);

  if (error) {
    throw error;
  }

  const slugMap = new Map<string, string>();
  for (const row of data ?? []) {
    slugMap.set(row.slug.toLowerCase(), row.id);
  }

  return slugMap;
}

async function loadAccountMappings(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string,
): Promise<Map<string, AccountMappingRow>> {
  const { data, error } = await supabase
    .from("plaid_finance_account_mappings")
    .select("id, finance_account_id, provider_account_id")
    .eq("user_id", userId)
    .eq("plaid_connection_id", connectionId);

  if (error) {
    throw error;
  }

  const mappings = new Map<string, AccountMappingRow>();
  for (const row of (data as AccountMappingRow[] | null) ?? []) {
    mappings.set(row.provider_account_id, row);
  }

  return mappings;
}

async function loadInvestmentAccountProviderIds(
  supabase: SupabaseClient,
  userId: string,
  accountMappings: Map<string, AccountMappingRow>,
): Promise<Set<string>> {
  const financeAccountIds = [...accountMappings.values()].map(
    (mapping) => mapping.finance_account_id,
  );

  if (financeAccountIds.length === 0) {
    return new Set();
  }

  const { data, error } = await supabase
    .from("finance_accounts")
    .select("id, account_type")
    .eq("user_id", userId)
    .in("id", financeAccountIds);

  if (error) {
    throw error;
  }

  const investmentFinanceAccountIds = new Set(
    ((data as Array<{ id: string; account_type: FinanceAccountType }> | null) ?? [])
      .filter((row) => row.account_type === "investment")
      .map((row) => row.id),
  );

  const investmentProviderIds = new Set<string>();
  for (const mapping of accountMappings.values()) {
    if (investmentFinanceAccountIds.has(mapping.finance_account_id)) {
      investmentProviderIds.add(mapping.provider_account_id);
    }
  }

  return investmentProviderIds;
}

async function syncPlaidConnectionAccounts(
  context: SyncContext,
  plaidAccounts: AccountBase[],
): Promise<SyncCounts> {
  const counts = emptySyncCounts();

  for (const plaidAccount of plaidAccounts) {
    if (
      !isSupportedUsdCurrency(
        plaidAccount.balances.iso_currency_code,
        plaidAccount.balances.unofficial_currency_code,
      )
    ) {
      continue;
    }

    const accountType = mapPlaidAccountType(plaidAccount);
    const balances = mapPlaidAccountBalances(accountType, plaidAccount.balances);
    const existingMapping = context.accountMappings.get(plaidAccount.account_id);

    if (existingMapping) {
      const { data: financeAccount, error: lookupError } = await context.supabase
        .from("finance_accounts")
        .select("id, active")
        .eq("id", existingMapping.finance_account_id)
        .eq("user_id", context.userId)
        .maybeSingle();

      if (lookupError) {
        throw lookupError;
      }

      if (!financeAccount) {
        continue;
      }

      const updatePayload: Record<string, unknown> = {
        institution_name: context.institutionName,
        account_type: accountType,
        current_balance: balances.currentBalance,
        available_balance: balances.availableBalance,
        balance_as_of: context.syncDate,
        currency: "USD",
        last_four: resolvePlaidAccountLastFour(plaidAccount.mask),
      };

      if (financeAccount.active) {
        updatePayload.name = resolvePlaidAccountName(plaidAccount);
      }

      const { error: updateError } = await context.supabase
        .from("finance_accounts")
        .update(updatePayload)
        .eq("id", existingMapping.finance_account_id)
        .eq("user_id", context.userId)
        .eq("source", "plaid");

      if (updateError) {
        throw updateError;
      }

      const { error: mappingError } = await context.supabase
        .from("plaid_finance_account_mappings")
        .update({ provider_observed_at: context.syncTimestamp })
        .eq("id", existingMapping.id)
        .eq("user_id", context.userId);

      if (mappingError) {
        throw mappingError;
      }

      counts.accountsUpdated += 1;
      continue;
    }

    const { data: createdAccount, error: insertError } = await context.supabase
      .from("finance_accounts")
      .insert({
        user_id: context.userId,
        name: resolvePlaidAccountName(plaidAccount),
        institution_name: context.institutionName,
        account_type: accountType,
        current_balance: balances.currentBalance,
        available_balance: balances.availableBalance,
        balance_as_of: context.syncDate,
        currency: "USD",
        last_four: resolvePlaidAccountLastFour(plaidAccount.mask),
        source: "plaid",
        active: true,
        hidden: false,
      })
      .select("id")
      .single();

    if (insertError || !createdAccount) {
      throw insertError ?? new Error("account_insert_failed");
    }

    const { data: createdMapping, error: mappingError } = await context.supabase
      .from("plaid_finance_account_mappings")
      .insert({
        user_id: context.userId,
        plaid_connection_id: context.connection.id,
        finance_account_id: createdAccount.id,
        provider_account_id: plaidAccount.account_id,
        provider_observed_at: context.syncTimestamp,
      })
      .select("id, finance_account_id, provider_account_id")
      .single();

    if (mappingError || !createdMapping) {
      throw mappingError ?? new Error("account_mapping_insert_failed");
    }

    context.accountMappings.set(plaidAccount.account_id, createdMapping as AccountMappingRow);

    if (isInvestmentPlaidAccount(accountType)) {
      context.investmentAccountIds.add(plaidAccount.account_id);
    }

    counts.accountsCreated += 1;
  }

  return counts;
}

async function findTransactionMapping(
  context: SyncContext,
  providerTransactionId: string,
): Promise<TransactionMappingRow | null> {
  const { data, error } = await context.supabase
    .from("plaid_finance_transaction_mappings")
    .select(
      "id, finance_transaction_id, provider_transaction_id, provider_pending_transaction_id, removed_at",
    )
    .eq("user_id", context.userId)
    .eq("plaid_connection_id", context.connection.id)
    .eq("provider_transaction_id", providerTransactionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as TransactionMappingRow | null) ?? null;
}

async function voidPendingReplacement(
  context: SyncContext,
  pendingProviderTransactionId: string,
  observedAt: string,
): Promise<void> {
  const pendingMapping = await findTransactionMapping(
    context,
    pendingProviderTransactionId,
  );

  if (!pendingMapping || pendingMapping.removed_at) {
    return;
  }

  const { error: transactionError } = await context.supabase
    .from("finance_transactions")
    .update({ status: "void" })
    .eq("id", pendingMapping.finance_transaction_id)
    .eq("user_id", context.userId)
    .eq("source", "plaid");

  if (transactionError) {
    throw transactionError;
  }

  const { error: mappingError } = await context.supabase
    .from("plaid_finance_transaction_mappings")
    .update({
      removed_at: observedAt,
      provider_observed_at: observedAt,
    })
    .eq("id", pendingMapping.id)
    .eq("user_id", context.userId);

  if (mappingError) {
    throw mappingError;
  }
}

function buildProviderTransactionPayload(
  context: SyncContext,
  transaction: Transaction,
  existing: FinanceTransactionRow | null,
): {
  payload: Record<string, unknown>;
  unclassified: boolean;
} {
  const jarvisAmount = normalizePlaidTransactionAmount(transaction.amount);
  const categorySlug = mapPlaidCategorySlug(transaction.personal_finance_category);
  const categoryId = context.categorySlugToId.get(categorySlug) ?? null;
  const transactionType = mapPlaidTransactionType(transaction, jarvisAmount);
  const financeAccountMapping = context.accountMappings.get(transaction.account_id);

  const payload: Record<string, unknown> = {
    account_id: financeAccountMapping?.finance_account_id ?? null,
    transaction_date: resolvePlaidTransactionDate(transaction),
    posted_date: resolvePlaidPostedDate(transaction),
    amount: jarvisAmount,
    merchant: resolvePlaidMerchant(transaction),
    description: null,
    transaction_type: transactionType,
    status: transaction.pending ? "pending" : "posted",
    source: "plaid",
  };

  if (!existing) {
    payload.personal_or_business = "unclassified";
    payload.category_id = categoryId;
    payload.notes = null;
  } else {
    if (!existing.category_user_edited) {
      payload.category_id = categoryId;
    }

    if (existing.notes_user_edited) {
      payload.notes = existing.notes;
    }
  }

  return {
    payload,
    unclassified: !existing,
  };
}

type CreatePlaidFinanceTransactionRpcResult = {
  success: boolean;
  code?: string;
  finance_transaction_id?: string;
};

async function createPlaidFinanceTransactionAtomically(
  context: SyncContext,
  financeAccountId: string,
  transaction: Transaction,
  payload: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await context.supabase.rpc("create_plaid_finance_transaction", {
    p_user_id: context.userId,
    p_plaid_connection_id: context.connection.id,
    p_finance_account_id: financeAccountId,
    p_provider_transaction_id: transaction.transaction_id,
    p_provider_pending_transaction_id: transaction.pending_transaction_id,
    p_transaction_date: payload.transaction_date,
    p_posted_date: payload.posted_date,
    p_amount: payload.amount,
    p_merchant: payload.merchant,
    p_description: payload.description,
    p_transaction_type: payload.transaction_type,
    p_status: payload.status,
    p_category_id: payload.category_id,
    p_observed_at: context.syncTimestamp,
  });

  if (error) {
    throw new PlaidSafeError("sync_failed");
  }

  const result = data as CreatePlaidFinanceTransactionRpcResult | null;
  if (!result?.success || !result.finance_transaction_id) {
    throw new PlaidSafeError("sync_failed");
  }
}

async function upsertPlaidTransaction(
  context: SyncContext,
  transaction: Transaction,
  mode: "added" | "modified",
): Promise<UpsertResult> {
  if (context.investmentAccountIds.has(transaction.account_id)) {
    return {
      added: false,
      modified: false,
      unclassified: false,
      matchedExisting: false,
      reviewRequired: false,
    };
  }

  if (
    !isSupportedUsdCurrency(transaction.iso_currency_code, transaction.unofficial_currency_code)
  ) {
    throw new PlaidSafeError("unsupported_currency");
  }

  const financeAccountMapping = context.accountMappings.get(transaction.account_id);
  if (!financeAccountMapping) {
    throw new PlaidSafeError("sync_failed");
  }

  if (transaction.pending_transaction_id) {
    await voidPendingReplacement(
      context,
      transaction.pending_transaction_id,
      context.syncTimestamp,
    );
  }

  const existingMapping = await findTransactionMapping(
    context,
    transaction.transaction_id,
  );

  if (existingMapping) {
    const mappedFinance = await loadMappedFinanceTransaction(
      context,
      existingMapping.finance_transaction_id,
    );

    if (!mappedFinance) {
      throw new PlaidSafeError("sync_failed");
    }

    assertSafeMappedFinanceSource(mappedFinance.source);

    if (mappedFinance.source === "rocket_money_csv") {
      await updateRocketMoneyMappingState(context, existingMapping, transaction);

      return {
        added: false,
        modified: false,
        unclassified: false,
        matchedExisting: true,
        reviewRequired: false,
      };
    }

    const { payload, unclassified } = buildProviderTransactionPayload(
      context,
      transaction,
      mappedFinance,
    );

    const { error: updateError } = await context.supabase
      .from("finance_transactions")
      .update(payload)
      .eq("id", existingMapping.finance_transaction_id)
      .eq("user_id", context.userId)
      .eq("source", "plaid");

    if (updateError) {
      throw updateError;
    }

    const { error: mappingError } = await context.supabase
      .from("plaid_finance_transaction_mappings")
      .update({
        provider_pending_transaction_id: transaction.pending_transaction_id,
        removed_at: null,
        provider_observed_at: context.syncTimestamp,
      })
      .eq("id", existingMapping.id)
      .eq("user_id", context.userId);

    if (mappingError) {
      throw mappingError;
    }

    return {
      added: false,
      modified: true,
      unclassified,
      matchedExisting: false,
      reviewRequired: false,
    };
  }

  if (transaction.pending) {
    const { payload, unclassified } = buildProviderTransactionPayload(
      context,
      transaction,
      null,
    );

    await createPlaidFinanceTransactionAtomically(
      context,
      financeAccountMapping.finance_account_id,
      transaction,
      payload,
    );

    return {
      added: mode === "added",
      modified: mode === "modified",
      unclassified,
      matchedExisting: false,
      reviewRequired: false,
    };
  }

  const matchInput = buildPostedMatchInput(context, transaction);
  const matchResult = await invokePostedTransactionMatcher(
    context,
    financeAccountMapping.finance_account_id,
    matchInput,
  );

  if (matchResult.outcome === "matched_existing") {
    return {
      added: false,
      modified: false,
      unclassified: false,
      matchedExisting: true,
      reviewRequired: false,
    };
  }

  if (matchResult.outcome === "review_required") {
    return {
      added: false,
      modified: false,
      unclassified: false,
      matchedExisting: false,
      reviewRequired: true,
    };
  }

  const { payload, unclassified } = buildProviderTransactionPayload(
    context,
    transaction,
    null,
  );

  await createPlaidFinanceTransactionAtomically(
    context,
    financeAccountMapping.finance_account_id,
    transaction,
    payload,
  );

  return {
    added: mode === "added" || !existingMapping,
    modified: Boolean(existingMapping),
    unclassified,
    matchedExisting: false,
    reviewRequired: false,
  };
}

async function markReviewItemRemoved(
  context: SyncContext,
  providerTransactionId: string,
): Promise<boolean> {
  const { data: reviewItem, error } = await context.supabase
    .from("plaid_transaction_match_review_items")
    .select("id, review_status")
    .eq("plaid_connection_id", context.connection.id)
    .eq("plaid_transaction_id", providerTransactionId)
    .eq("user_id", context.userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!reviewItem || reviewItem.review_status !== "pending") {
    return false;
  }

  const { error: updateError } = await context.supabase
    .from("plaid_transaction_match_review_items")
    .update({
      review_status: "removed",
      resolved_at: context.syncTimestamp,
    })
    .eq("id", reviewItem.id)
    .eq("user_id", context.userId)
    .eq("review_status", "pending");

  if (updateError) {
    throw updateError;
  }

  return true;
}

async function removePlaidTransaction(
  context: SyncContext,
  removed: RemovedTransaction,
): Promise<RemoveResult> {
  const existingMapping = await findTransactionMapping(context, removed.transaction_id);

  if (!existingMapping || existingMapping.removed_at) {
    await markReviewItemRemoved(context, removed.transaction_id);
    return { voided: false, rocketMoneyMappingRemoved: false };
  }

  const mappedFinance = await loadMappedFinanceTransaction(
    context,
    existingMapping.finance_transaction_id,
  );

  if (!mappedFinance) {
    throw new PlaidSafeError("sync_failed");
  }

  const removalDecision = resolvePlaidMappingRemovalDecision(mappedFinance.source);

  if (removalDecision.action === "fail_closed") {
    throw new PlaidSafeError("sync_failed");
  }

  if (removalDecision.action === "remove_mapping_only") {
    const { error: mappingError } = await context.supabase
      .from("plaid_finance_transaction_mappings")
      .update({
        removed_at: context.syncTimestamp,
        provider_observed_at: context.syncTimestamp,
      })
      .eq("id", existingMapping.id)
      .eq("user_id", context.userId);

    if (mappingError) {
      throw mappingError;
    }

    return { voided: false, rocketMoneyMappingRemoved: true };
  }

  const { error: transactionError } = await context.supabase
    .from("finance_transactions")
    .update({ status: "void" })
    .eq("id", existingMapping.finance_transaction_id)
    .eq("user_id", context.userId)
    .eq("source", "plaid");

  if (transactionError) {
    throw transactionError;
  }

  const { error: mappingError } = await context.supabase
    .from("plaid_finance_transaction_mappings")
    .update({
      removed_at: context.syncTimestamp,
      provider_observed_at: context.syncTimestamp,
    })
    .eq("id", existingMapping.id)
    .eq("user_id", context.userId);

  if (mappingError) {
    throw mappingError;
  }

  return { voided: true, rocketMoneyMappingRemoved: false };
}

async function processTransactionsSyncPage(
  context: SyncContext,
  page: {
    added: Transaction[];
    modified: Transaction[];
    removed: RemovedTransaction[];
  },
  counts: SyncCounts,
): Promise<void> {
  for (const transaction of page.added) {
    const result = await upsertPlaidTransaction(context, transaction, "added");
    if (result.matchedExisting) {
      counts.transactionsMatchedExisting += 1;
    } else if (result.reviewRequired) {
      counts.transactionsReviewRequired += 1;
    } else if (result.added) {
      counts.transactionsAdded += 1;
    } else if (result.modified) {
      counts.transactionsModified += 1;
    }
    if (result.unclassified) {
      counts.unclassifiedCount += 1;
    }
  }

  for (const transaction of page.modified) {
    const result = await upsertPlaidTransaction(context, transaction, "modified");
    if (result.matchedExisting) {
      counts.transactionsMatchedExisting += 1;
    } else if (result.reviewRequired) {
      counts.transactionsReviewRequired += 1;
    } else if (result.modified) {
      counts.transactionsModified += 1;
    } else if (result.added) {
      counts.transactionsAdded += 1;
    }
    if (result.unclassified) {
      counts.unclassifiedCount += 1;
    }
  }

  for (const removed of page.removed) {
    const removeResult = await removePlaidTransaction(context, removed);
    if (removeResult.voided) {
      counts.transactionsRemoved += 1;
    }
    if (removeResult.rocketMoneyMappingRemoved) {
      counts.rocketMoneyMappingsRemoved += 1;
    }
  }
}

async function syncPlaidConnectionTransactions(
  context: SyncContext,
): Promise<SyncCounts> {
  const counts = emptySyncCounts();
  const startingCursor = context.connection.transactions_cursor;
  let mutationRestarts = 0;

  while (mutationRestarts <= MAX_MUTATION_RESTARTS) {
    let cursor: string | undefined = startingCursor ?? undefined;
    const loopCounts = emptySyncCounts();

    try {
      while (true) {
        const page = await fetchPlaidTransactionsSyncPage(context.accessToken, cursor);
        await processTransactionsSyncPage(context, page, loopCounts);

        cursor = page.nextCursor;

        if (!page.hasMore) {
          Object.assign(counts, loopCounts);

          const { error: cursorError } = await context.supabase
            .from("plaid_connections")
            .update({ transactions_cursor: page.nextCursor })
            .eq("id", context.connection.id)
            .eq("user_id", context.userId);

          if (cursorError) {
            throw cursorError;
          }

          return counts;
        }
      }
    } catch (error) {
      if (
        error instanceof PlaidSafeError &&
        error.code === "sync_mutation_during_pagination" &&
        mutationRestarts < MAX_MUTATION_RESTARTS
      ) {
        mutationRestarts += 1;
        continue;
      }

      throw error;
    }
  }

  throw new PlaidSafeError("sync_failed");
}

async function markSuccessfulSync(
  supabase: SupabaseClient,
  connection: PlaidConnectionRow,
  counts: SyncCounts,
  linkedAccountsCount: number,
): Promise<void> {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("plaid_connections")
    .update({
      status: "connected",
      last_successful_sync_at: now,
      last_error_code: null,
      last_sync_accounts_created: counts.accountsCreated,
      last_sync_accounts_updated: counts.accountsUpdated,
      last_sync_transactions_added: counts.transactionsAdded,
      last_sync_transactions_modified: counts.transactionsModified,
      last_sync_transactions_removed: counts.transactionsRemoved,
      last_sync_unclassified_count: counts.unclassifiedCount,
      linked_accounts_count: linkedAccountsCount,
      sync_in_progress_at: null,
    })
    .eq("id", connection.id)
    .eq("user_id", connection.user_id);

  if (error) {
    throw error;
  }
}

async function markFailedSync(
  supabase: SupabaseClient,
  connection: PlaidConnectionRow,
  errorCode: PlaidSafeErrorCode,
): Promise<PlaidConnectionSyncResult["status"]> {
  const reconnectRequired =
    errorCode === "reconnect_required" || errorCode === "decryption_failed";

  const status = reconnectRequired ? "reconnect_required" : "error";

  await markPlaidConnectionErrorById(
    supabase,
    connection.user_id,
    connection.id,
    errorCode,
    status,
  );

  await supabase
    .from("plaid_connections")
    .update({ sync_in_progress_at: null })
    .eq("id", connection.id)
    .eq("user_id", connection.user_id);

  activeConnectionLocks.delete(connection.id);

  return status;
}

export async function syncPlaidConnection(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string,
): Promise<PlaidConnectionSyncResult> {
  const connection = await loadRuntimePlaidConnectionRowById(supabase, userId, connectionId);

  if (!connection) {
    throw new PlaidSafeError("item_not_found");
  }

  if (!hasUsablePlaidCredentials(connection)) {
    return toSyncResult(connectionId, "reconnect_required", emptySyncCounts(), "reconnect_required");
  }

  const lockAcquired = await acquireSyncLock(supabase, connection);
  if (!lockAcquired) {
    throw new PlaidSafeError("sync_in_progress");
  }

  const foundation = await ensureFinanceFoundation(supabase, userId);
  if (!foundation.success) {
    await releaseSyncLock(supabase, connectionId, userId);
    throw new PlaidSafeError("sync_failed");
  }

  const accessToken = decryptStoredAccessToken(connection);
  if (!accessToken) {
    await releaseSyncLock(supabase, connectionId, userId);
    return toSyncResult(connectionId, "reconnect_required", emptySyncCounts(), "decryption_failed");
  }

  const syncTimestamp = new Date().toISOString();
  const syncDate = syncTimestamp.slice(0, 10);

  const context: SyncContext = {
    supabase,
    userId,
    connection,
    accessToken,
    syncTimestamp,
    syncDate,
    institutionName: connection.institution_name,
    categorySlugToId: await loadCategorySlugMap(supabase, userId),
    accountMappings: await loadAccountMappings(supabase, userId, connectionId),
    investmentAccountIds: new Set(),
  };

  context.investmentAccountIds = await loadInvestmentAccountProviderIds(
    supabase,
    userId,
    context.accountMappings,
  );

  const counts = emptySyncCounts();

  try {
    const plaidAccounts = await fetchPlaidAccounts(accessToken);
    const accountCounts = await syncPlaidConnectionAccounts(context, plaidAccounts);
    Object.assign(counts, accountCounts);

    context.investmentAccountIds = await loadInvestmentAccountProviderIds(
      supabase,
      userId,
      context.accountMappings,
    );

    const transactionCounts = await syncPlaidConnectionTransactions(context);
    counts.transactionsAdded = transactionCounts.transactionsAdded;
    counts.transactionsModified = transactionCounts.transactionsModified;
    counts.transactionsRemoved = transactionCounts.transactionsRemoved;
    counts.transactionsMatchedExisting = transactionCounts.transactionsMatchedExisting;
    counts.transactionsReviewRequired = transactionCounts.transactionsReviewRequired;
    counts.rocketMoneyMappingsRemoved = transactionCounts.rocketMoneyMappingsRemoved;
    counts.unclassifiedCount = transactionCounts.unclassifiedCount;

    await markSuccessfulSync(
      supabase,
      connection,
      counts,
      context.accountMappings.size,
    );
    activeConnectionLocks.delete(connectionId);

    return toSyncResult(connectionId, "success", counts);
  } catch (error) {
    const errorCode =
      error instanceof PlaidSafeError ? error.code : ("sync_failed" satisfies PlaidSafeErrorCode);
    const status = await markFailedSync(supabase, connection, errorCode);
    return toSyncResult(connectionId, status, emptySyncCounts(), errorCode);
  }
}

export async function loadEligiblePlaidConnectionIdsForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("plaid_connections")
    .select("id")
    .eq("user_id", userId)
    .eq("environment", getPlaidEnvironment())
    .eq("status", "connected")
    .not("encrypted_access_token", "is", null)
    .order("connected_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => row.id);
}

export async function syncAllPlaidConnectionsForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<PlaidConnectionSyncResult[]> {
  const connectionIds = await loadEligiblePlaidConnectionIdsForUser(
    supabase,
    userId,
  );

  const results: PlaidConnectionSyncResult[] = [];

  for (const connectionId of connectionIds) {
    try {
      results.push(await syncPlaidConnection(supabase, userId, connectionId));
    } catch (syncError) {
      const errorCode =
        syncError instanceof PlaidSafeError
          ? syncError.code
          : ("sync_failed" satisfies PlaidSafeErrorCode);

      if (errorCode === "sync_in_progress") {
        results.push(toSyncResult(connectionId, "error", emptySyncCounts(), errorCode));
        continue;
      }

      results.push(toSyncResult(connectionId, "error", emptySyncCounts(), errorCode));
    }
  }

  return results;
}

export async function processPlaidTransactionsSyncPageForTests(
  supabase: SupabaseClient,
  userId: string,
  connection: PlaidConnectionRow,
  page: {
    added: Transaction[];
    modified: Transaction[];
    removed: RemovedTransaction[];
  },
  options: {
    accountMappings: Map<string, AccountMappingRow>;
    categorySlugToId?: Map<string, string>;
    syncTimestamp?: string;
  },
): Promise<PlaidSyncCounts> {
  const syncTimestamp = options.syncTimestamp ?? new Date().toISOString();
  const context: SyncContext = {
    supabase,
    userId,
    connection,
    accessToken: "test-token",
    syncTimestamp,
    syncDate: syncTimestamp.slice(0, 10),
    institutionName: connection.institution_name,
    categorySlugToId: options.categorySlugToId ?? new Map(),
    accountMappings: options.accountMappings,
    investmentAccountIds: new Set(),
  };

  const counts = emptySyncCounts();
  await processTransactionsSyncPage(context, page, counts);
  return counts;
}

export async function persistPlaidTransactionsCursorForTests(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string,
  cursor: string,
): Promise<void> {
  const { error } = await supabase
    .from("plaid_connections")
    .update({ transactions_cursor: cursor })
    .eq("id", connectionId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}
