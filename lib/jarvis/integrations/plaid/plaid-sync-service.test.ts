import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Transaction } from "plaid";

import {
  persistPlaidTransactionsCursorForTests,
  processPlaidTransactionsSyncPageForTests,
} from "@/lib/jarvis/integrations/plaid/plaid-sync-service";
import { calendarDayDistance } from "@/lib/jarvis/integrations/plaid/plaid-transaction-match-normalization";
import { PlaidSafeError } from "@/lib/jarvis/integrations/plaid/plaid-types";
import type { SupabaseClient } from "@supabase/supabase-js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONNECTION_ID = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";
const PROVIDER_ACCOUNT_ID = "plaid-account-1";

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

type RpcCreateArgs = {
  p_user_id: string;
  p_plaid_connection_id: string;
  p_finance_account_id: string;
  p_provider_transaction_id: string;
  p_provider_pending_transaction_id: string | null;
  p_transaction_date: string;
  p_posted_date: string | null;
  p_amount: number;
  p_merchant: string | null;
  p_description: string | null;
  p_transaction_type: string;
  p_status: string;
  p_category_id: string | null;
  p_observed_at: string;
};

type RpcOptions = {
  failCommit?: boolean;
  failCreate?: boolean;
  failFinanceInsert?: boolean;
  failMappingInsert?: boolean;
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
  if (options.failCommit) {
    return { success: false, code: "match_commit_failed" };
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
    return { success: false, code: "match_candidate_unavailable" };
  }

  if (amountToCents(Number(candidate.amount)) !== amountToCents(args.p_amount)) {
    return { success: false, code: "match_candidate_ineligible" };
  }

  if (
    !transactionTypesCompatibleRpc(
      args.p_transaction_type,
      String(candidate.transaction_type),
      args.p_amount,
      Number(candidate.amount),
    )
  ) {
    return { success: false, code: "match_candidate_ineligible" };
  }

  const comparisonDate = String(candidate.posted_date ?? candidate.transaction_date);
  const dayDistance = calendarDayDistance(args.p_posted_date, comparisonDate);
  if (dayDistance === null || dayDistance > 3) {
    return { success: false, code: "match_candidate_ineligible" };
  }

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

  if (candidate.account_id === null || candidate.account_id === undefined) {
    candidate.account_id = args.p_finance_account_id;
  }

  if (candidate.posted_date === null || candidate.posted_date === undefined) {
    candidate.posted_date = args.p_posted_date;
  }

  return {
    success: true,
    code: "matched_existing",
    finance_transaction_id: args.p_finance_transaction_id,
  };
}

function validateCreateOwnership(
  store: MockStore,
  args: RpcCreateArgs,
): { success: boolean; code?: string } | null {
  const connection = store.plaid_connections.find((row) => row.id === args.p_plaid_connection_id);
  if (!connection || connection.user_id !== args.p_user_id) {
    return { success: false, code: "plaid_connection_not_found" };
  }

  const account = store.finance_accounts.find((row) => row.id === args.p_finance_account_id);
  if (!account || account.user_id !== args.p_user_id || account.source !== "plaid") {
    return { success: false, code: "finance_account_not_mapped" };
  }

  const accountMapping = store.plaid_finance_account_mappings.find(
    (row) =>
      row.user_id === args.p_user_id &&
      row.plaid_connection_id === args.p_plaid_connection_id &&
      row.finance_account_id === args.p_finance_account_id,
  );
  if (!accountMapping) {
    return { success: false, code: "finance_account_not_mapped" };
  }

  return null;
}

function executeCreateRpc(
  store: MockStore,
  args: RpcCreateArgs,
  options: RpcOptions = {},
): { success: boolean; code?: string; finance_transaction_id?: string } {
  if (options.failCreate) {
    return { success: false, code: "create_failed" };
  }

  const ownershipError = validateCreateOwnership(store, args);
  if (ownershipError) {
    return ownershipError;
  }

  const existingMapping = store.plaid_finance_transaction_mappings.find(
    (row) =>
      row.user_id === args.p_user_id &&
      row.plaid_connection_id === args.p_plaid_connection_id &&
      row.provider_transaction_id === args.p_provider_transaction_id,
  );

  if (existingMapping) {
    const existingFinance = store.finance_transactions.find(
      (row) => row.id === existingMapping.finance_transaction_id,
    );
    if (
      !existingFinance ||
      existingFinance.user_id !== args.p_user_id ||
      existingFinance.source !== "plaid"
    ) {
      return { success: false, code: "provider_transaction_already_mapped" };
    }

    return {
      success: true,
      code: "already_exists",
      finance_transaction_id: String(existingFinance.id),
    };
  }

  if (options.failFinanceInsert) {
    return { success: false, code: "create_failed" };
  }

  const financeTransactionId = createId("plaid-finance");
  store.finance_transactions.push({
    id: financeTransactionId,
    user_id: args.p_user_id,
    account_id: args.p_finance_account_id,
    category_id: args.p_category_id,
    transaction_date: args.p_transaction_date,
    posted_date: args.p_posted_date,
    amount: args.p_amount,
    merchant: args.p_merchant,
    description: args.p_description,
    transaction_type: args.p_transaction_type,
    status: args.p_status,
    notes: null,
    source: "plaid",
    personal_or_business: "unclassified",
  });

  if (options.failMappingInsert) {
    store.finance_transactions.pop();
    return { success: false, code: "create_failed" };
  }

  store.plaid_finance_transaction_mappings.push({
    id: createId("map"),
    user_id: args.p_user_id,
    plaid_connection_id: args.p_plaid_connection_id,
    finance_transaction_id: financeTransactionId,
    provider_transaction_id: args.p_provider_transaction_id,
    provider_pending_transaction_id: args.p_provider_pending_transaction_id,
    provider_observed_at: args.p_observed_at,
    removed_at: null,
  });

  return {
    success: true,
    code: "created",
    finance_transaction_id: financeTransactionId,
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

  const rpc = vi.fn(async (name: string, args: RpcCommitArgs | RpcCreateArgs) => {
    if (name === "commit_plaid_rocket_money_transaction_match") {
      return { data: executeCommitRpc(store, args as RpcCommitArgs, rpcOptions), error: null };
    }

    if (name === "create_plaid_finance_transaction") {
      return { data: executeCreateRpc(store, args as RpcCreateArgs, rpcOptions), error: null };
    }

    return { data: null, error: { message: "unknown_rpc" } };
  });

  return { from, rpc } as unknown as SupabaseClient;
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

function seedBaseOwnership(store: MockStore): void {
  store.plaid_connections.push({
    id: CONNECTION_ID,
    user_id: USER_ID,
    transactions_cursor: "cursor-start",
    institution_name: "Test Bank",
  });
  store.finance_accounts.push({ id: ACCOUNT_ID, user_id: USER_ID, source: "plaid" });
  store.plaid_finance_account_mappings.push({
    id: "mapping-account",
    user_id: USER_ID,
    plaid_connection_id: CONNECTION_ID,
    finance_account_id: ACCOUNT_ID,
    provider_account_id: PROVIDER_ACCOUNT_ID,
  });
}

function accountMappings() {
  return new Map([
    [
      PROVIDER_ACCOUNT_ID,
      {
        id: "mapping-account",
        finance_account_id: ACCOUNT_ID,
        provider_account_id: PROVIDER_ACCOUNT_ID,
      },
    ],
  ]);
}

function buildPlaidTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    account_id: PROVIDER_ACCOUNT_ID,
    amount: 20,
    iso_currency_code: "USD",
    unofficial_currency_code: null,
    date: "2026-08-01",
    authorized_date: "2026-08-01",
    pending: false,
    pending_transaction_id: null,
    transaction_id: "plaid-txn-1",
    merchant_name: "Anthropic",
    name: "ANTHROPIC CLAUDE",
    personal_finance_category: {
      primary: "GENERAL_MERCHANDISE",
      detailed: "GENERAL_MERCHANDISE_OTHER",
      confidence_level: "HIGH",
    },
    ...overrides,
  } as Transaction;
}

function connectionRow() {
  return {
    id: CONNECTION_ID,
    user_id: USER_ID,
    item_id: "item-1",
    institution_id: "ins-1",
    institution_name: "Test Bank",
    encrypted_access_token: "token",
    encryption_version: 1,
    environment: "sandbox" as const,
    status: "connected" as const,
    products: ["transactions"],
    transactions_cursor: "cursor-start",
    last_successful_sync_at: null,
    last_webhook_at: null,
    last_error_code: null,
    last_sync_accounts_created: null,
    last_sync_accounts_updated: null,
    last_sync_transactions_added: null,
    last_sync_transactions_modified: null,
    last_sync_transactions_removed: null,
    last_sync_unclassified_count: null,
    linked_accounts_count: null,
    sync_in_progress_at: null,
    connected_at: null,
    disconnected_at: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  };
}

describe("plaid sync transaction integration", () => {
  let store: MockStore;
  let supabase: SupabaseClient;

  beforeEach(() => {
    store = createEmptyStore();
    seedBaseOwnership(store);
    supabase = createMockSupabase(store);
  });

  it("posted unique high-confidence match creates no Plaid Finance row", async () => {
    store.finance_transactions.push({
      id: "rm-1",
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
    });

    const counts = await processPlaidTransactionsSyncPageForTests(
      supabase,
      USER_ID,
      connectionRow(),
      { added: [buildPlaidTransaction()], modified: [], removed: [] },
      { accountMappings: accountMappings() },
    );

    expect(counts.transactionsMatchedExisting).toBe(1);
    expect(counts.transactionsAdded).toBe(0);
    expect(store.finance_transactions.filter((row) => row.source === "plaid")).toHaveLength(0);
    expect(store.plaid_finance_transaction_mappings).toHaveLength(1);
  });

  it("review_required creates no Finance row", async () => {
    store.finance_transactions.push({
      id: "rm-weak",
      user_id: USER_ID,
      account_id: null,
      transaction_date: "2026-08-01",
      posted_date: null,
      amount: -20,
      merchant: "Random Vendor LLC",
      description: "Some charge",
      transaction_type: "expense",
      status: "posted",
      source: "rocket_money_csv",
    });

    const counts = await processPlaidTransactionsSyncPageForTests(
      supabase,
      USER_ID,
      connectionRow(),
      {
        added: [buildPlaidTransaction({ merchant_name: "Different Shop" })],
        modified: [],
        removed: [],
      },
      { accountMappings: accountMappings() },
    );

    expect(counts.transactionsReviewRequired).toBe(1);
    expect(counts.transactionsAdded).toBe(0);
    expect(store.finance_transactions.filter((row) => row.source === "plaid")).toHaveLength(0);
    expect(store.plaid_transaction_match_review_items).toHaveLength(1);
  });

  it("no_match follows existing Plaid insertion path", async () => {
    const counts = await processPlaidTransactionsSyncPageForTests(
      supabase,
      USER_ID,
      connectionRow(),
      { added: [buildPlaidTransaction()], modified: [], removed: [] },
      { accountMappings: accountMappings() },
    );

    expect(counts.transactionsAdded).toBe(1);
    expect(counts.transactionsMatchedExisting).toBe(0);
    expect(store.finance_transactions.filter((row) => row.source === "plaid")).toHaveLength(1);
    expect(store.plaid_finance_transaction_mappings).toHaveLength(1);
  });

  it("pending transaction bypasses matcher", async () => {
    store.finance_transactions.push({
      id: "rm-1",
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
    });

    const counts = await processPlaidTransactionsSyncPageForTests(
      supabase,
      USER_ID,
      connectionRow(),
      {
        added: [buildPlaidTransaction({ pending: true, date: "2026-08-01" })],
        modified: [],
        removed: [],
      },
      { accountMappings: accountMappings() },
    );

    expect(counts.transactionsAdded).toBe(1);
    expect(counts.transactionsMatchedExisting).toBe(0);
    expect(store.finance_transactions.filter((row) => row.source === "plaid")).toHaveLength(1);
  });

  it("pending-to-posted reconciliation occurs before matching", async () => {
    const pendingId = "plaid-pending-1";
    const postedId = "plaid-posted-1";

    store.finance_transactions.push(
      {
        id: "pending-finance",
        user_id: USER_ID,
        account_id: ACCOUNT_ID,
        transaction_date: "2026-08-01",
        posted_date: null,
        amount: -20,
        merchant: "Anthropic",
        description: null,
        transaction_type: "expense",
        status: "pending",
        source: "plaid",
      },
      {
        id: "rm-1",
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
      },
    );

    store.plaid_finance_transaction_mappings.push({
      id: "pending-map",
      user_id: USER_ID,
      plaid_connection_id: CONNECTION_ID,
      finance_transaction_id: "pending-finance",
      provider_transaction_id: pendingId,
      provider_pending_transaction_id: null,
      provider_observed_at: "2026-08-01T00:00:00.000Z",
      removed_at: null,
    });

    const counts = await processPlaidTransactionsSyncPageForTests(
      supabase,
      USER_ID,
      connectionRow(),
      {
        added: [
          buildPlaidTransaction({
            transaction_id: postedId,
            pending_transaction_id: pendingId,
          }),
        ],
        modified: [],
        removed: [],
      },
      { accountMappings: accountMappings() },
    );

    expect(counts.transactionsMatchedExisting).toBe(1);
    expect(store.finance_transactions.find((row) => row.id === "pending-finance")?.status).toBe(
      "void",
    );
    expect(store.finance_transactions.find((row) => row.id === "rm-1")?.merchant).toBe("Anthropic");
  });

  it("existing source=plaid mapping uses normal update behavior", async () => {
    store.finance_transactions.push({
      id: "plaid-finance",
      user_id: USER_ID,
      account_id: ACCOUNT_ID,
      transaction_date: "2026-08-01",
      posted_date: "2026-08-01",
      amount: -20,
      merchant: "Old Merchant",
      description: null,
      transaction_type: "expense",
      status: "posted",
      source: "plaid",
      category_user_edited: false,
      personal_or_business_user_edited: false,
      notes_user_edited: false,
      personal_or_business: "unclassified",
      category_id: null,
      notes: null,
    });

    store.plaid_finance_transaction_mappings.push({
      id: "plaid-map",
      user_id: USER_ID,
      plaid_connection_id: CONNECTION_ID,
      finance_transaction_id: "plaid-finance",
      provider_transaction_id: "plaid-txn-1",
      provider_pending_transaction_id: null,
      provider_observed_at: "2026-08-01T00:00:00.000Z",
      removed_at: null,
    });

    const counts = await processPlaidTransactionsSyncPageForTests(
      supabase,
      USER_ID,
      connectionRow(),
      {
        added: [],
        modified: [buildPlaidTransaction({ merchant_name: "Anthropic Updated" })],
        removed: [],
      },
      { accountMappings: accountMappings() },
    );

    expect(counts.transactionsModified).toBe(1);
    expect(store.finance_transactions[0].merchant).toBe("Anthropic Updated");
  });

  it("existing Rocket Money mapping preserves canonical fields", async () => {
    store.finance_transactions.push({
      id: "rm-1",
      user_id: USER_ID,
      account_id: ACCOUNT_ID,
      transaction_date: "2026-08-01",
      posted_date: "2026-08-01",
      amount: -20,
      merchant: "Canonical Merchant",
      description: "Keep this",
      transaction_type: "expense",
      status: "posted",
      source: "rocket_money_csv",
    });

    store.plaid_finance_transaction_mappings.push({
      id: "rm-map",
      user_id: USER_ID,
      plaid_connection_id: CONNECTION_ID,
      finance_transaction_id: "rm-1",
      provider_transaction_id: "plaid-txn-1",
      provider_pending_transaction_id: null,
      provider_observed_at: "2026-08-01T00:00:00.000Z",
      removed_at: null,
    });

    const counts = await processPlaidTransactionsSyncPageForTests(
      supabase,
      USER_ID,
      connectionRow(),
      {
        added: [],
        modified: [buildPlaidTransaction({ merchant_name: "Plaid Override Attempt" })],
        removed: [],
      },
      { accountMappings: accountMappings() },
    );

    expect(counts.transactionsMatchedExisting).toBe(1);
    expect(store.finance_transactions[0].merchant).toBe("Canonical Merchant");
    expect(store.finance_transactions[0].description).toBe("Keep this");
  });

  it("modified Rocket Money-mapped transaction does not overwrite fields", async () => {
    store.finance_transactions.push({
      id: "rm-modified",
      user_id: USER_ID,
      account_id: ACCOUNT_ID,
      transaction_date: "2026-08-01",
      posted_date: "2026-08-01",
      amount: -20,
      merchant: "Protected Merchant",
      description: "Protected description",
      transaction_type: "expense",
      status: "posted",
      source: "rocket_money_csv",
    });

    store.plaid_finance_transaction_mappings.push({
      id: "rm-map",
      user_id: USER_ID,
      plaid_connection_id: CONNECTION_ID,
      finance_transaction_id: "rm-modified",
      provider_transaction_id: "plaid-txn-1",
      provider_pending_transaction_id: null,
      provider_observed_at: "2026-08-01T00:00:00.000Z",
      removed_at: null,
    });

    await processPlaidTransactionsSyncPageForTests(
      supabase,
      USER_ID,
      connectionRow(),
      {
        added: [],
        modified: [buildPlaidTransaction({ merchant_name: "Changed By Plaid" })],
        removed: [],
      },
      { accountMappings: accountMappings() },
    );

    expect(store.finance_transactions[0].merchant).toBe("Protected Merchant");
    expect(store.finance_transactions[0].description).toBe("Protected description");
  });

  it("source=plaid removal keeps existing void behavior", async () => {
    store.finance_transactions.push({
      id: "plaid-finance",
      user_id: USER_ID,
      account_id: ACCOUNT_ID,
      transaction_date: "2026-08-01",
      posted_date: "2026-08-01",
      amount: -20,
      merchant: "Anthropic",
      description: null,
      transaction_type: "expense",
      status: "posted",
      source: "plaid",
    });

    store.plaid_finance_transaction_mappings.push({
      id: "plaid-map",
      user_id: USER_ID,
      plaid_connection_id: CONNECTION_ID,
      finance_transaction_id: "plaid-finance",
      provider_transaction_id: "plaid-txn-1",
      provider_pending_transaction_id: null,
      provider_observed_at: "2026-08-01T00:00:00.000Z",
      removed_at: null,
    });

    const counts = await processPlaidTransactionsSyncPageForTests(
      supabase,
      USER_ID,
      connectionRow(),
      {
        added: [],
        modified: [],
        removed: [{ transaction_id: "plaid-txn-1", account_id: PROVIDER_ACCOUNT_ID }],
      },
      { accountMappings: accountMappings() },
    );

    expect(counts.transactionsRemoved).toBe(1);
    expect(store.finance_transactions[0].status).toBe("void");
    expect(store.plaid_finance_transaction_mappings[0].removed_at).not.toBeNull();
  });

  it("Rocket Money-mapped removal removes mapping state only", async () => {
    store.finance_transactions.push({
      id: "rm-1",
      user_id: USER_ID,
      account_id: ACCOUNT_ID,
      transaction_date: "2026-08-01",
      posted_date: "2026-08-01",
      amount: -20,
      merchant: "Canonical Merchant",
      description: "Keep this",
      transaction_type: "expense",
      status: "posted",
      source: "rocket_money_csv",
    });

    store.plaid_finance_transaction_mappings.push({
      id: "rm-map",
      user_id: USER_ID,
      plaid_connection_id: CONNECTION_ID,
      finance_transaction_id: "rm-1",
      provider_transaction_id: "plaid-txn-1",
      provider_pending_transaction_id: null,
      provider_observed_at: "2026-08-01T00:00:00.000Z",
      removed_at: null,
    });

    const counts = await processPlaidTransactionsSyncPageForTests(
      supabase,
      USER_ID,
      connectionRow(),
      {
        added: [],
        modified: [],
        removed: [{ transaction_id: "plaid-txn-1", account_id: PROVIDER_ACCOUNT_ID }],
      },
      { accountMappings: accountMappings() },
    );

    expect(counts.rocketMoneyMappingsRemoved).toBe(1);
    expect(counts.transactionsRemoved).toBe(0);
    expect(store.finance_transactions[0].status).toBe("posted");
    expect(store.plaid_finance_transaction_mappings[0].removed_at).not.toBeNull();
  });

  it("manual/unknown removal fails closed", async () => {
    store.finance_transactions.push({
      id: "manual-finance",
      user_id: USER_ID,
      account_id: ACCOUNT_ID,
      transaction_date: "2026-08-01",
      posted_date: "2026-08-01",
      amount: -20,
      merchant: "Manual",
      description: null,
      transaction_type: "expense",
      status: "posted",
      source: "manual",
    });

    store.plaid_finance_transaction_mappings.push({
      id: "manual-map",
      user_id: USER_ID,
      plaid_connection_id: CONNECTION_ID,
      finance_transaction_id: "manual-finance",
      provider_transaction_id: "plaid-txn-1",
      provider_pending_transaction_id: null,
      provider_observed_at: "2026-08-01T00:00:00.000Z",
      removed_at: null,
    });

    await expect(
      processPlaidTransactionsSyncPageForTests(
        supabase,
        USER_ID,
        connectionRow(),
        {
          added: [],
          modified: [],
          removed: [{ transaction_id: "plaid-txn-1", account_id: PROVIDER_ACCOUNT_ID }],
        },
        { accountMappings: accountMappings() },
      ),
    ).rejects.toBeInstanceOf(PlaidSafeError);
  });

  it("unresolved review becomes removed without deleting candidates", async () => {
    store.plaid_transaction_match_review_items.push({
      id: "review-1",
      user_id: USER_ID,
      plaid_connection_id: CONNECTION_ID,
      finance_account_id: ACCOUNT_ID,
      plaid_transaction_id: "plaid-txn-removed",
      review_status: "pending",
      resolved_at: null,
      resolved_finance_transaction_id: null,
    });

    store.plaid_transaction_match_review_candidates.push({
      id: "candidate-1",
      user_id: USER_ID,
      review_item_id: "review-1",
      finance_transaction_id: "rm-1",
      match_score: 70,
      match_reasons: ["amount"],
      created_at: "2026-08-01T00:00:00.000Z",
    });

    await processPlaidTransactionsSyncPageForTests(
      supabase,
      USER_ID,
      connectionRow(),
      {
        added: [],
        modified: [],
        removed: [{ transaction_id: "plaid-txn-removed", account_id: PROVIDER_ACCOUNT_ID }],
      },
      { accountMappings: accountMappings() },
    );

    expect(store.plaid_transaction_match_review_items[0].review_status).toBe("removed");
    expect(store.plaid_transaction_match_review_items[0].resolved_at).not.toBeNull();
    expect(store.plaid_transaction_match_review_candidates).toHaveLength(1);
  });

  it("review_required allows cursor advancement after full-page success", async () => {
    store.finance_transactions.push({
      id: "rm-weak",
      user_id: USER_ID,
      account_id: null,
      transaction_date: "2026-08-01",
      posted_date: null,
      amount: -20,
      merchant: "Random Vendor LLC",
      description: "Some charge",
      transaction_type: "expense",
      status: "posted",
      source: "rocket_money_csv",
    });

    await processPlaidTransactionsSyncPageForTests(
      supabase,
      USER_ID,
      connectionRow(),
      {
        added: [buildPlaidTransaction({ merchant_name: "Different Shop" })],
        modified: [],
        removed: [],
      },
      { accountMappings: accountMappings() },
    );

    await persistPlaidTransactionsCursorForTests(
      supabase,
      USER_ID,
      CONNECTION_ID,
      "cursor-next",
    );

    expect(store.plaid_connections[0].transactions_cursor).toBe("cursor-next");
  });

  it("matcher failure prevents cursor advancement", async () => {
    store.finance_transactions.push({
      id: "rm-1",
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
    });

    const failingSupabase = createMockSupabase(store, { failCommit: true });

    await expect(
      processPlaidTransactionsSyncPageForTests(
        failingSupabase,
        USER_ID,
        connectionRow(),
        { added: [buildPlaidTransaction()], modified: [], removed: [] },
        { accountMappings: accountMappings() },
      ),
    ).rejects.toBeInstanceOf(PlaidSafeError);

    expect(store.plaid_connections[0].transactions_cursor).toBe("cursor-start");
  });

  it("removal failure prevents cursor advancement", async () => {
    store.finance_transactions.push({
      id: "manual-finance",
      user_id: USER_ID,
      account_id: ACCOUNT_ID,
      transaction_date: "2026-08-01",
      posted_date: "2026-08-01",
      amount: -20,
      merchant: "Manual",
      description: null,
      transaction_type: "expense",
      status: "posted",
      source: "manual",
    });

    store.plaid_finance_transaction_mappings.push({
      id: "manual-map",
      user_id: USER_ID,
      plaid_connection_id: CONNECTION_ID,
      finance_transaction_id: "manual-finance",
      provider_transaction_id: "plaid-txn-1",
      provider_pending_transaction_id: null,
      provider_observed_at: "2026-08-01T00:00:00.000Z",
      removed_at: null,
    });

    await expect(
      processPlaidTransactionsSyncPageForTests(
        supabase,
        USER_ID,
        connectionRow(),
        {
          added: [],
          modified: [],
          removed: [{ transaction_id: "plaid-txn-1", account_id: PROVIDER_ACCOUNT_ID }],
        },
        { accountMappings: accountMappings() },
      ),
    ).rejects.toBeInstanceOf(PlaidSafeError);

    expect(store.plaid_connections[0].transactions_cursor).toBe("cursor-start");
  });

  it("retry after aborted page is idempotent", async () => {
    store.finance_transactions.push({
      id: "rm-1",
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
    });

    const page = { added: [buildPlaidTransaction()], modified: [] as Transaction[], removed: [] };
    const options = { accountMappings: accountMappings() };

    const firstCounts = await processPlaidTransactionsSyncPageForTests(
      supabase,
      USER_ID,
      connectionRow(),
      page,
      options,
    );
    const secondCounts = await processPlaidTransactionsSyncPageForTests(
      supabase,
      USER_ID,
      connectionRow(),
      page,
      options,
    );

    expect(firstCounts.transactionsMatchedExisting).toBe(1);
    expect(secondCounts.transactionsMatchedExisting).toBe(1);
    expect(store.plaid_finance_transaction_mappings).toHaveLength(1);
    expect(store.finance_transactions.filter((row) => row.source === "plaid")).toHaveLength(0);
  });

  it("aggregate result contains no sensitive identifiers or transaction data", async () => {
    const counts = await processPlaidTransactionsSyncPageForTests(
      supabase,
      USER_ID,
      connectionRow(),
      { added: [buildPlaidTransaction()], modified: [], removed: [] },
      { accountMappings: accountMappings() },
    );

    const serialized = JSON.stringify(counts);
    expect(serialized).not.toContain("plaid-txn-1");
    expect(serialized).not.toContain("Anthropic");
    expect(serialized).not.toContain(ACCOUNT_ID);
    expect(serialized).not.toContain(CONNECTION_ID);
    expect(Object.keys(counts)).toEqual([
      "accountsCreated",
      "accountsUpdated",
      "transactionsAdded",
      "transactionsModified",
      "transactionsRemoved",
      "transactionsMatchedExisting",
      "transactionsReviewRequired",
      "rocketMoneyMappingsRemoved",
      "unclassifiedCount",
    ]);
  });
});

describe("plaid finance transaction create rpc", () => {
  let store: MockStore;
  let supabase: SupabaseClient;
  let rpcMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = createEmptyStore();
    seedBaseOwnership(store);
    store.finance_accounts[0].source = "plaid";
    supabase = createMockSupabase(store);
    rpcMock = (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc;
  });

  it("pending transaction uses atomic RPC", async () => {
    await processPlaidTransactionsSyncPageForTests(
      supabase,
      USER_ID,
      connectionRow(),
      {
        added: [buildPlaidTransaction({ pending: true })],
        modified: [],
        removed: [],
      },
      { accountMappings: accountMappings() },
    );

    expect(rpcMock).toHaveBeenCalledWith(
      "create_plaid_finance_transaction",
      expect.objectContaining({
        p_status: "pending",
        p_posted_date: null,
      }),
    );
  });

  it("posted no_match uses atomic RPC", async () => {
    await processPlaidTransactionsSyncPageForTests(
      supabase,
      USER_ID,
      connectionRow(),
      { added: [buildPlaidTransaction()], modified: [], removed: [] },
      { accountMappings: accountMappings() },
    );

    expect(rpcMock).toHaveBeenCalledWith(
      "create_plaid_finance_transaction",
      expect.objectContaining({
        p_status: "posted",
        p_posted_date: "2026-08-01",
      }),
    );
  });

  it("successful RPC creates one Finance row and one mapping", async () => {
    await processPlaidTransactionsSyncPageForTests(
      supabase,
      USER_ID,
      connectionRow(),
      { added: [buildPlaidTransaction()], modified: [], removed: [] },
      { accountMappings: accountMappings() },
    );

    expect(store.finance_transactions.filter((row) => row.source === "plaid")).toHaveLength(1);
    expect(store.plaid_finance_transaction_mappings).toHaveLength(1);
  });

  it("mapping failure rolls back Finance insertion", async () => {
    const failingSupabase = createMockSupabase(store, { failMappingInsert: true });

    await expect(
      processPlaidTransactionsSyncPageForTests(
        failingSupabase,
        USER_ID,
        connectionRow(),
        { added: [buildPlaidTransaction()], modified: [], removed: [] },
        { accountMappings: accountMappings() },
      ),
    ).rejects.toBeInstanceOf(PlaidSafeError);

    expect(store.finance_transactions.filter((row) => row.source === "plaid")).toHaveLength(0);
    expect(store.plaid_finance_transaction_mappings).toHaveLength(0);
  });

  it("Finance insertion failure creates no mapping", async () => {
    const failingSupabase = createMockSupabase(store, { failFinanceInsert: true });

    await expect(
      processPlaidTransactionsSyncPageForTests(
        failingSupabase,
        USER_ID,
        connectionRow(),
        { added: [buildPlaidTransaction()], modified: [], removed: [] },
        { accountMappings: accountMappings() },
      ),
    ).rejects.toBeInstanceOf(PlaidSafeError);

    expect(store.finance_transactions.filter((row) => row.source === "plaid")).toHaveLength(0);
    expect(store.plaid_finance_transaction_mappings).toHaveLength(0);
  });

  it("repeated same-provider call is idempotent", async () => {
    const args: RpcCreateArgs = {
      p_user_id: USER_ID,
      p_plaid_connection_id: CONNECTION_ID,
      p_finance_account_id: ACCOUNT_ID,
      p_provider_transaction_id: "plaid-txn-idempotent",
      p_provider_pending_transaction_id: null,
      p_transaction_date: "2026-08-01",
      p_posted_date: "2026-08-01",
      p_amount: -20,
      p_merchant: "Anthropic",
      p_description: null,
      p_transaction_type: "expense",
      p_status: "posted",
      p_category_id: null,
      p_observed_at: "2026-08-06T00:00:00.000Z",
    };

    const first = executeCreateRpc(store, args);
    const second = executeCreateRpc(store, args);

    expect(first.code).toBe("created");
    expect(second.code).toBe("already_exists");
    expect(store.finance_transactions.filter((row) => row.source === "plaid")).toHaveLength(1);
    expect(store.plaid_finance_transaction_mappings).toHaveLength(1);
  });

  it("concurrent unique conflict returns one canonical result", async () => {
    store.finance_transactions.push({
      id: "existing-plaid",
      user_id: USER_ID,
      account_id: ACCOUNT_ID,
      transaction_date: "2026-08-01",
      posted_date: "2026-08-01",
      amount: -20,
      merchant: "Anthropic",
      description: null,
      transaction_type: "expense",
      status: "posted",
      source: "plaid",
    });
    store.plaid_finance_transaction_mappings.push({
      id: "existing-map",
      user_id: USER_ID,
      plaid_connection_id: CONNECTION_ID,
      finance_transaction_id: "existing-plaid",
      provider_transaction_id: "plaid-txn-race",
      provider_pending_transaction_id: null,
      provider_observed_at: "2026-08-06T00:00:00.000Z",
      removed_at: null,
    });

    const result = executeCreateRpc(store, {
      p_user_id: USER_ID,
      p_plaid_connection_id: CONNECTION_ID,
      p_finance_account_id: ACCOUNT_ID,
      p_provider_transaction_id: "plaid-txn-race",
      p_provider_pending_transaction_id: null,
      p_transaction_date: "2026-08-01",
      p_posted_date: "2026-08-01",
      p_amount: -20,
      p_merchant: "Anthropic",
      p_description: null,
      p_transaction_type: "expense",
      p_status: "posted",
      p_category_id: null,
      p_observed_at: "2026-08-06T00:00:00.000Z",
    });

    expect(result.code).toBe("already_exists");
    expect(result.finance_transaction_id).toBe("existing-plaid");
    expect(store.finance_transactions.filter((row) => row.source === "plaid")).toHaveLength(1);
  });

  it("existing same-provider source=plaid mapping returns existing result", async () => {
    store.finance_transactions.push({
      id: "plaid-existing",
      user_id: USER_ID,
      account_id: ACCOUNT_ID,
      transaction_date: "2026-08-01",
      posted_date: "2026-08-01",
      amount: -20,
      merchant: "Anthropic",
      description: null,
      transaction_type: "expense",
      status: "posted",
      source: "plaid",
    });
    store.plaid_finance_transaction_mappings.push({
      id: "plaid-existing-map",
      user_id: USER_ID,
      plaid_connection_id: CONNECTION_ID,
      finance_transaction_id: "plaid-existing",
      provider_transaction_id: "plaid-txn-existing",
      provider_pending_transaction_id: null,
      provider_observed_at: "2026-08-06T00:00:00.000Z",
      removed_at: null,
    });

    const result = executeCreateRpc(store, {
      p_user_id: USER_ID,
      p_plaid_connection_id: CONNECTION_ID,
      p_finance_account_id: ACCOUNT_ID,
      p_provider_transaction_id: "plaid-txn-existing",
      p_provider_pending_transaction_id: null,
      p_transaction_date: "2026-08-01",
      p_posted_date: "2026-08-01",
      p_amount: -20,
      p_merchant: "Anthropic",
      p_description: null,
      p_transaction_type: "expense",
      p_status: "posted",
      p_category_id: null,
      p_observed_at: "2026-08-06T00:00:00.000Z",
    });

    expect(result.code).toBe("already_exists");
    expect(result.finance_transaction_id).toBe("plaid-existing");
  });

  it("existing Rocket Money mapping cannot be replaced", async () => {
    store.finance_transactions.push({
      id: "rm-existing",
      user_id: USER_ID,
      account_id: ACCOUNT_ID,
      transaction_date: "2026-08-01",
      posted_date: "2026-08-01",
      amount: -20,
      merchant: "Canonical",
      description: null,
      transaction_type: "expense",
      status: "posted",
      source: "rocket_money_csv",
    });
    store.plaid_finance_transaction_mappings.push({
      id: "rm-existing-map",
      user_id: USER_ID,
      plaid_connection_id: CONNECTION_ID,
      finance_transaction_id: "rm-existing",
      provider_transaction_id: "plaid-txn-rm-blocked",
      provider_pending_transaction_id: null,
      provider_observed_at: "2026-08-06T00:00:00.000Z",
      removed_at: null,
    });

    const result = executeCreateRpc(store, {
      p_user_id: USER_ID,
      p_plaid_connection_id: CONNECTION_ID,
      p_finance_account_id: ACCOUNT_ID,
      p_provider_transaction_id: "plaid-txn-rm-blocked",
      p_provider_pending_transaction_id: null,
      p_transaction_date: "2026-08-01",
      p_posted_date: "2026-08-01",
      p_amount: -20,
      p_merchant: "Anthropic",
      p_description: null,
      p_transaction_type: "expense",
      p_status: "posted",
      p_category_id: null,
      p_observed_at: "2026-08-06T00:00:00.000Z",
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("provider_transaction_already_mapped");
    expect(store.finance_transactions.filter((row) => row.source === "plaid")).toHaveLength(0);
  });

  it("manual mapping fails closed", async () => {
    store.finance_transactions.push({
      id: "manual-existing",
      user_id: USER_ID,
      account_id: ACCOUNT_ID,
      transaction_date: "2026-08-01",
      posted_date: "2026-08-01",
      amount: -20,
      merchant: "Manual",
      description: null,
      transaction_type: "expense",
      status: "posted",
      source: "manual",
    });
    store.plaid_finance_transaction_mappings.push({
      id: "manual-existing-map",
      user_id: USER_ID,
      plaid_connection_id: CONNECTION_ID,
      finance_transaction_id: "manual-existing",
      provider_transaction_id: "plaid-txn-manual-blocked",
      provider_pending_transaction_id: null,
      provider_observed_at: "2026-08-06T00:00:00.000Z",
      removed_at: null,
    });

    const result = executeCreateRpc(store, {
      p_user_id: USER_ID,
      p_plaid_connection_id: CONNECTION_ID,
      p_finance_account_id: ACCOUNT_ID,
      p_provider_transaction_id: "plaid-txn-manual-blocked",
      p_provider_pending_transaction_id: null,
      p_transaction_date: "2026-08-01",
      p_posted_date: "2026-08-01",
      p_amount: -20,
      p_merchant: "Anthropic",
      p_description: null,
      p_transaction_type: "expense",
      p_status: "posted",
      p_category_id: null,
      p_observed_at: "2026-08-06T00:00:00.000Z",
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("provider_transaction_already_mapped");
  });

  it("wrong connection/account relationship fails closed", async () => {
    const result = executeCreateRpc(store, {
      p_user_id: USER_ID,
      p_plaid_connection_id: CONNECTION_ID,
      p_finance_account_id: "99999999-9999-4999-8999-999999999999",
      p_provider_transaction_id: "plaid-txn-wrong-account",
      p_provider_pending_transaction_id: null,
      p_transaction_date: "2026-08-01",
      p_posted_date: "2026-08-01",
      p_amount: -20,
      p_merchant: "Anthropic",
      p_description: null,
      p_transaction_type: "expense",
      p_status: "posted",
      p_category_id: null,
      p_observed_at: "2026-08-06T00:00:00.000Z",
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe("finance_account_not_mapped");
  });

  it("retry after a later sync-page failure does not duplicate the created transaction", async () => {
    const page = { added: [buildPlaidTransaction()], modified: [] as Transaction[], removed: [] };
    const options = { accountMappings: accountMappings() };

    await processPlaidTransactionsSyncPageForTests(
      supabase,
      USER_ID,
      connectionRow(),
      page,
      options,
    );

    const retryCounts = await processPlaidTransactionsSyncPageForTests(
      supabase,
      USER_ID,
      connectionRow(),
      page,
      options,
    );

    expect(retryCounts.transactionsAdded).toBe(0);
    expect(retryCounts.transactionsModified).toBe(1);
    expect(store.finance_transactions.filter((row) => row.source === "plaid")).toHaveLength(1);
    expect(store.plaid_finance_transaction_mappings).toHaveLength(1);
  });

  it("create RPC errors contain no sensitive identifiers or transaction data", async () => {
    const result = executeCreateRpc(store, {
      p_user_id: USER_ID,
      p_plaid_connection_id: CONNECTION_ID,
      p_finance_account_id: "99999999-9999-4999-8999-999999999999",
      p_provider_transaction_id: "plaid-txn-secret",
      p_provider_pending_transaction_id: null,
      p_transaction_date: "2026-08-01",
      p_posted_date: "2026-08-01",
      p_amount: -20,
      p_merchant: "Secret Merchant",
      p_description: "Secret description",
      p_transaction_type: "expense",
      p_status: "posted",
      p_category_id: null,
      p_observed_at: "2026-08-06T00:00:00.000Z",
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("plaid-txn-secret");
    expect(serialized).not.toContain("Secret Merchant");
    expect(serialized).not.toContain(ACCOUNT_ID);
    expect(serialized).not.toContain(CONNECTION_ID);
    expect(Object.keys(result)).toEqual(["success", "code"]);
  });
});
