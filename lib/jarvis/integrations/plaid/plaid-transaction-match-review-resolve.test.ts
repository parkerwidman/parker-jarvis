import { beforeEach, describe, expect, it, vi } from "vitest";

import { mapPlaidReviewResolveErrorToUserMessage } from "@/lib/jarvis/integrations/plaid/plaid-transaction-match-review-resolve-service";
import { resolvePlaidTransactionMatchReviewItem } from "@/lib/jarvis/integrations/plaid/plaid-transaction-match-review-resolve-service";
import { calendarDayDistance } from "@/lib/jarvis/integrations/plaid/plaid-transaction-match-normalization";
import type { SupabaseClient } from "@supabase/supabase-js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "99999999-9999-4999-8999-999999999999";
const CONNECTION_ID = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";
const REVIEW_ITEM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_REVIEW_ITEM_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CANDIDATE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_CANDIDATE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const FINANCE_TX_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OTHER_FINANCE_TX_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const PROVIDER_TX_ID = "provider-txn-001";

type TableRow = Record<string, unknown> & { id?: string };

type MockStore = {
  plaid_connections: TableRow[];
  finance_accounts: TableRow[];
  plaid_finance_account_mappings: TableRow[];
  finance_transactions: TableRow[];
  plaid_finance_transaction_mappings: TableRow[];
  plaid_transaction_match_review_items: TableRow[];
  plaid_transaction_match_review_candidates: TableRow[];
  finance_business_expense_details: TableRow[];
  finance_import_batch_items: TableRow[];
};

type RpcResolveArgs = {
  p_user_id: string;
  p_review_item_id: string;
  p_action: "match_existing" | "import_new";
  p_candidate_id: string | null;
};

type RpcOptions = {
  failFinanceInsert?: boolean;
  failMappingInsert?: boolean;
  failReviewUpdate?: boolean;
};

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

function amountToCents(amount: number): number {
  return Math.round(Math.abs(amount) * 100);
}

function transactionTypesCompatible(
  plaidType: string,
  candidateType: string,
  plaidAmount: number,
  candidateAmount: number,
): boolean {
  if (plaidType !== candidateType) {
    return false;
  }

  switch (plaidType) {
    case "expense":
      return plaidAmount < 0 && candidateAmount < 0;
    case "refund":
    case "income":
      return plaidAmount > 0 && candidateAmount > 0;
    case "transfer":
    case "adjustment":
      return Math.sign(plaidAmount) === Math.sign(candidateAmount);
    default:
      return false;
  }
}

function executeResolveRpc(
  store: MockStore,
  args: RpcResolveArgs,
  options: RpcOptions = {},
): { success: boolean; code?: string } {
  const snapshot = structuredClone(store);

  const fail = (code: string): { success: boolean; code: string } => {
    Object.assign(store, structuredClone(snapshot));
    return { success: false, code };
  };

  const reviewItem = store.plaid_transaction_match_review_items.find(
    (row) => row.id === args.p_review_item_id,
  );

  if (!reviewItem || reviewItem.user_id !== args.p_user_id) {
    return fail("review_item_not_found");
  }

  if (reviewItem.review_status === "removed") {
    return fail("review_item_not_pending");
  }

  if (reviewItem.review_status === "matched_existing") {
    if (args.p_action === "match_existing") {
      const candidate = store.plaid_transaction_match_review_candidates.find(
        (row) => row.id === args.p_candidate_id,
      );
      if (
        candidate &&
        reviewItem.resolved_finance_transaction_id === candidate.finance_transaction_id
      ) {
        return { success: true, code: "matched_existing" };
      }
    }
    return fail("review_item_not_pending");
  }

  if (reviewItem.review_status === "imported_new") {
    if (args.p_action === "import_new") {
      return { success: true, code: "imported_new" };
    }
    return fail("review_item_not_pending");
  }

  if (reviewItem.review_status !== "pending") {
    return fail("review_item_not_pending");
  }

  const connection = store.plaid_connections.find(
    (row) => row.id === reviewItem.plaid_connection_id && row.user_id === args.p_user_id,
  );
  if (!connection) {
    return fail("plaid_connection_not_found");
  }

  const account = store.finance_accounts.find(
    (row) => row.id === reviewItem.finance_account_id && row.user_id === args.p_user_id,
  );
  if (!account || account.source !== "plaid") {
    return fail("finance_account_not_found");
  }

  const accountMapping = store.plaid_finance_account_mappings.find(
    (row) =>
      row.user_id === args.p_user_id &&
      row.plaid_connection_id === reviewItem.plaid_connection_id &&
      row.finance_account_id === reviewItem.finance_account_id,
  );
  if (!accountMapping) {
    return fail("finance_account_not_mapped");
  }

  if (args.p_action === "match_existing") {
    const candidate = store.plaid_transaction_match_review_candidates.find(
      (row) =>
        row.id === args.p_candidate_id &&
        row.review_item_id === reviewItem.id &&
        row.user_id === args.p_user_id,
    );
    if (!candidate) {
      return fail("candidate_not_found");
    }

    const candidateTx = store.finance_transactions.find(
      (row) => row.id === candidate.finance_transaction_id,
    );
    if (
      !candidateTx ||
      candidateTx.user_id !== args.p_user_id ||
      candidateTx.source !== "rocket_money_csv" ||
      candidateTx.status !== "posted"
    ) {
      return fail("match_candidate_unavailable");
    }

    if (
      candidateTx.account_id !== null &&
      candidateTx.account_id !== undefined &&
      candidateTx.account_id !== reviewItem.finance_account_id
    ) {
      return fail("match_candidate_ineligible");
    }

    if (
      amountToCents(Number(candidateTx.amount)) !==
      amountToCents(Number(reviewItem.amount))
    ) {
      return fail("match_candidate_ineligible");
    }

    if (
      !transactionTypesCompatible(
        String(reviewItem.transaction_type),
        String(candidateTx.transaction_type),
        Number(reviewItem.amount),
        Number(candidateTx.amount),
      )
    ) {
      return fail("match_candidate_ineligible");
    }

    const comparisonDate = String(candidateTx.posted_date ?? candidateTx.transaction_date);
    const dayDistance = calendarDayDistance(String(reviewItem.posted_date), comparisonDate);
    if (dayDistance === null || dayDistance > 3) {
      return fail("match_candidate_ineligible");
    }

    const conflictingMapping = store.plaid_finance_transaction_mappings.find(
      (row) =>
        row.user_id === args.p_user_id &&
        row.finance_transaction_id === candidate.finance_transaction_id &&
        !row.removed_at &&
        row.provider_transaction_id !== reviewItem.plaid_transaction_id,
    );
    if (conflictingMapping) {
      return fail("match_candidate_already_mapped");
    }

    const existingProviderMapping = store.plaid_finance_transaction_mappings.find(
      (row) =>
        row.user_id === args.p_user_id &&
        row.plaid_connection_id === reviewItem.plaid_connection_id &&
        row.provider_transaction_id === reviewItem.plaid_transaction_id,
    );

    if (
      existingProviderMapping &&
      !existingProviderMapping.removed_at &&
      existingProviderMapping.finance_transaction_id !== candidate.finance_transaction_id
    ) {
      return fail("provider_transaction_already_mapped");
    }

    if (candidateTx.account_id === null || candidateTx.account_id === undefined) {
      candidateTx.account_id = reviewItem.finance_account_id;
    }

    if (candidateTx.posted_date === null || candidateTx.posted_date === undefined) {
      candidateTx.posted_date = reviewItem.posted_date;
    }

    if (options.failFinanceInsert) {
      return fail("resolve_failed");
    }

    if (existingProviderMapping && !existingProviderMapping.removed_at) {
      // idempotent mapping
    } else if (options.failMappingInsert) {
      return fail("provider_transaction_already_mapped");
    } else if (existingProviderMapping) {
      Object.assign(existingProviderMapping, {
        finance_transaction_id: candidate.finance_transaction_id,
        removed_at: null,
      });
    } else {
      store.plaid_finance_transaction_mappings.push({
        id: createId("map"),
        user_id: args.p_user_id,
        plaid_connection_id: reviewItem.plaid_connection_id,
        finance_transaction_id: candidate.finance_transaction_id,
        provider_transaction_id: reviewItem.plaid_transaction_id,
        provider_pending_transaction_id: reviewItem.pending_plaid_transaction_id ?? null,
        provider_observed_at: "2026-08-06T12:00:00.000Z",
        removed_at: null,
      });
    }

    if (options.failReviewUpdate) {
      return fail("resolve_failed");
    }

    reviewItem.review_status = "matched_existing";
    reviewItem.resolved_finance_transaction_id = candidate.finance_transaction_id;
    reviewItem.resolved_at = "2026-08-06T12:00:00.000Z";

    return { success: true, code: "matched_existing" };
  }

  const existingProviderMapping = store.plaid_finance_transaction_mappings.find(
    (row) =>
      row.user_id === args.p_user_id &&
      row.plaid_connection_id === reviewItem.plaid_connection_id &&
      row.provider_transaction_id === reviewItem.plaid_transaction_id &&
      !row.removed_at,
  );

  if (existingProviderMapping) {
    const existingFinance = store.finance_transactions.find(
      (row) => row.id === existingProviderMapping.finance_transaction_id,
    );
    if (existingFinance?.source === "plaid") {
      reviewItem.review_status = "imported_new";
      reviewItem.resolved_finance_transaction_id = existingFinance.id;
      reviewItem.resolved_at = "2026-08-06T12:00:00.000Z";
      return { success: true, code: "imported_new" };
    }
    return fail("provider_transaction_already_mapped");
  }

  if (options.failFinanceInsert) {
    return fail("resolve_failed");
  }

  const financeTransactionId = createId("fin");
  store.finance_transactions.push({
    id: financeTransactionId,
    user_id: args.p_user_id,
    account_id: reviewItem.finance_account_id,
    transaction_date: reviewItem.transaction_date,
    posted_date: reviewItem.posted_date,
    amount: reviewItem.amount,
    merchant: reviewItem.merchant,
    description: reviewItem.description,
    transaction_type: reviewItem.transaction_type,
    status: "posted",
    source: "plaid",
    personal_or_business: "unclassified",
  });

  if (options.failMappingInsert) {
    store.finance_transactions.pop();
    return fail("resolve_failed");
  }

  store.plaid_finance_transaction_mappings.push({
    id: createId("map"),
    user_id: args.p_user_id,
    plaid_connection_id: reviewItem.plaid_connection_id,
    finance_transaction_id: financeTransactionId,
    provider_transaction_id: reviewItem.plaid_transaction_id,
    provider_pending_transaction_id: reviewItem.pending_plaid_transaction_id ?? null,
    provider_observed_at: "2026-08-06T12:00:00.000Z",
    removed_at: null,
  });

  if (options.failReviewUpdate) {
    return fail("resolve_failed");
  }

  reviewItem.review_status = "imported_new";
  reviewItem.resolved_finance_transaction_id = financeTransactionId;
  reviewItem.resolved_at = "2026-08-06T12:00:00.000Z";

  return { success: true, code: "imported_new" };
}

function createMockSupabase(
  store: MockStore,
  rpcOptions: RpcOptions = {},
): SupabaseClient {
  const rpc = vi.fn(async (name: string, args: RpcResolveArgs) => {
    if (name === "resolve_plaid_transaction_match_review_item") {
      return { data: executeResolveRpc(store, args, rpcOptions), error: null };
    }

    return { data: null, error: { message: "unknown_rpc" } };
  });

  return { rpc } as unknown as SupabaseClient;
}

function seedBaseOwnership(store: MockStore) {
  store.plaid_connections.push({
    id: CONNECTION_ID,
    user_id: USER_ID,
  });

  store.finance_accounts.push({
    id: ACCOUNT_ID,
    user_id: USER_ID,
    source: "plaid",
  });

  store.plaid_finance_account_mappings.push({
    id: createId("acct-map"),
    user_id: USER_ID,
    plaid_connection_id: CONNECTION_ID,
    finance_account_id: ACCOUNT_ID,
  });
}

function seedPendingReview(store: MockStore, overrides: Partial<TableRow> = {}) {
  store.plaid_transaction_match_review_items.push({
    id: REVIEW_ITEM_ID,
    user_id: USER_ID,
    plaid_connection_id: CONNECTION_ID,
    finance_account_id: ACCOUNT_ID,
    plaid_transaction_id: PROVIDER_TX_ID,
    pending_plaid_transaction_id: null,
    transaction_date: "2026-08-01",
    posted_date: "2026-08-01",
    amount: -42.5,
    merchant: "Coffee Shop",
    description: "Morning coffee",
    transaction_type: "expense",
    review_status: "pending",
    created_at: "2026-08-06T09:00:00.000Z",
    ...overrides,
  });
}

function seedCandidate(
  store: MockStore,
  overrides: Partial<TableRow> = {},
  transactionOverrides: Partial<TableRow> = {},
) {
  store.plaid_transaction_match_review_candidates.push({
    id: CANDIDATE_ID,
    user_id: USER_ID,
    review_item_id: REVIEW_ITEM_ID,
    finance_transaction_id: FINANCE_TX_ID,
    match_score: 72,
    match_reasons: ["amount", "merchant"],
    created_at: "2026-08-06T09:00:00.000Z",
    ...overrides,
  });

  store.finance_transactions.push({
    id: FINANCE_TX_ID,
    user_id: USER_ID,
    account_id: null,
    transaction_date: "2026-08-01",
    posted_date: null,
    amount: -42.5,
    merchant: "Coffee Shop RM",
    description: "Rocket import",
    transaction_type: "expense",
    status: "posted",
    source: "rocket_money_csv",
    personal_or_business: "business",
    notes: "Keep notes",
    recurring_item_id: "rec-1",
    deduplication_fingerprint: "fp-123",
    category_id: "cat-1",
    ...transactionOverrides,
  });

  store.finance_business_expense_details.push({
    id: createId("bed"),
    user_id: USER_ID,
    transaction_id: FINANCE_TX_ID,
    business_context: "melusi",
    funding_source: "owner_funded",
    cost_treatment: "monthly_recurring",
    classification_status: "user_confirmed",
  });

  store.finance_import_batch_items.push({
    id: createId("batch-item"),
    user_id: USER_ID,
    batch_id: "batch-1",
    transaction_id: FINANCE_TX_ID,
    source_row_index: 4,
    source_fingerprint: "row-fp",
  });
}

describe("resolvePlaidTransactionMatchReviewItem", () => {
  let store: MockStore;
  let supabase: SupabaseClient;

  beforeEach(() => {
    store = {
      plaid_connections: [],
      finance_accounts: [],
      plaid_finance_account_mappings: [],
      finance_transactions: [],
      plaid_finance_transaction_mappings: [],
      plaid_transaction_match_review_items: [],
      plaid_transaction_match_review_candidates: [],
      finance_business_expense_details: [],
      finance_import_batch_items: [],
    };
    seedBaseOwnership(store);
    seedPendingReview(store);
    seedCandidate(store);
    supabase = createMockSupabase(store);
  });

  it("match_existing succeeds atomically", async () => {
    const result = await resolvePlaidTransactionMatchReviewItem(supabase, {
      userId: USER_ID,
      reviewItemId: REVIEW_ITEM_ID,
      action: "match_existing",
      candidateId: CANDIDATE_ID,
    });

    expect(result).toEqual({ success: true, code: "matched_existing" });
    expect(store.plaid_finance_transaction_mappings).toHaveLength(1);
    expect(store.plaid_transaction_match_review_items[0]?.review_status).toBe(
      "matched_existing",
    );
  });

  it("match_existing preserves Rocket Money business/import/recurring fields", async () => {
    await resolvePlaidTransactionMatchReviewItem(supabase, {
      userId: USER_ID,
      reviewItemId: REVIEW_ITEM_ID,
      action: "match_existing",
      candidateId: CANDIDATE_ID,
    });

    const candidateTx = store.finance_transactions.find((row) => row.id === FINANCE_TX_ID);
    expect(candidateTx).toMatchObject({
      source: "rocket_money_csv",
      merchant: "Coffee Shop RM",
      description: "Rocket import",
      personal_or_business: "business",
      notes: "Keep notes",
      recurring_item_id: "rec-1",
      deduplication_fingerprint: "fp-123",
      category_id: "cat-1",
    });
    expect(store.finance_business_expense_details[0]?.transaction_id).toBe(FINANCE_TX_ID);
    expect(store.finance_import_batch_items[0]?.transaction_id).toBe(FINANCE_TX_ID);
  });

  it("match_existing fills null account_id only", async () => {
    await resolvePlaidTransactionMatchReviewItem(supabase, {
      userId: USER_ID,
      reviewItemId: REVIEW_ITEM_ID,
      action: "match_existing",
      candidateId: CANDIDATE_ID,
    });

    expect(store.finance_transactions[0]?.account_id).toBe(ACCOUNT_ID);
    expect(store.finance_transactions[0]?.posted_date).toBe("2026-08-01");
  });

  it("match_existing fails closed when account_id conflicts", async () => {
    store.finance_transactions[0]!.account_id = "other-account";

    const result = await resolvePlaidTransactionMatchReviewItem(supabase, {
      userId: USER_ID,
      reviewItemId: REVIEW_ITEM_ID,
      action: "match_existing",
      candidateId: CANDIDATE_ID,
    });

    expect(result.success).toBe(false);
    expect(store.plaid_finance_transaction_mappings).toHaveLength(0);
  });

  it("import_new creates one source=plaid row and mapping", async () => {
    const result = await resolvePlaidTransactionMatchReviewItem(supabase, {
      userId: USER_ID,
      reviewItemId: REVIEW_ITEM_ID,
      action: "import_new",
    });

    expect(result).toEqual({ success: true, code: "imported_new" });
    expect(store.finance_transactions.filter((row) => row.source === "plaid")).toHaveLength(1);
    expect(store.plaid_finance_transaction_mappings).toHaveLength(1);
  });

  it("import_new does not modify candidates", async () => {
    const candidateSnapshot = structuredClone(store.plaid_transaction_match_review_candidates);
    const financeSnapshot = structuredClone(store.finance_transactions);

    await resolvePlaidTransactionMatchReviewItem(supabase, {
      userId: USER_ID,
      reviewItemId: REVIEW_ITEM_ID,
      action: "import_new",
    });

    expect(store.plaid_transaction_match_review_candidates).toEqual(candidateSnapshot);
    expect(store.finance_transactions.filter((row) => row.source === "rocket_money_csv")).toEqual(
      financeSnapshot,
    );
  });

  it("rolls back when Finance insert fails", async () => {
    supabase = createMockSupabase(store, { failFinanceInsert: true });

    const result = await resolvePlaidTransactionMatchReviewItem(supabase, {
      userId: USER_ID,
      reviewItemId: REVIEW_ITEM_ID,
      action: "import_new",
    });

    expect(result.success).toBe(false);
    expect(store.plaid_finance_transaction_mappings).toHaveLength(0);
    expect(store.plaid_transaction_match_review_items[0]?.review_status).toBe("pending");
  });

  it("rolls back when mapping insert fails", async () => {
    supabase = createMockSupabase(store, { failMappingInsert: true });

    const result = await resolvePlaidTransactionMatchReviewItem(supabase, {
      userId: USER_ID,
      reviewItemId: REVIEW_ITEM_ID,
      action: "import_new",
    });

    expect(result.success).toBe(false);
    expect(store.finance_transactions.filter((row) => row.source === "plaid")).toHaveLength(0);
    expect(store.plaid_transaction_match_review_items[0]?.review_status).toBe("pending");
  });

  it("rolls back when review update fails", async () => {
    supabase = createMockSupabase(store, { failReviewUpdate: true });

    const result = await resolvePlaidTransactionMatchReviewItem(supabase, {
      userId: USER_ID,
      reviewItemId: REVIEW_ITEM_ID,
      action: "match_existing",
      candidateId: CANDIDATE_ID,
    });

    expect(result.success).toBe(false);
    expect(store.plaid_finance_transaction_mappings).toHaveLength(0);
    expect(store.plaid_transaction_match_review_items[0]?.review_status).toBe("pending");
  });

  it("repeated same resolution is idempotent", async () => {
    const first = await resolvePlaidTransactionMatchReviewItem(supabase, {
      userId: USER_ID,
      reviewItemId: REVIEW_ITEM_ID,
      action: "match_existing",
      candidateId: CANDIDATE_ID,
    });
    const second = await resolvePlaidTransactionMatchReviewItem(supabase, {
      userId: USER_ID,
      reviewItemId: REVIEW_ITEM_ID,
      action: "match_existing",
      candidateId: CANDIDATE_ID,
    });

    expect(first.success).toBe(true);
    expect(second).toEqual({ success: true, code: "matched_existing" });
    expect(store.plaid_finance_transaction_mappings).toHaveLength(1);
  });

  it("different second resolution fails closed", async () => {
    await resolvePlaidTransactionMatchReviewItem(supabase, {
      userId: USER_ID,
      reviewItemId: REVIEW_ITEM_ID,
      action: "match_existing",
      candidateId: CANDIDATE_ID,
    });

    const second = await resolvePlaidTransactionMatchReviewItem(supabase, {
      userId: USER_ID,
      reviewItemId: REVIEW_ITEM_ID,
      action: "import_new",
    });

    expect(second.success).toBe(false);
    expect(store.finance_transactions.filter((row) => row.source === "plaid")).toHaveLength(0);
  });

  it("concurrent resolution cannot duplicate rows", async () => {
    const firstStore = structuredClone(store);
    const secondStore = structuredClone(store);
    const firstSupabase = createMockSupabase(firstStore);
    const secondSupabase = createMockSupabase(secondStore);

    const [first, second] = await Promise.all([
      resolvePlaidTransactionMatchReviewItem(firstSupabase, {
        userId: USER_ID,
        reviewItemId: REVIEW_ITEM_ID,
        action: "import_new",
      }),
      resolvePlaidTransactionMatchReviewItem(secondSupabase, {
        userId: USER_ID,
        reviewItemId: REVIEW_ITEM_ID,
        action: "import_new",
      }),
    ]);

    const successes = [first, second].filter((result) => result.success);
    expect(successes).toHaveLength(2);
    expect(firstStore.plaid_finance_transaction_mappings).toHaveLength(1);
    expect(secondStore.plaid_finance_transaction_mappings).toHaveLength(1);
  });

  it("removed review cannot resolve", async () => {
    store.plaid_transaction_match_review_items[0]!.review_status = "removed";

    const result = await resolvePlaidTransactionMatchReviewItem(supabase, {
      userId: USER_ID,
      reviewItemId: REVIEW_ITEM_ID,
      action: "import_new",
    });

    expect(result.success).toBe(false);
  });

  it("resolved review cannot reopen", async () => {
    store.plaid_transaction_match_review_items[0]!.review_status = "imported_new";
    store.plaid_transaction_match_review_items[0]!.resolved_finance_transaction_id =
      "resolved-fin";
    store.plaid_transaction_match_review_items[0]!.resolved_at =
      "2026-08-06T10:00:00.000Z";

    const result = await resolvePlaidTransactionMatchReviewItem(supabase, {
      userId: USER_ID,
      reviewItemId: REVIEW_ITEM_ID,
      action: "match_existing",
      candidateId: CANDIDATE_ID,
    });

    expect(result.success).toBe(false);
  });

  it("wrong-user review fails closed", async () => {
    const result = await resolvePlaidTransactionMatchReviewItem(supabase, {
      userId: OTHER_USER_ID,
      reviewItemId: REVIEW_ITEM_ID,
      action: "import_new",
    });

    expect(result.success).toBe(false);
  });

  it("candidate from another review fails closed", async () => {
    store.plaid_transaction_match_review_candidates.push({
      id: OTHER_CANDIDATE_ID,
      user_id: USER_ID,
      review_item_id: OTHER_REVIEW_ITEM_ID,
      finance_transaction_id: OTHER_FINANCE_TX_ID,
      match_score: 70,
      match_reasons: ["amount"],
      created_at: "2026-08-06T09:00:00.000Z",
    });

    const result = await resolvePlaidTransactionMatchReviewItem(supabase, {
      userId: USER_ID,
      reviewItemId: REVIEW_ITEM_ID,
      action: "match_existing",
      candidateId: OTHER_CANDIDATE_ID,
    });

    expect(result.success).toBe(false);
  });

  it("manual or plaid candidate fails closed", async () => {
    store.finance_transactions[0]!.source = "plaid";

    const result = await resolvePlaidTransactionMatchReviewItem(supabase, {
      userId: USER_ID,
      reviewItemId: REVIEW_ITEM_ID,
      action: "match_existing",
      candidateId: CANDIDATE_ID,
    });

    expect(result.success).toBe(false);
  });

  it("returns generic user-safe errors only", () => {
    const message = mapPlaidReviewResolveErrorToUserMessage("provider_transaction_already_mapped");
    expect(message).toBe(
      "This review item could not be resolved. Refresh the page and try again.",
    );
    expect(message).not.toContain("provider");
    expect(message).not.toContain(PROVIDER_TX_ID);
  });
});
