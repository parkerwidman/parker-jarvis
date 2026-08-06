import "server-only";

import { addCalendarDays } from "@/lib/jarvis/integrations/plaid/plaid-transaction-match-normalization";
import {
  hasAmbiguousCandidates,
  scoreEligibleCandidates,
  selectAutoMatchCandidate,
} from "@/lib/jarvis/integrations/plaid/plaid-transaction-match-scoring";
import type {
  PlaidPostedTransactionMatchInput,
  PlaidTransactionMatchResult,
  RocketMoneyCandidateRow,
} from "@/lib/jarvis/integrations/plaid/plaid-transaction-match-types";
import type { SupabaseClient } from "@supabase/supabase-js";

type ExistingMappingRow = {
  id: string;
  finance_transaction_id: string;
  removed_at: string | null;
};

type CandidateFinanceRow = RocketMoneyCandidateRow;

type ActiveMappingRow = {
  finance_transaction_id: string;
  provider_transaction_id: string;
  removed_at: string | null;
};

type MatchCommitRpcResult = {
  success: boolean;
  code?: string;
  finance_transaction_id?: string;
};

function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === "23505";
}

function throwMatchError(code: string): never {
  throw new Error(code);
}

async function assertUserOwnsConnectionAndAccount(
  supabase: SupabaseClient,
  userId: string,
  plaidConnectionId: string,
  financeAccountId: string,
): Promise<void> {
  const { data: connection, error: connectionError } = await supabase
    .from("plaid_connections")
    .select("id")
    .eq("id", plaidConnectionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (connectionError) {
    throwMatchError("match_lookup_failed");
  }

  if (!connection) {
    throwMatchError("plaid_connection_not_found");
  }

  const { data: account, error: accountError } = await supabase
    .from("finance_accounts")
    .select("id")
    .eq("id", financeAccountId)
    .eq("user_id", userId)
    .maybeSingle();

  if (accountError) {
    throwMatchError("match_lookup_failed");
  }

  if (!account) {
    throwMatchError("finance_account_not_found");
  }

  const { data: accountMapping, error: mappingError } = await supabase
    .from("plaid_finance_account_mappings")
    .select("id")
    .eq("user_id", userId)
    .eq("plaid_connection_id", plaidConnectionId)
    .eq("finance_account_id", financeAccountId)
    .maybeSingle();

  if (mappingError) {
    throwMatchError("match_lookup_failed");
  }

  if (!accountMapping) {
    throwMatchError("finance_account_not_mapped");
  }
}

async function loadExistingProviderMapping(
  supabase: SupabaseClient,
  userId: string,
  plaidConnectionId: string,
  providerTransactionId: string,
): Promise<ExistingMappingRow | null> {
  const { data, error } = await supabase
    .from("plaid_finance_transaction_mappings")
    .select("id, finance_transaction_id, removed_at")
    .eq("user_id", userId)
    .eq("plaid_connection_id", plaidConnectionId)
    .eq("provider_transaction_id", providerTransactionId)
    .maybeSingle();

  if (error) {
    throwMatchError("match_lookup_failed");
  }

  return (data as ExistingMappingRow | null) ?? null;
}

async function loadCandidateRows(
  supabase: SupabaseClient,
  userId: string,
  postedDate: string,
): Promise<CandidateFinanceRow[]> {
  const minDate = addCalendarDays(postedDate, -3);
  const maxDate = addCalendarDays(postedDate, 3);

  if (!minDate || !maxDate) {
    return [];
  }

  const { data, error } = await supabase
    .from("finance_transactions")
    .select(
      "id, account_id, transaction_date, posted_date, amount, merchant, description, transaction_type, status, source",
    )
    .eq("user_id", userId)
    .eq("source", "rocket_money_csv")
    .eq("status", "posted")
    .or(
      `and(transaction_date.gte.${minDate},transaction_date.lte.${maxDate}),and(posted_date.gte.${minDate},posted_date.lte.${maxDate})`,
    );

  if (error) {
    throwMatchError("match_lookup_failed");
  }

  return (data as CandidateFinanceRow[] | null) ?? [];
}

async function loadActiveFinanceTransactionMappings(
  supabase: SupabaseClient,
  userId: string,
  financeTransactionIds: readonly string[],
): Promise<Map<string, string>> {
  if (financeTransactionIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("plaid_finance_transaction_mappings")
    .select("finance_transaction_id, provider_transaction_id, removed_at")
    .eq("user_id", userId)
    .in("finance_transaction_id", [...financeTransactionIds]);

  if (error) {
    throwMatchError("match_lookup_failed");
  }

  const mappedProviderTransactionIds = new Map<string, string>();
  for (const row of (data as ActiveMappingRow[] | null) ?? []) {
    if (row.removed_at) {
      continue;
    }

    mappedProviderTransactionIds.set(row.finance_transaction_id, row.provider_transaction_id);
  }

  return mappedProviderTransactionIds;
}

async function commitConfirmedMatch(
  supabase: SupabaseClient,
  userId: string,
  plaidConnectionId: string,
  financeAccountId: string,
  input: PlaidPostedTransactionMatchInput,
  financeTransactionId: string,
  observedAt: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("commit_plaid_rocket_money_transaction_match", {
    p_user_id: userId,
    p_plaid_connection_id: plaidConnectionId,
    p_finance_account_id: financeAccountId,
    p_finance_transaction_id: financeTransactionId,
    p_provider_transaction_id: input.providerTransactionId,
    p_provider_pending_transaction_id: input.pendingProviderTransactionId ?? null,
    p_posted_date: input.postedDate,
    p_amount: input.amount,
    p_transaction_type: input.transactionType,
    p_observed_at: observedAt,
  });

  if (error) {
    throwMatchError("match_commit_failed");
  }

  const result = data as MatchCommitRpcResult | null;
  if (!result?.success || !result.finance_transaction_id) {
    throwMatchError(result?.code ?? "match_commit_failed");
  }

  return result.finance_transaction_id;
}

async function stageReviewRequiredMatch(
  supabase: SupabaseClient,
  userId: string,
  plaidConnectionId: string,
  financeAccountId: string,
  input: PlaidPostedTransactionMatchInput,
  scoredCandidates: ReturnType<typeof scoreEligibleCandidates>,
): Promise<{ reviewItemId: string; candidateCount: number }> {
  const reviewPayload = {
    user_id: userId,
    plaid_connection_id: plaidConnectionId,
    finance_account_id: financeAccountId,
    plaid_transaction_id: input.providerTransactionId,
    pending_plaid_transaction_id: input.pendingProviderTransactionId ?? null,
    transaction_date: input.transactionDate,
    posted_date: input.postedDate,
    amount: input.amount,
    merchant: input.merchant,
    description: input.description,
    transaction_type: input.transactionType,
    review_status: "pending",
    resolved_finance_transaction_id: null,
    resolved_at: null,
  };

  const { data: existingReviewItem, error: existingReviewError } = await supabase
    .from("plaid_transaction_match_review_items")
    .select("id, review_status")
    .eq("plaid_connection_id", plaidConnectionId)
    .eq("plaid_transaction_id", input.providerTransactionId)
    .maybeSingle();

  if (existingReviewError) {
    throwMatchError("match_review_failed");
  }

  let reviewItemId: string;

  if (existingReviewItem) {
    if (existingReviewItem.review_status !== "pending") {
      throwMatchError("review_item_not_pending");
    }

    const { data: updatedReviewItem, error: updateReviewError } = await supabase
      .from("plaid_transaction_match_review_items")
      .update(reviewPayload)
      .eq("id", existingReviewItem.id)
      .eq("user_id", userId)
      .eq("review_status", "pending")
      .select("id")
      .single();

    if (updateReviewError || !updatedReviewItem) {
      throwMatchError("match_review_failed");
    }

    reviewItemId = updatedReviewItem.id;
  } else {
    const { data: insertedReviewItem, error: insertReviewError } = await supabase
      .from("plaid_transaction_match_review_items")
      .insert(reviewPayload)
      .select("id")
      .single();

    if (insertReviewError) {
      if (isUniqueViolation(insertReviewError)) {
        const { data: racedReviewItem, error: racedReviewError } = await supabase
          .from("plaid_transaction_match_review_items")
          .select("id, review_status")
          .eq("plaid_connection_id", plaidConnectionId)
          .eq("plaid_transaction_id", input.providerTransactionId)
          .maybeSingle();

        if (racedReviewError || !racedReviewItem) {
          throwMatchError("match_review_failed");
        }

        if (racedReviewItem.review_status !== "pending") {
          throwMatchError("review_item_not_pending");
        }

        reviewItemId = racedReviewItem.id;
      } else {
        throwMatchError("match_review_failed");
      }
    } else if (!insertedReviewItem) {
      throwMatchError("match_review_failed");
    } else {
      reviewItemId = insertedReviewItem.id;
    }
  }

  const { error: deleteCandidatesError } = await supabase
    .from("plaid_transaction_match_review_candidates")
    .delete()
    .eq("review_item_id", reviewItemId)
    .eq("user_id", userId);

  if (deleteCandidatesError) {
    throwMatchError("match_review_failed");
  }

  if (scoredCandidates.length > 0) {
    const candidateRows = scoredCandidates.map((scoredCandidate) => ({
      user_id: userId,
      review_item_id: reviewItemId,
      finance_transaction_id: scoredCandidate.candidate.id,
      match_score: scoredCandidate.score,
      match_reasons: scoredCandidate.reasons,
    }));

    const { error: insertCandidatesError } = await supabase
      .from("plaid_transaction_match_review_candidates")
      .insert(candidateRows);

    if (insertCandidatesError) {
      throwMatchError("match_review_failed");
    }
  }

  return {
    reviewItemId,
    candidateCount: scoredCandidates.length,
  };
}

export async function matchPlaidPostedTransaction(
  supabase: SupabaseClient,
  userId: string,
  plaidConnectionId: string,
  financeAccountId: string,
  input: PlaidPostedTransactionMatchInput,
  options?: {
    observedAt?: string;
  },
): Promise<PlaidTransactionMatchResult> {
  if (input.status !== "posted" || !input.postedDate) {
    return { outcome: "no_match" };
  }

  const postedDate = input.postedDate;

  await assertUserOwnsConnectionAndAccount(
    supabase,
    userId,
    plaidConnectionId,
    financeAccountId,
  );

  const existingMapping = await loadExistingProviderMapping(
    supabase,
    userId,
    plaidConnectionId,
    input.providerTransactionId,
  );

  if (existingMapping && !existingMapping.removed_at) {
    return {
      outcome: "matched_existing",
      financeTransactionId: existingMapping.finance_transaction_id,
    };
  }

  const candidateRows = await loadCandidateRows(supabase, userId, postedDate);
  const mappedProviderTransactionIds = await loadActiveFinanceTransactionMappings(
    supabase,
    userId,
    candidateRows.map((candidate) => candidate.id),
  );

  const scoredCandidates = scoreEligibleCandidates(
    {
      ...input,
      status: "posted",
      postedDate,
    },
    candidateRows,
    financeAccountId,
    mappedProviderTransactionIds,
  );

  if (scoredCandidates.length === 0) {
    return { outcome: "no_match" };
  }

  const autoMatchCandidate = selectAutoMatchCandidate(scoredCandidates);
  const ambiguous = hasAmbiguousCandidates(scoredCandidates);

  if (!autoMatchCandidate || ambiguous) {
    const staged = await stageReviewRequiredMatch(
      supabase,
      userId,
      plaidConnectionId,
      financeAccountId,
      input,
      scoredCandidates,
    );

    return {
      outcome: "review_required",
      reviewItemId: staged.reviewItemId,
      candidateCount: staged.candidateCount,
    };
  }

  const observedAt = options?.observedAt ?? new Date().toISOString();
  const financeTransactionId = await commitConfirmedMatch(
    supabase,
    userId,
    plaidConnectionId,
    financeAccountId,
    input,
    autoMatchCandidate.candidate.id,
    observedAt,
  );

  return {
    outcome: "matched_existing",
    financeTransactionId,
  };
}
