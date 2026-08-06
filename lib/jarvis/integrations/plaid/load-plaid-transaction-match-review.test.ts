import { beforeEach, describe, expect, it } from "vitest";

import { getPlaidReviewPagePresentationForTests } from "@/components/finance/plaid-transaction-match-review";
import {
  getPlaidReviewPagePresentation,
  reviewViewContainsPrivateIdentifiers,
} from "@/lib/jarvis/integrations/plaid/plaid-transaction-match-review-types";
import { loadPlaidTransactionMatchReview } from "@/lib/jarvis/integrations/plaid/load-plaid-transaction-match-review";
import type { SupabaseClient } from "@supabase/supabase-js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "99999999-9999-4999-8999-999999999999";
const REVIEW_ITEM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CANDIDATE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FINANCE_TX_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";
const CONNECTION_ID = "22222222-2222-4222-8222-222222222222";
const RECURRING_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

type TableRow = Record<string, unknown> & { id?: string };

type MockStore = {
  plaid_transaction_match_review_items: TableRow[];
  plaid_transaction_match_review_candidates: TableRow[];
  finance_accounts: TableRow[];
  plaid_connections: TableRow[];
  finance_transactions: TableRow[];
  finance_recurring_items: TableRow[];
};

function createStore(overrides: Partial<MockStore> = {}): MockStore {
  return {
    plaid_transaction_match_review_items: [],
    plaid_transaction_match_review_candidates: [],
    finance_accounts: [],
    plaid_connections: [],
    finance_transactions: [],
    finance_recurring_items: [],
    ...overrides,
  };
}

function matchesFilters(row: TableRow, filters: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(filters)) {
    if (key.endsWith("_in")) {
      const field = key.slice(0, -3);
      if (!(value as unknown[]).includes(row[field])) {
        return false;
      }
      continue;
    }

    if (row[key] !== value) {
      return false;
    }
  }

  return true;
}

function createMockSupabase(store: MockStore, userId = USER_ID): SupabaseClient {
  const from = (table: keyof MockStore) => {
    let filters: Record<string, unknown> = {};
    let orderField: string | null = null;
    let orderAscending = true;
    let limitCount: number | null = null;
    let headCount = false;

    const builder = {
      select(_columns: string, options?: { count?: string; head?: boolean }) {
        if (options?.head) {
          headCount = true;
        }
        return builder;
      },
      eq(column: string, value: unknown) {
        filters[column] = value;
        return builder;
      },
      in(column: string, values: unknown[]) {
        filters[`${column}_in`] = values;
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        orderField = column;
        orderAscending = options?.ascending ?? true;
        return builder;
      },
      limit(count: number) {
        limitCount = count;
        return builder;
      },
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return execute().then(onFulfilled, onRejected);
      },
    };

    async function execute(): Promise<{ data: unknown; error: null; count?: number }> {
      let rows = store[table].filter((row) => matchesFilters(row, filters));

      if (orderField) {
        rows = [...rows].sort((left, right) => {
          const leftValue = String(left[orderField!]);
          const rightValue = String(right[orderField!]);
          if (leftValue === rightValue) {
            return 0;
          }
          const comparison = leftValue < rightValue ? -1 : 1;
          return orderAscending ? comparison : -comparison;
        });
      }

      if (limitCount !== null) {
        rows = rows.slice(0, limitCount);
      }

      if (headCount) {
        return { data: null, error: null, count: rows.length };
      }

      return { data: rows, error: null };
    }

    return builder;
  };

  return { from, auth: { getUser: async () => ({ data: { user: { id: userId } } }) } } as unknown as SupabaseClient;
}

function seedPendingReview(store: MockStore) {
  store.plaid_transaction_match_review_items.push({
    id: REVIEW_ITEM_ID,
    user_id: USER_ID,
    plaid_connection_id: CONNECTION_ID,
    finance_account_id: ACCOUNT_ID,
    plaid_transaction_id: "provider-txn-hidden",
    transaction_date: "2026-08-01",
    posted_date: "2026-08-01",
    amount: -42.5,
    merchant: "Coffee Shop",
    description: "Morning coffee",
    transaction_type: "expense",
    review_status: "pending",
    created_at: "2026-08-06T12:00:00.000Z",
  });

  store.plaid_connections.push({
    id: CONNECTION_ID,
    user_id: USER_ID,
    institution_name: "Test Bank",
  });

  store.finance_accounts.push({
    id: ACCOUNT_ID,
    user_id: USER_ID,
    name: "Checking",
    institution_name: "Test Bank",
    last_four: "1234",
  });

  store.plaid_transaction_match_review_candidates.push({
    id: CANDIDATE_ID,
    user_id: USER_ID,
    review_item_id: REVIEW_ITEM_ID,
    finance_transaction_id: FINANCE_TX_ID,
    match_score: 72,
    match_reasons: ["amount", "merchant", "posted_date", "transaction_type"],
    created_at: "2026-08-06T12:00:00.000Z",
  });

  store.finance_transactions.push({
    id: FINANCE_TX_ID,
    user_id: USER_ID,
    transaction_date: "2026-08-01",
    posted_date: "2026-08-02",
    amount: -42.5,
    merchant: "Coffee Shop RM",
    description: "Rocket import",
    transaction_type: "expense",
    personal_or_business: "business",
    recurring_item_id: RECURRING_ID,
  });

  store.finance_recurring_items.push({
    id: RECURRING_ID,
    user_id: USER_ID,
    name: "Coffee subscription",
    frequency: "monthly",
  });
}

describe("loadPlaidTransactionMatchReview", () => {
  let store: MockStore;
  let supabase: SupabaseClient;

  beforeEach(() => {
    store = createStore();
    supabase = createMockSupabase(store);
  });

  it("returns only the authenticated user's pending items", async () => {
    seedPendingReview(store);
    store.plaid_transaction_match_review_items.push({
      id: "other-review",
      user_id: OTHER_USER_ID,
      plaid_connection_id: CONNECTION_ID,
      finance_account_id: ACCOUNT_ID,
      plaid_transaction_id: "other-provider",
      transaction_date: "2026-08-01",
      posted_date: "2026-08-01",
      amount: -10,
      merchant: "Other",
      description: null,
      transaction_type: "expense",
      review_status: "pending",
      created_at: "2026-08-06T11:00:00.000Z",
    });

    const result = await loadPlaidTransactionMatchReview(supabase, USER_ID);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data.pendingItems).toHaveLength(1);
    expect(result.data.pendingItems[0]?.merchantLabel).toBe("Coffee Shop");
  });

  it("excludes provider IDs and private identifiers from the view model", async () => {
    seedPendingReview(store);

    const result = await loadPlaidTransactionMatchReview(supabase, USER_ID);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(reviewViewContainsPrivateIdentifiers(result.data)).toBe(false);
    expect(JSON.stringify(result.data)).not.toContain("provider-txn-hidden");
    expect(JSON.stringify(result.data)).not.toContain("plaid_transaction_id");
  });

  it("shapes candidate display data correctly", async () => {
    seedPendingReview(store);

    const result = await loadPlaidTransactionMatchReview(supabase, USER_ID);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    const candidate = result.data.pendingItems[0]?.candidates[0];
    expect(candidate).toMatchObject({
      merchantLabel: "Coffee Shop RM",
      matchScore: 72,
      personalOrBusinessLabel: "Business",
      matchReasonLabels: expect.arrayContaining(["Same amount", "Similar merchant"]),
      recurringStatusLabel: "Recurring · Coffee subscription (monthly)",
    });
    expect(candidate?.formattedAmount).toBe("-$42.50");
  });

  it("returns an empty pending queue when none exist", async () => {
    const result = await loadPlaidTransactionMatchReview(supabase, USER_ID);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(result.data.pendingItems).toEqual([]);
    expect(result.data.pendingCount).toBe(0);
    expect(getPlaidReviewPagePresentation(result.data)).toEqual({
      showPending: false,
      showEmpty: true,
      showRecent: false,
      pendingCount: 0,
    });
  });

  it("includes recent resolved items and pending presentation state", async () => {
    store.plaid_transaction_match_review_items.push({
      id: "resolved-item",
      user_id: USER_ID,
      plaid_connection_id: CONNECTION_ID,
      finance_account_id: ACCOUNT_ID,
      plaid_transaction_id: "resolved-provider-hidden",
      transaction_date: "2026-08-02",
      posted_date: "2026-08-02",
      amount: -15,
      merchant: "Resolved Merchant",
      description: null,
      transaction_type: "expense",
      review_status: "imported_new",
      resolved_at: "2026-08-06T10:00:00.000Z",
      created_at: "2026-08-06T09:00:00.000Z",
    });

    store.plaid_connections.push({
      id: CONNECTION_ID,
      user_id: USER_ID,
      institution_name: "Test Bank",
    });

    store.finance_accounts.push({
      id: ACCOUNT_ID,
      user_id: USER_ID,
      name: "Checking",
      institution_name: "Test Bank",
      last_four: null,
    });

    seedPendingReview(store);

    const result = await loadPlaidTransactionMatchReview(supabase, USER_ID);

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(getPlaidReviewPagePresentationForTests(result.data)).toEqual({
      showPending: true,
      showEmpty: false,
      showRecent: true,
      pendingCount: 1,
    });
    expect(result.data.recentResolvedItems[0]?.resolutionOutcomeLabel).toBe(
      "Imported as new Plaid transaction",
    );
  });
});
