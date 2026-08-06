import "server-only";

import { resolveTimeZone } from "@/lib/jarvis/dashboard/command-center-utils";
import type {
  FinancePersonalOrBusiness,
  FinanceTransactionType,
} from "@/lib/jarvis/finance/finance-types";
import {
  buildAccountDisplayLabel,
  buildMerchantDisplayLabel,
  buildRecurringStatusLabel,
  buildResolutionOutcomeLabel,
  buildReviewPauseReason,
  formatMatchReasonLabels,
  formatPersonalOrBusinessLabel,
  formatPlaidReviewAmount,
  formatPlaidReviewDate,
  formatPlaidReviewDateTime,
  formatTransactionTypeLabel,
} from "@/lib/jarvis/integrations/plaid/plaid-transaction-match-review-display";
import type {
  PlaidReviewCandidateView,
  PlaidReviewPendingItemView,
  PlaidReviewResolvedItemView,
  PlaidTransactionMatchReviewData,
} from "@/lib/jarvis/integrations/plaid/plaid-transaction-match-review-types";
import type { PlaidMatchReasonCode } from "@/lib/jarvis/integrations/plaid/plaid-transaction-match-types";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_PENDING_ITEMS = 50;
const MAX_RECENT_RESOLVED_ITEMS = 20;

const REVIEW_ITEM_COLUMNS =
  "id, user_id, plaid_connection_id, finance_account_id, transaction_date, posted_date, amount, merchant, description, transaction_type, review_status, resolved_at, created_at";

const CANDIDATE_COLUMNS =
  "id, review_item_id, finance_transaction_id, match_score, match_reasons, created_at";

const FINANCE_TRANSACTION_COLUMNS =
  "id, transaction_date, posted_date, amount, merchant, description, transaction_type, personal_or_business, recurring_item_id";

const ACCOUNT_COLUMNS = "id, name, institution_name, last_four";

const CONNECTION_COLUMNS = "id, institution_name";

const RECURRING_ITEM_COLUMNS = "id, name, frequency";

export type {
  PlaidReviewCandidateView,
  PlaidReviewPendingItemView,
  PlaidReviewResolvedItemView,
  PlaidTransactionMatchReviewData,
} from "@/lib/jarvis/integrations/plaid/plaid-transaction-match-review-types";

export {
  getPlaidReviewPagePresentation,
  reviewViewContainsPrivateIdentifiers,
} from "@/lib/jarvis/integrations/plaid/plaid-transaction-match-review-types";

export type LoadPlaidTransactionMatchReviewResult =
  | { success: true; data: PlaidTransactionMatchReviewData }
  | { success: false; error: string };

type ReviewItemRow = {
  id: string;
  user_id: string;
  plaid_connection_id: string;
  finance_account_id: string;
  transaction_date: string;
  posted_date: string;
  amount: unknown;
  merchant: string | null;
  description: string | null;
  transaction_type: FinanceTransactionType;
  review_status: "pending" | "matched_existing" | "imported_new" | "removed";
  resolved_at: string | null;
  created_at: string;
};

type CandidateRow = {
  id: string;
  review_item_id: string;
  finance_transaction_id: string;
  match_score: number;
  match_reasons: PlaidMatchReasonCode[];
  created_at: string;
};

type FinanceTransactionRow = {
  id: string;
  transaction_date: string;
  posted_date: string | null;
  amount: unknown;
  merchant: string | null;
  description: string | null;
  transaction_type: FinanceTransactionType;
  personal_or_business: FinancePersonalOrBusiness;
  recurring_item_id: string | null;
};

type AccountRow = {
  id: string;
  name: string;
  institution_name: string | null;
  last_four: string | null;
};

type ConnectionRow = {
  id: string;
  institution_name: string | null;
};

type RecurringItemRow = {
  id: string;
  name: string;
  frequency: string;
};

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function isMatchReasonCode(value: string): value is PlaidMatchReasonCode {
  return (
    value === "amount" ||
    value === "date" ||
    value === "posted_date" ||
    value === "merchant" ||
    value === "description" ||
    value === "transaction_type" ||
    value === "account"
  );
}

function normalizeMatchReasons(values: string[] | null | undefined): PlaidMatchReasonCode[] {
  if (!values) {
    return [];
  }

  return values.filter(isMatchReasonCode);
}

function buildAccountLabel(
  account: AccountRow | undefined,
  connection: ConnectionRow | undefined,
): string | null {
  if (!account) {
    return connection?.institution_name ?? null;
  }

  return buildAccountDisplayLabel({
    institutionName: connection?.institution_name ?? account.institution_name,
    accountName: account.name,
    lastFour: account.last_four,
  });
}

function mapCandidateView(
  candidate: CandidateRow,
  transaction: FinanceTransactionRow | undefined,
  recurringItem: RecurringItemRow | undefined,
  timeZone: string,
): PlaidReviewCandidateView | null {
  if (!transaction) {
    return null;
  }

  const amount = toNumber(transaction.amount);

  return {
    candidateKey: candidate.id,
    merchantLabel: buildMerchantDisplayLabel(
      transaction.merchant,
      transaction.description,
    ),
    transactionDate: formatPlaidReviewDate(transaction.transaction_date, timeZone),
    postedDate: transaction.posted_date
      ? formatPlaidReviewDate(transaction.posted_date, timeZone)
      : null,
    formattedAmount: formatPlaidReviewAmount(amount, transaction.transaction_type),
    transactionTypeLabel: formatTransactionTypeLabel(transaction.transaction_type),
    personalOrBusinessLabel: formatPersonalOrBusinessLabel(
      transaction.personal_or_business,
    ),
    recurringStatusLabel: buildRecurringStatusLabel({
      recurringItemName: recurringItem?.name ?? null,
      recurringFrequency: recurringItem?.frequency ?? null,
    }),
    matchScore: candidate.match_score,
    matchReasonLabels: formatMatchReasonLabels(
      normalizeMatchReasons(candidate.match_reasons),
    ),
  };
}

export async function loadPlaidTransactionMatchReviewPendingCount(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("plaid_transaction_match_review_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("review_status", "pending");

  if (error) {
    return 0;
  }

  return count ?? 0;
}

export async function loadPlaidTransactionMatchReview(
  supabase: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<LoadPlaidTransactionMatchReviewResult> {
  const timeZone = resolveTimeZone(null);

  const [pendingResult, recentResult, pendingCount] = await Promise.all([
    supabase
      .from("plaid_transaction_match_review_items")
      .select(REVIEW_ITEM_COLUMNS)
      .eq("user_id", userId)
      .eq("review_status", "pending")
      .order("created_at", { ascending: false })
      .limit(MAX_PENDING_ITEMS),
    supabase
      .from("plaid_transaction_match_review_items")
      .select(REVIEW_ITEM_COLUMNS)
      .eq("user_id", userId)
      .in("review_status", ["matched_existing", "imported_new"])
      .order("resolved_at", { ascending: false })
      .limit(MAX_RECENT_RESOLVED_ITEMS),
    loadPlaidTransactionMatchReviewPendingCount(supabase, userId),
  ]);

  if (pendingResult.error || recentResult.error) {
    return {
      success: false,
      error: "Could not load transaction match review queue.",
    };
  }

  const pendingRows = (pendingResult.data ?? []) as ReviewItemRow[];
  const recentRows = (recentResult.data ?? []) as ReviewItemRow[];
  const allReviewIds = [...pendingRows, ...recentRows].map((row) => row.id);

  const accountIds = [
    ...new Set(
      [...pendingRows, ...recentRows].map((row) => row.finance_account_id),
    ),
  ];
  const connectionIds = [
    ...new Set(
      [...pendingRows, ...recentRows].map((row) => row.plaid_connection_id),
    ),
  ];

  const [candidatesResult, accountsResult, connectionsResult] = await Promise.all([
    allReviewIds.length > 0
      ? supabase
          .from("plaid_transaction_match_review_candidates")
          .select(CANDIDATE_COLUMNS)
          .eq("user_id", userId)
          .in("review_item_id", allReviewIds)
          .order("match_score", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    accountIds.length > 0
      ? supabase
          .from("finance_accounts")
          .select(ACCOUNT_COLUMNS)
          .eq("user_id", userId)
          .in("id", accountIds)
      : Promise.resolve({ data: [], error: null }),
    connectionIds.length > 0
      ? supabase
          .from("plaid_connections")
          .select(CONNECTION_COLUMNS)
          .eq("user_id", userId)
          .in("id", connectionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (candidatesResult.error || accountsResult.error || connectionsResult.error) {
    return {
      success: false,
      error: "Could not load transaction match review queue.",
    };
  }

  const candidateRows = (candidatesResult.data ?? []) as CandidateRow[];
  const financeTransactionIds = [
    ...new Set(candidateRows.map((row) => row.finance_transaction_id)),
  ];

  const transactionsResult =
    financeTransactionIds.length > 0
      ? await supabase
          .from("finance_transactions")
          .select(FINANCE_TRANSACTION_COLUMNS)
          .eq("user_id", userId)
          .in("id", financeTransactionIds)
      : { data: [], error: null };

  if (transactionsResult.error) {
    return {
      success: false,
      error: "Could not load transaction match review queue.",
    };
  }

  const transactionRows = (transactionsResult.data ?? []) as FinanceTransactionRow[];
  const recurringItemIds = [
    ...new Set(
      transactionRows
        .map((row) => row.recurring_item_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const recurringResult =
    recurringItemIds.length > 0
      ? await supabase
          .from("finance_recurring_items")
          .select(RECURRING_ITEM_COLUMNS)
          .eq("user_id", userId)
          .in("id", recurringItemIds)
      : { data: [], error: null };

  if (recurringResult.error) {
    return {
      success: false,
      error: "Could not load transaction match review queue.",
    };
  }

  const accountById = new Map(
    ((accountsResult.data ?? []) as AccountRow[]).map((row) => [row.id, row]),
  );
  const connectionById = new Map(
    ((connectionsResult.data ?? []) as ConnectionRow[]).map((row) => [row.id, row]),
  );
  const transactionById = new Map(
    transactionRows.map((row) => [row.id, row]),
  );
  const recurringById = new Map(
    ((recurringResult.data ?? []) as RecurringItemRow[]).map((row) => [row.id, row]),
  );
  const candidatesByReviewId = new Map<string, CandidateRow[]>();

  for (const candidate of candidateRows) {
    const existing = candidatesByReviewId.get(candidate.review_item_id) ?? [];
    existing.push(candidate);
    candidatesByReviewId.set(candidate.review_item_id, existing);
  }

  const pendingItems: PlaidReviewPendingItemView[] = pendingRows.map((row) => {
    const amount = toNumber(row.amount);
    const candidates = (candidatesByReviewId.get(row.id) ?? [])
      .map((candidate) =>
        mapCandidateView(
          candidate,
          transactionById.get(candidate.finance_transaction_id),
          candidate.finance_transaction_id
            ? recurringById.get(
                transactionById.get(candidate.finance_transaction_id)
                  ?.recurring_item_id ?? "",
              )
            : undefined,
          timeZone,
        ),
      )
      .filter((candidate): candidate is PlaidReviewCandidateView => candidate !== null);

    return {
      reviewKey: row.id,
      merchantLabel: buildMerchantDisplayLabel(row.merchant, row.description),
      transactionDate: formatPlaidReviewDate(row.transaction_date, timeZone),
      postedDate: formatPlaidReviewDate(row.posted_date, timeZone),
      formattedAmount: formatPlaidReviewAmount(amount, row.transaction_type),
      transactionTypeLabel: formatTransactionTypeLabel(row.transaction_type),
      accountDisplayLabel: buildAccountLabel(
        accountById.get(row.finance_account_id),
        connectionById.get(row.plaid_connection_id),
      ),
      candidateCount: candidates.length,
      pauseReason: buildReviewPauseReason(candidates.length),
      candidates,
      createdAt: row.created_at,
    };
  });

  const recentResolvedItems: PlaidReviewResolvedItemView[] = recentRows.map((row) => {
    const amount = toNumber(row.amount);

    return {
      reviewKey: row.id,
      merchantLabel: buildMerchantDisplayLabel(row.merchant, row.description),
      transactionDate: formatPlaidReviewDate(row.transaction_date, timeZone),
      postedDate: formatPlaidReviewDate(row.posted_date, timeZone),
      formattedAmount: formatPlaidReviewAmount(amount, row.transaction_type),
      transactionTypeLabel: formatTransactionTypeLabel(row.transaction_type),
      accountDisplayLabel: buildAccountLabel(
        accountById.get(row.finance_account_id),
        connectionById.get(row.plaid_connection_id),
      ),
      resolutionOutcomeLabel: buildResolutionOutcomeLabel(
        row.review_status === "matched_existing"
          ? "matched_existing"
          : "imported_new",
      ),
      resolvedAtLabel: row.resolved_at
        ? formatPlaidReviewDateTime(row.resolved_at, timeZone)
        : "Recently resolved",
    };
  });

  return {
    success: true,
    data: {
      timezone: timeZone,
      pendingCount,
      pendingItems,
      recentResolvedItems,
    },
  };
}

