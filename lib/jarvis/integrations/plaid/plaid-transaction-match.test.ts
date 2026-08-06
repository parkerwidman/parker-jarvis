import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addCalendarDays,
  amountsEqualAbsolute,
  calendarDayDistance,
  normalizeMerchantText,
} from "@/lib/jarvis/integrations/plaid/plaid-transaction-match-normalization";
import { matchPlaidPostedTransaction } from "@/lib/jarvis/integrations/plaid/plaid-transaction-match-service";
import {
  hasAmbiguousCandidates,
  PLAID_AUTO_MATCH_SCORE_THRESHOLD,
  scoreEligibleCandidates,
  selectAutoMatchCandidate,
  transactionTypesCompatible,
} from "@/lib/jarvis/integrations/plaid/plaid-transaction-match-scoring";
import type {
  PlaidPostedTransactionMatchInput,
  RocketMoneyCandidateRow,
} from "@/lib/jarvis/integrations/plaid/plaid-transaction-match-types";
import { resolvePlaidMappingRemovalDecision } from "@/lib/jarvis/integrations/plaid/plaid-transaction-removal-safety";
import type { SupabaseClient } from "@supabase/supabase-js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONNECTION_ID = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";

type TableRow = Record<string, unknown> & { id?: string };

type MockStore = {
  plaid_connections: TableRow[];
  finance_accounts: TableRow[];
  plaid_finance_account_mappings: TableRow[];
  finance_transactions: TableRow[];
  plaid_finance_transaction_mappings: TableRow[];
  plaid_transaction_match_review_items: TableRow[];
  plaid_transaction_match_review_candidates: TableRow[];
};

type RpcCommitArgs = {
  p_user_id: string;
  p_plaid_connection_id: string;
  p_finance_account_id: string;
  p_finance_transaction_id: string;
  p_provider_transaction_id: string;
  p_provider_pending_transaction_id: string | null;
  p_posted_date: string;
  p_amount: number;
  p_transaction_type: string;
  p_observed_at: string;
};

type RpcOptions = {
  failAfterAccountUpdate?: boolean;
  failOnMappingInsert?: boolean;
};

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

function amountToCents(amount: number): number {
  return Math.round(Math.abs(amount) * 100);
}

function transactionTypesCompatibleRpc(
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

function executeCommitRpc(
  store: MockStore,
  args: RpcCommitArgs,
  options: RpcOptions = {},
): { success: boolean; code?: string; finance_transaction_id?: string } {
  const snapshot = structuredClone(store);

  const fail = (code: string): { success: boolean; code: string } => {
    Object.assign(store, structuredClone(snapshot));
    return { success: false, code };
  };

  const connection = store.plaid_connections.find(
    (row) => row.id === args.p_plaid_connection_id && row.user_id === args.p_user_id,
  );
  if (!connection) {
    return fail("plaid_connection_not_found");
  }

  const account = store.finance_accounts.find(
    (row) => row.id === args.p_finance_account_id && row.user_id === args.p_user_id,
  );
  if (!account) {
    return fail("finance_account_not_found");
  }

  const accountMapping = store.plaid_finance_account_mappings.find(
    (row) =>
      row.user_id === args.p_user_id &&
      row.plaid_connection_id === args.p_plaid_connection_id &&
      row.finance_account_id === args.p_finance_account_id,
  );
  if (!accountMapping) {
    return fail("finance_account_not_mapped");
  }

  const candidate = store.finance_transactions.find(
    (row) => row.id === args.p_finance_transaction_id,
  );
  if (
    !candidate ||
    candidate.user_id !== args.p_user_id ||
    candidate.source !== "rocket_money_csv" ||
    candidate.status !== "posted"
  ) {
    return fail("match_candidate_unavailable");
  }

  if (
    candidate.account_id !== null &&
    candidate.account_id !== undefined &&
    candidate.account_id !== args.p_finance_account_id
  ) {
    return fail("match_candidate_ineligible");
  }

  if (amountToCents(Number(candidate.amount)) !== amountToCents(args.p_amount)) {
    return fail("match_candidate_ineligible");
  }

  if (
    !transactionTypesCompatibleRpc(
      args.p_transaction_type,
      String(candidate.transaction_type),
      args.p_amount,
      Number(candidate.amount),
    )
  ) {
    return fail("match_candidate_ineligible");
  }

  const comparisonDate = String(candidate.posted_date ?? candidate.transaction_date);
  const dayDistance = calendarDayDistance(args.p_posted_date, comparisonDate);
  if (dayDistance === null || dayDistance > 3) {
    return fail("match_candidate_ineligible");
  }

  const conflictingMapping = store.plaid_finance_transaction_mappings.find(
    (row) =>
      row.user_id === args.p_user_id &&
      row.finance_transaction_id === args.p_finance_transaction_id &&
      !row.removed_at &&
      row.provider_transaction_id !== args.p_provider_transaction_id,
  );
  if (conflictingMapping) {
    return fail("match_candidate_already_mapped");
  }

  const existingProviderMapping = store.plaid_finance_transaction_mappings.find(
    (row) =>
      row.user_id === args.p_user_id &&
      row.plaid_connection_id === args.p_plaid_connection_id &&
      row.provider_transaction_id === args.p_provider_transaction_id,
  );

  if (
    existingProviderMapping &&
    !existingProviderMapping.removed_at &&
    existingProviderMapping.finance_transaction_id !== args.p_finance_transaction_id
  ) {
    return fail("provider_transaction_already_mapped");
  }

  if (candidate.account_id === null || candidate.account_id === undefined) {
    candidate.account_id = args.p_finance_account_id;
  }

  if (candidate.posted_date === null || candidate.posted_date === undefined) {
    candidate.posted_date = args.p_posted_date;
  }

  if (options.failAfterAccountUpdate) {
    return fail("match_commit_failed");
  }

  if (existingProviderMapping && !existingProviderMapping.removed_at) {
    // idempotent mapping
  } else if (existingProviderMapping) {
    Object.assign(existingProviderMapping, {
      finance_transaction_id: args.p_finance_transaction_id,
      provider_pending_transaction_id: args.p_provider_pending_transaction_id,
      provider_observed_at: args.p_observed_at,
      removed_at: null,
    });
  } else if (options.failOnMappingInsert) {
    return fail("provider_transaction_already_mapped");
  } else {
    store.plaid_finance_transaction_mappings.push({
      id: createId("map"),
      user_id: args.p_user_id,
      plaid_connection_id: args.p_plaid_connection_id,
      finance_transaction_id: args.p_finance_transaction_id,
      provider_transaction_id: args.p_provider_transaction_id,
      provider_pending_transaction_id: args.p_provider_pending_transaction_id,
      provider_observed_at: args.p_observed_at,
      removed_at: null,
    });
  }

  const reviewItem = store.plaid_transaction_match_review_items.find(
    (row) =>
      row.user_id === args.p_user_id &&
      row.plaid_connection_id === args.p_plaid_connection_id &&
      row.plaid_transaction_id === args.p_provider_transaction_id,
  );

  if (reviewItem && reviewItem.review_status === "pending") {
    reviewItem.review_status = "matched_existing";
    reviewItem.resolved_finance_transaction_id = args.p_finance_transaction_id;
    reviewItem.resolved_at = args.p_observed_at;
  }

  return {
    success: true,
    code: "matched_existing",
    finance_transaction_id: args.p_finance_transaction_id,
  };
}

function matchesFilters(row: TableRow, filters: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(filters)) {
    if (key.endsWith("_gte")) {
      const field = key.slice(0, -4);
      if (String(row[field]) < String(value)) {
        return false;
      }
      continue;
    }

    if (key.endsWith("_lte")) {
      const field = key.slice(0, -4);
      if (String(row[field]) > String(value)) {
        return false;
      }
      continue;
    }

    if (key.endsWith("_in")) {
      const field = key.slice(0, -3);
      const values = value as unknown[];
      if (!values.includes(row[field])) {
        return false;
      }
      continue;
    }

    if (key.endsWith("_is")) {
      const field = key.slice(0, -3);
      if (value === null) {
        if (row[field] !== null && row[field] !== undefined) {
          return false;
        }
      } else if (row[field] !== value) {
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

function matchesOrFilter(row: TableRow, orFilter: string): boolean {
  const clauses = orFilter.split("),and(").map((clause) => clause.replace(/^and\(/, "").replace(/\)$/, ""));

  return clauses.some((clause) => {
    const gteMatch = clause.match(/(\w+)\.gte\.(\S+)/);
    const lteMatch = clause.match(/(\w+)\.lte\.(\S+)/);
    if (!gteMatch || !lteMatch) {
      return false;
    }

    const field = gteMatch[1];
    const min = gteMatch[2];
    const max = lteMatch[2];
    const value = row[field];
    if (value === null || value === undefined) {
      return false;
    }

    const stringValue = String(value);
    return stringValue >= min && stringValue <= max;
  });
}

function createMockSupabase(store: MockStore, rpcOptions: RpcOptions = {}): SupabaseClient {
  const from = (table: keyof MockStore) => {
    let filters: Record<string, unknown> = {};
    let orFilter: string | null = null;
    let limitToSingle = false;
    let pendingInsert: TableRow | TableRow[] | null = null;
    let pendingUpdate: TableRow | null = null;
    let pendingDelete = false;

    const builder = {
      select(_columns: string) {
        return builder;
      },
      eq(column: string, value: unknown) {
        filters[`${column}`] = value;
        return builder;
      },
      gte(column: string, value: unknown) {
        filters[`${column}_gte`] = value;
        return builder;
      },
      lte(column: string, value: unknown) {
        filters[`${column}_lte`] = value;
        return builder;
      },
      in(column: string, values: unknown[]) {
        filters[`${column}_in`] = values;
        return builder;
      },
      is(column: string, value: unknown) {
        filters[`${column}_is`] = value;
        return builder;
      },
      or(filter: string) {
        orFilter = filter;
        return builder;
      },
      insert(payload: TableRow | TableRow[]) {
        pendingInsert = payload;
        return builder;
      },
      update(payload: TableRow) {
        pendingUpdate = payload;
        return builder;
      },
      delete() {
        pendingDelete = true;
        return builder;
      },
      maybeSingle() {
        limitToSingle = true;
        return execute();
      },
      single() {
        limitToSingle = true;
        return execute();
      },
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return execute().then(onFulfilled, onRejected);
      },
    };

    async function execute(): Promise<{ data: unknown; error: unknown }> {
      const rows = store[table];

      if (pendingInsert) {
        const payloadRows = Array.isArray(pendingInsert) ? pendingInsert : [pendingInsert];
        const insertedRows = payloadRows.map((row) => {
          const inserted = {
            id: row.id ?? createId(table),
            created_at: row.created_at ?? "2026-08-01T00:00:00.000Z",
            ...row,
          };
          rows.push(inserted);
          return inserted;
        });

        if (limitToSingle) {
          return { data: insertedRows[0], error: null };
        }

        return { data: insertedRows, error: null };
      }

      if (pendingUpdate) {
        const matched = rows.filter((row) => matchesFilters(row, filters));
        if (matched.length === 0) {
          return limitToSingle
            ? { data: null, error: { message: "not_found" } }
            : { data: [], error: null };
        }

        for (const row of matched) {
          Object.assign(row, pendingUpdate);
        }

        if (limitToSingle) {
          return { data: matched[0], error: null };
        }

        return { data: matched, error: null };
      }

      if (pendingDelete) {
        const remaining = rows.filter((row) => !matchesFilters(row, filters));
        store[table] = remaining;
        return { data: [{}], error: null };
      }

      let matched = rows.filter((row) => matchesFilters(row, filters));
      if (orFilter) {
        matched = matched.filter((row) => matchesOrFilter(row, orFilter as string));
      }

      if (limitToSingle) {
        return { data: matched[0] ?? null, error: null };
      }

      return { data: matched, error: null };
    }

    return builder;
  };

  const rpc = vi.fn(async (name: string, args: RpcCommitArgs) => {
    if (name !== "commit_plaid_rocket_money_transaction_match") {
      return { data: null, error: { message: "unknown_rpc" } };
    }

    return { data: executeCommitRpc(store, args, rpcOptions), error: null };
  });

  return { from, rpc } as unknown as SupabaseClient;
}

function baseStore(): MockStore {
  return createEmptyStore();
}

function seedBaseOwnership(store: MockStore): void {
  store.plaid_connections.push({ id: CONNECTION_ID, user_id: USER_ID });
  store.finance_accounts.push({ id: ACCOUNT_ID, user_id: USER_ID });
  store.plaid_finance_account_mappings.push({
    id: "mapping-account",
    user_id: USER_ID,
    plaid_connection_id: CONNECTION_ID,
    finance_account_id: ACCOUNT_ID,
  });
}

function createEmptyStore(): MockStore {
  return {
    plaid_connections: [],
    finance_accounts: [],
    plaid_finance_account_mappings: [],
    finance_transactions: [],
    plaid_finance_transaction_mappings: [],
    plaid_transaction_match_review_items: [],
    plaid_transaction_match_review_candidates: [],
  };
}

function rocketMoneyCandidate(
  overrides: Partial<RocketMoneyCandidateRow> & { id: string },
): RocketMoneyCandidateRow & { user_id: string } {
  return {
    user_id: USER_ID,
    account_id: null,
    transaction_date: "2026-08-01",
    posted_date: null,
    amount: -20,
    merchant: "Anthropic",
    description: "Claude subscription",
    transaction_type: "expense",
    status: "posted",
    source: "rocket_money_csv",
    ...overrides,
  };
}

function postedPlaidInput(
  overrides: Partial<PlaidPostedTransactionMatchInput> = {},
): PlaidPostedTransactionMatchInput {
  return {
    providerTransactionId: "plaid-txn-1",
    pendingProviderTransactionId: null,
    transactionDate: "2026-08-01",
    postedDate: "2026-08-01",
    amount: -20,
    merchant: "Anthropic",
    description: "ANTHROPIC CLAUDE",
    transactionType: "expense",
    status: "posted",
    ...overrides,
  };
}

describe("plaid transaction match normalization and scoring", () => {
  it("compares absolute amounts using cents precision", () => {
    expect(amountsEqualAbsolute(-20, -20)).toBe(true);
    expect(amountsEqualAbsolute(-20, 20)).toBe(true);
    expect(amountsEqualAbsolute(-20.005, -20)).toBe(false);
  });

  it("measures calendar day distance", () => {
    expect(calendarDayDistance("2026-08-01", "2026-08-04")).toBe(3);
    expect(calendarDayDistance("2026-08-01", "2026-08-05")).toBe(4);
    expect(addCalendarDays("2026-08-01", -3)).toBe("2026-07-29");
  });

  it("excludes refund and expense sign mismatches", () => {
    expect(
      transactionTypesCompatible("expense", "refund", -20, 20),
    ).toBe(false);
    expect(
      transactionTypesCompatible("expense", "expense", -20, -20),
    ).toBe(true);
  });
});

describe("matchPlaidPostedTransaction", () => {
  let store: MockStore;
  let supabase: SupabaseClient;

  beforeEach(() => {
    store = baseStore();
    seedBaseOwnership(store);
    supabase = createMockSupabase(store);
  });

  it("auto-matches a unique same-day merchant candidate", async () => {
    store.finance_transactions.push(
      rocketMoneyCandidate({ id: "rm-1", merchant: "Anthropic" }),
    );

    const result = await matchPlaidPostedTransaction(
      supabase,
      USER_ID,
      CONNECTION_ID,
      ACCOUNT_ID,
      postedPlaidInput(),
      { observedAt: "2026-08-06T00:00:00.000Z" },
    );

    expect(result).toEqual({
      outcome: "matched_existing",
      financeTransactionId: "rm-1",
    });

    const financeRow = store.finance_transactions[0];
    expect(financeRow.account_id).toBe(ACCOUNT_ID);
    expect(financeRow.posted_date).toBe("2026-08-01");
    expect(financeRow.merchant).toBe("Anthropic");
    expect(store.plaid_finance_transaction_mappings).toHaveLength(1);
  });

  it("stages review when amount matches but merchant is weak", async () => {
    store.finance_transactions.push(
      rocketMoneyCandidate({ id: "rm-weak", merchant: "Random Vendor LLC" }),
    );

    const result = await matchPlaidPostedTransaction(
      supabase,
      USER_ID,
      CONNECTION_ID,
      ACCOUNT_ID,
      postedPlaidInput({ merchant: "Totally Different Shop" }),
    );

    expect(result.outcome).toBe("review_required");
    if (result.outcome === "review_required") {
      expect(result.candidateCount).toBe(1);
      expect(store.plaid_transaction_match_review_items).toHaveLength(1);
      expect(store.plaid_transaction_match_review_candidates).toHaveLength(1);
    }
  });

  it("stages review when two plausible candidates exist", async () => {
    store.finance_transactions.push(
      rocketMoneyCandidate({ id: "rm-a", merchant: "Anthropic", transaction_date: "2026-08-01" }),
      rocketMoneyCandidate({ id: "rm-b", merchant: "Anthropic", transaction_date: "2026-08-02" }),
    );

    const result = await matchPlaidPostedTransaction(
      supabase,
      USER_ID,
      CONNECTION_ID,
      ACCOUNT_ID,
      postedPlaidInput(),
    );

    expect(result.outcome).toBe("review_required");
    if (result.outcome === "review_required") {
      expect(result.candidateCount).toBe(2);
    }
  });

  it("returns no_match when no eligible candidates exist", async () => {
    const result = await matchPlaidPostedTransaction(
      supabase,
      USER_ID,
      CONNECTION_ID,
      ACCOUNT_ID,
      postedPlaidInput(),
    );

    expect(result).toEqual({ outcome: "no_match" });
    expect(store.plaid_transaction_match_review_items).toHaveLength(0);
  });

  it("includes candidates on the ±3-day boundary", async () => {
    const candidate = rocketMoneyCandidate({
      id: "rm-boundary",
      transaction_date: "2026-07-29",
      merchant: "Anthropic",
    });

    const scored = scoreEligibleCandidates(
      postedPlaidInput({ postedDate: "2026-08-01" }),
      [candidate],
      ACCOUNT_ID,
      new Map(),
    );

    expect(scored).toHaveLength(1);
    expect(scored[0].calendarDayDistance).toBe(3);
  });

  it("excludes candidates outside the ±3-day window", async () => {
    store.finance_transactions.push(
      rocketMoneyCandidate({
        id: "rm-outside",
        transaction_date: "2026-07-28",
        merchant: "Anthropic",
      }),
    );

    const result = await matchPlaidPostedTransaction(
      supabase,
      USER_ID,
      CONNECTION_ID,
      ACCOUNT_ID,
      postedPlaidInput({ postedDate: "2026-08-01" }),
    );

    expect(result).toEqual({ outcome: "no_match" });
  });

  it("excludes refund and expense sign mismatches", async () => {
    store.finance_transactions.push(
      rocketMoneyCandidate({
        id: "rm-refund",
        amount: 20,
        transaction_type: "refund",
      }),
    );

    const result = await matchPlaidPostedTransaction(
      supabase,
      USER_ID,
      CONNECTION_ID,
      ACCOUNT_ID,
      postedPlaidInput({ amount: -20, transactionType: "expense" }),
    );

    expect(result).toEqual({ outcome: "no_match" });
  });

  it("bypasses pending plaid transactions", async () => {
    store.finance_transactions.push(rocketMoneyCandidate({ id: "rm-pending" }));

    const result = await matchPlaidPostedTransaction(
      supabase,
      USER_ID,
      CONNECTION_ID,
      ACCOUNT_ID,
      {
        ...postedPlaidInput(),
        status: "pending",
        postedDate: null,
      },
    );

    expect(result).toEqual({ outcome: "no_match" });
  });

  it("excludes candidates with a different non-null account", async () => {
    store.finance_transactions.push(
      rocketMoneyCandidate({
        id: "rm-other-account",
        account_id: "99999999-9999-4999-8999-999999999999",
        merchant: "Anthropic",
      }),
    );

    const result = await matchPlaidPostedTransaction(
      supabase,
      USER_ID,
      CONNECTION_ID,
      ACCOUNT_ID,
      postedPlaidInput(),
    );

    expect(result).toEqual({ outcome: "no_match" });
  });

  it("allows candidates with a null account", async () => {
    store.finance_transactions.push(
      rocketMoneyCandidate({ id: "rm-null-account", account_id: null, merchant: "Anthropic" }),
    );

    const result = await matchPlaidPostedTransaction(
      supabase,
      USER_ID,
      CONNECTION_ID,
      ACCOUNT_ID,
      postedPlaidInput(),
    );

    expect(result.outcome).toBe("matched_existing");
  });

  it("returns matched_existing for an existing provider mapping", async () => {
    store.finance_transactions.push(rocketMoneyCandidate({ id: "rm-existing" }));
    store.plaid_finance_transaction_mappings.push({
      id: "map-existing",
      user_id: USER_ID,
      plaid_connection_id: CONNECTION_ID,
      finance_transaction_id: "rm-existing",
      provider_transaction_id: "plaid-txn-1",
      removed_at: null,
    });

    const result = await matchPlaidPostedTransaction(
      supabase,
      USER_ID,
      CONNECTION_ID,
      ACCOUNT_ID,
      postedPlaidInput(),
    );

    expect(result).toEqual({
      outcome: "matched_existing",
      financeTransactionId: "rm-existing",
    });
    expect(store.plaid_finance_transaction_mappings).toHaveLength(1);
  });

  it("preserves rocket money fields during auto-match", async () => {
    store.finance_transactions.push(
      rocketMoneyCandidate({
        id: "rm-preserve",
        merchant: "Anthropic",
        description: "Keep this description",
        account_id: ACCOUNT_ID,
        posted_date: "2026-08-01",
        transaction_date: "2026-08-01",
      }),
    );

    const result = await matchPlaidPostedTransaction(
      supabase,
      USER_ID,
      CONNECTION_ID,
      ACCOUNT_ID,
      postedPlaidInput({ postedDate: "2026-08-01" }),
    );

    expect(result.outcome).toBe("matched_existing");

    const financeRow = store.finance_transactions[0];
    expect(financeRow.merchant).toBe("Anthropic");
    expect(financeRow.description).toBe("Keep this description");
    expect(financeRow.posted_date).toBe("2026-08-01");
    expect(financeRow.account_id).toBe(ACCOUNT_ID);
  });

  it("refreshes review candidates without duplicating rows on repeat staging", async () => {
    store.finance_transactions.push(
      rocketMoneyCandidate({ id: "rm-review-1", merchant: "Weak Vendor" }),
    );

    const first = await matchPlaidPostedTransaction(
      supabase,
      USER_ID,
      CONNECTION_ID,
      ACCOUNT_ID,
      postedPlaidInput({ providerTransactionId: "plaid-review", merchant: "Other Vendor" }),
    );
    expect(first.outcome).toBe("review_required");

    store.finance_transactions.push(
      rocketMoneyCandidate({ id: "rm-review-2", merchant: "Another Vendor" }),
    );

    const second = await matchPlaidPostedTransaction(
      supabase,
      USER_ID,
      CONNECTION_ID,
      ACCOUNT_ID,
      postedPlaidInput({ providerTransactionId: "plaid-review", merchant: "Other Vendor" }),
    );

    expect(second.outcome).toBe("review_required");
    expect(store.plaid_transaction_match_review_items).toHaveLength(1);
    expect(store.plaid_transaction_match_review_candidates).toHaveLength(2);
  });

  it("resolves pending review to matched_existing and preserves audit history", async () => {
    store.finance_transactions.push(
      rocketMoneyCandidate({ id: "rm-review-match", merchant: "Anthropic" }),
    );
    store.plaid_transaction_match_review_items.push({
      id: "review-1",
      user_id: USER_ID,
      plaid_connection_id: CONNECTION_ID,
      finance_account_id: ACCOUNT_ID,
      plaid_transaction_id: "plaid-txn-1",
      review_status: "pending",
      created_at: "2026-08-01T10:00:00.000Z",
    });
    store.plaid_transaction_match_review_candidates.push({
      id: "candidate-1",
      user_id: USER_ID,
      review_item_id: "review-1",
      finance_transaction_id: "rm-review-match",
      match_score: 70,
      match_reasons: ["amount", "posted_date"],
      created_at: "2026-08-01T10:00:00.000Z",
    });

    const result = await matchPlaidPostedTransaction(
      supabase,
      USER_ID,
      CONNECTION_ID,
      ACCOUNT_ID,
      postedPlaidInput(),
      { observedAt: "2026-08-06T00:00:00.000Z" },
    );

    expect(result.outcome).toBe("matched_existing");
    const reviewItem = store.plaid_transaction_match_review_items[0];
    expect(reviewItem.review_status).toBe("matched_existing");
    expect(reviewItem.resolved_finance_transaction_id).toBe("rm-review-match");
    expect(reviewItem.resolved_at).toBe("2026-08-06T00:00:00.000Z");
    expect(reviewItem.created_at).toBe("2026-08-01T10:00:00.000Z");
    expect(store.plaid_transaction_match_review_candidates).toHaveLength(1);
    expect(store.plaid_transaction_match_review_candidates[0].created_at).toBe(
      "2026-08-01T10:00:00.000Z",
    );
  });

  it("rejects restaging a resolved review item", async () => {
    store.finance_transactions.push(
      rocketMoneyCandidate({ id: "rm-resolved", merchant: "Weak Vendor" }),
    );
    store.plaid_transaction_match_review_items.push({
      id: "review-resolved",
      user_id: USER_ID,
      plaid_connection_id: CONNECTION_ID,
      finance_account_id: ACCOUNT_ID,
      plaid_transaction_id: "plaid-resolved",
      review_status: "matched_existing",
      resolved_finance_transaction_id: "rm-resolved",
      resolved_at: "2026-08-02T00:00:00.000Z",
      created_at: "2026-08-01T10:00:00.000Z",
    });

    await expect(
      matchPlaidPostedTransaction(
        supabase,
        USER_ID,
        CONNECTION_ID,
        ACCOUNT_ID,
        postedPlaidInput({
          providerTransactionId: "plaid-resolved",
          merchant: "Other Vendor",
        }),
      ),
    ).rejects.toThrow("review_item_not_pending");
  });

  it("is idempotent when repeating a successful match", async () => {
    store.finance_transactions.push(
      rocketMoneyCandidate({
        id: "rm-idempotent",
        merchant: "Anthropic",
        account_id: ACCOUNT_ID,
        posted_date: "2026-08-01",
      }),
    );

    const first = await matchPlaidPostedTransaction(
      supabase,
      USER_ID,
      CONNECTION_ID,
      ACCOUNT_ID,
      postedPlaidInput({ providerTransactionId: "plaid-idempotent" }),
    );
    expect(first.outcome).toBe("matched_existing");

    const financeSnapshot = structuredClone(store.finance_transactions[0]);
    const mappingCount = store.plaid_finance_transaction_mappings.length;

    const second = await matchPlaidPostedTransaction(
      supabase,
      USER_ID,
      CONNECTION_ID,
      ACCOUNT_ID,
      postedPlaidInput({ providerTransactionId: "plaid-idempotent" }),
    );

    expect(second.outcome).toBe("matched_existing");
    expect(store.finance_transactions[0]).toEqual(financeSnapshot);
    expect(store.plaid_finance_transaction_mappings).toHaveLength(mappingCount);
  });

  it("returns no_match when candidate is already mapped to another provider", async () => {
    store.finance_transactions.push(
      rocketMoneyCandidate({ id: "rm-conflict", merchant: "Anthropic" }),
    );
    store.plaid_finance_transaction_mappings.push({
      id: "map-conflict",
      user_id: USER_ID,
      plaid_connection_id: CONNECTION_ID,
      finance_transaction_id: "rm-conflict",
      provider_transaction_id: "other-plaid-txn",
      removed_at: null,
    });

    const result = await matchPlaidPostedTransaction(
      supabase,
      USER_ID,
      CONNECTION_ID,
      ACCOUNT_ID,
      postedPlaidInput({ providerTransactionId: "plaid-txn-1" }),
    );

    expect(result).toEqual({ outcome: "no_match" });
  });

  it("loads candidates by posted_date when transaction_date is outside the window", async () => {
    store.finance_transactions.push(
      rocketMoneyCandidate({
        id: "rm-posted-window",
        transaction_date: "2026-07-20",
        posted_date: "2026-08-01",
        merchant: "Anthropic",
      }),
    );

    const result = await matchPlaidPostedTransaction(
      supabase,
      USER_ID,
      CONNECTION_ID,
      ACCOUNT_ID,
      postedPlaidInput({ postedDate: "2026-08-01" }),
    );

    expect(result.outcome).toBe("matched_existing");
  });

  it("handles UTC date boundaries deterministically", () => {
    expect(calendarDayDistance("2026-01-01", "2026-01-04")).toBe(3);
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addCalendarDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("does not expose sensitive values in thrown errors", async () => {
    const isolatedStore = baseStore();
    seedBaseOwnership(isolatedStore);
    isolatedStore.finance_transactions.push(
      rocketMoneyCandidate({ id: "rm-sensitive", merchant: "Anthropic" }),
    );

    const supabaseWithFailure = createMockSupabase(isolatedStore, {
      failOnMappingInsert: true,
    });

    try {
      await matchPlaidPostedTransaction(
        supabaseWithFailure,
        USER_ID,
        CONNECTION_ID,
        ACCOUNT_ID,
        postedPlaidInput({
          amount: -20,
          merchant: "Anthropic",
          providerTransactionId: "plaid-secret",
        }),
      );
      throw new Error("expected_error");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toBe("provider_transaction_already_mapped");
      expect(message).not.toContain("plaid-secret");
      expect(message).not.toContain(ACCOUNT_ID);
      expect(message).not.toContain("-20");
    }
  });
});

describe("plaid transaction match atomic RPC behavior", () => {
  it("rolls back account_id changes when mapping creation conflicts", async () => {
    const store = baseStore();
    seedBaseOwnership(store);
    store.finance_transactions.push(
      rocketMoneyCandidate({ id: "rm-rollback-map", merchant: "Anthropic", account_id: null }),
    );

    const supabase = createMockSupabase(store, { failOnMappingInsert: true });

    await expect(
      matchPlaidPostedTransaction(
        supabase,
        USER_ID,
        CONNECTION_ID,
        ACCOUNT_ID,
        postedPlaidInput({ providerTransactionId: "plaid-rollback-map" }),
      ),
    ).rejects.toThrow("provider_transaction_already_mapped");

    expect(store.finance_transactions[0].account_id).toBeNull();
    expect(store.plaid_finance_transaction_mappings).toHaveLength(0);
  });

  it("keeps account_id unchanged after a failed match commit", async () => {
    const store = baseStore();
    seedBaseOwnership(store);
    store.finance_transactions.push(
      rocketMoneyCandidate({
        id: "rm-failed-commit",
        merchant: "Anthropic",
        account_id: null,
      }),
    );

    const supabase = createMockSupabase(store, { failAfterAccountUpdate: true });

    await expect(
      matchPlaidPostedTransaction(
        supabase,
        USER_ID,
        CONNECTION_ID,
        ACCOUNT_ID,
        postedPlaidInput({ providerTransactionId: "plaid-failed-commit" }),
      ),
    ).rejects.toThrow("match_commit_failed");

    expect(store.finance_transactions[0].account_id).toBeNull();
    expect(store.plaid_finance_transaction_mappings).toHaveLength(0);
  });

  it("rolls back when candidate revalidation fails inside RPC", () => {
    const store = baseStore();
    seedBaseOwnership(store);

    const result = executeCommitRpc(store, {
      p_user_id: USER_ID,
      p_plaid_connection_id: CONNECTION_ID,
      p_finance_account_id: ACCOUNT_ID,
      p_finance_transaction_id: "missing-candidate",
      p_provider_transaction_id: "plaid-rollback-candidate",
      p_provider_pending_transaction_id: null,
      p_posted_date: "2026-08-01",
      p_amount: -20,
      p_transaction_type: "expense",
      p_observed_at: "2026-08-06T00:00:00.000Z",
    });

    expect(result).toEqual({ success: false, code: "match_candidate_unavailable" });
    expect(store.plaid_finance_transaction_mappings).toHaveLength(0);
  });

  it("fails closed when RPC detects candidate mapped to another provider", () => {
    const store = baseStore();
    seedBaseOwnership(store);
    store.finance_transactions.push(
      rocketMoneyCandidate({ id: "rm-rpc-conflict", merchant: "Anthropic" }),
    );
    store.plaid_finance_transaction_mappings.push({
      id: "map-rpc-conflict",
      user_id: USER_ID,
      plaid_connection_id: CONNECTION_ID,
      finance_transaction_id: "rm-rpc-conflict",
      provider_transaction_id: "existing-plaid-txn",
      removed_at: null,
    });

    const result = executeCommitRpc(store, {
      p_user_id: USER_ID,
      p_plaid_connection_id: CONNECTION_ID,
      p_finance_account_id: ACCOUNT_ID,
      p_finance_transaction_id: "rm-rpc-conflict",
      p_provider_transaction_id: "new-plaid-txn",
      p_provider_pending_transaction_id: null,
      p_posted_date: "2026-08-01",
      p_amount: -20,
      p_transaction_type: "expense",
      p_observed_at: "2026-08-06T00:00:00.000Z",
    });

    expect(result).toEqual({ success: false, code: "match_candidate_already_mapped" });
    expect(store.plaid_finance_transaction_mappings).toHaveLength(1);
  });

  it("commits mapping and review resolution atomically via RPC", async () => {
    const store = baseStore();
    seedBaseOwnership(store);
    store.finance_transactions.push(
      rocketMoneyCandidate({ id: "rm-atomic", merchant: "Anthropic" }),
    );
    store.plaid_transaction_match_review_items.push({
      id: "review-atomic",
      user_id: USER_ID,
      plaid_connection_id: CONNECTION_ID,
      finance_account_id: ACCOUNT_ID,
      plaid_transaction_id: "plaid-atomic",
      review_status: "pending",
      created_at: "2026-08-01T09:00:00.000Z",
    });

    const supabase = createMockSupabase(store);
    const result = await matchPlaidPostedTransaction(
      supabase,
      USER_ID,
      CONNECTION_ID,
      ACCOUNT_ID,
      postedPlaidInput({ providerTransactionId: "plaid-atomic" }),
    );

    expect(result.outcome).toBe("matched_existing");
    expect(store.plaid_finance_transaction_mappings).toHaveLength(1);
    expect(store.plaid_transaction_match_review_items[0].review_status).toBe("matched_existing");
  });
});

describe("plaid mapping removal safety", () => {
  it("allows voiding source=plaid mappings", () => {
    expect(resolvePlaidMappingRemovalDecision("plaid")).toEqual({
      action: "void_transaction",
    });
  });

  it("protects source=rocket_money_csv mappings", () => {
    expect(resolvePlaidMappingRemovalDecision("rocket_money_csv")).toEqual({
      action: "remove_mapping_only",
    });
  });

  it("fails closed for manual or unknown sources", () => {
    expect(resolvePlaidMappingRemovalDecision("manual")).toEqual({
      action: "fail_closed",
    });
    expect(resolvePlaidMappingRemovalDecision("something-else")).toEqual({
      action: "fail_closed",
    });
  });
});

describe("auto-match scoring thresholds", () => {
  it("requires exact merchant and threshold score for auto-match", () => {
    const candidate = rocketMoneyCandidate({ id: "rm-score", merchant: "Anthropic" });
    const scored = scoreEligibleCandidates(
      postedPlaidInput(),
      [candidate],
      ACCOUNT_ID,
      new Map(),
    );

    expect(scored[0].score).toBeGreaterThanOrEqual(PLAID_AUTO_MATCH_SCORE_THRESHOLD);
    expect(selectAutoMatchCandidate(scored)?.candidate.id).toBe("rm-score");
    expect(normalizeMerchantText("SQ * ANTHROPIC")).not.toBe("");
    expect(hasAmbiguousCandidates(scored)).toBe(false);
  });

  it("requires review when multiple candidates exist regardless of top score", () => {
    const candidates = [
      rocketMoneyCandidate({ id: "rm-top", merchant: "Anthropic", transaction_date: "2026-08-01" }),
      rocketMoneyCandidate({ id: "rm-second", merchant: "Anthropic", transaction_date: "2026-08-02" }),
    ];
    const scored = scoreEligibleCandidates(postedPlaidInput(), candidates, ACCOUNT_ID, new Map());

    expect(scored.length).toBe(2);
    expect(selectAutoMatchCandidate(scored)).toBeNull();
    expect(hasAmbiguousCandidates(scored)).toBe(true);
  });
});
