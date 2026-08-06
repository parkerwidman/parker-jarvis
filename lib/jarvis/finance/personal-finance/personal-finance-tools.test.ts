import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAIN_JARVIS_AGENT,
  MELUSI_JARVIS_AGENT,
} from "@/lib/jarvis/agents/agent-registry";
import {
  getToolsForGroups,
  MAIN_JARVIS_TOOLS,
  MELUSI_JARVIS_TOOLS,
} from "@/lib/jarvis/agents/tool-definitions";
import { FINANCE_DEFAULT_PREFERENCES } from "@/lib/jarvis/finance/finance-types";
import {
  buildPersonalFinancePlaidHealthSummary,
  formatPersonalFinanceLastSyncState,
} from "@/lib/jarvis/finance/personal-finance/personal-finance-plaid-health";
import {
  buildPersonalSpendingCategoryBreakdown,
  buildPersonalSpendingMerchantBreakdown,
  calculatePersonalSpendingTotals,
  resolvePersonalFinanceSpendingDateRange,
  resolveCategoryMaps,
} from "@/lib/jarvis/finance/personal-finance/personal-finance-calculations";
import {
  buildPersonalFinanceToolDiagnosticPayload,
} from "@/lib/jarvis/finance/personal-finance/personal-finance-diagnostics";
import {
  enforcePersonalFinanceOutputLimits,
} from "@/lib/jarvis/finance/personal-finance/personal-finance-output-limits";
import {
  personalFinanceToolOutputContainsPrivateIdentifiers,
  sanitizeDisplayText,
} from "@/lib/jarvis/finance/personal-finance/personal-finance-sanitize";
import {
  getPersonalFinanceSummary,
  getPersonalRecurringCharges,
  getPersonalSpending,
} from "@/lib/jarvis/finance/personal-finance/personal-finance-tools";
import {
  isIdentifiableDebtPayment,
  selectCanonicalPersonalFinanceTransactions,
  shouldIncludeInPersonalSpendingTotals,
  type PersonalFinanceTransactionRow,
} from "@/lib/jarvis/finance/personal-finance/personal-finance-transaction-rules";
import type { PlaidSafeConnectionSummary } from "@/lib/jarvis/integrations/plaid/plaid-types";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

function buildTransaction(
  overrides: Partial<PersonalFinanceTransactionRow> = {},
): PersonalFinanceTransactionRow {
  return {
    id: overrides.id ?? "tx-1",
    accountId: overrides.accountId ?? "acct-1",
    categoryId: overrides.categoryId ?? "cat-food",
    transactionDate: overrides.transactionDate ?? "2026-08-04",
    postedDate: overrides.postedDate ?? "2026-08-04",
    amount: overrides.amount ?? -120,
    merchant: overrides.merchant ?? "Store",
    description: overrides.description ?? null,
    transactionType: overrides.transactionType ?? "expense",
    status: overrides.status ?? "posted",
    personalOrBusiness: overrides.personalOrBusiness ?? "personal",
    recurringItemId: overrides.recurringItemId ?? null,
    source: overrides.source ?? "plaid",
    deduplicationFingerprint: overrides.deduplicationFingerprint ?? "fp-1",
    isPlaidMapped: overrides.isPlaidMapped ?? false,
  };
}

function buildPlaidConnection(
  overrides: Partial<PlaidSafeConnectionSummary> = {},
): PlaidSafeConnectionSummary {
  return {
    id: "conn-1",
    connected: true,
    status: "connected",
    institutionName: "Bank",
    environment: "production",
    connectedAt: "2026-08-01T12:00:00.000Z",
    lastSuccessfulSyncAt: "2026-08-06T10:00:00.000Z",
    reconnectRequired: false,
    lastErrorCode: null,
    syncInProgress: false,
    linkedAccountsCount: 1,
    lastSyncAccountsCreated: 0,
    lastSyncAccountsUpdated: 0,
    lastSyncTransactionsAdded: 0,
    lastSyncTransactionsModified: 0,
    lastSyncTransactionsRemoved: 0,
    lastSyncUnclassifiedCount: 0,
    ...overrides,
  };
}

describe("personal finance tool registration", () => {
  it("registers all three personal finance tools on main Jarvis only", () => {
    const mainToolNames = MAIN_JARVIS_TOOLS.map((tool) => tool.name);
    expect(mainToolNames).toContain("get_personal_finance_summary");
    expect(mainToolNames).toContain("get_personal_spending");
    expect(mainToolNames).toContain("get_personal_recurring_charges");
    expect(MAIN_JARVIS_AGENT.toolGroups).toContain("personal_finance");
  });

  it("does not register personal finance tools on Melusi Jarvis", () => {
    const melusiToolNames = MELUSI_JARVIS_TOOLS.map((tool) => tool.name);
    expect(melusiToolNames).not.toContain("get_personal_finance_summary");
    expect(melusiToolNames).not.toContain("get_personal_spending");
    expect(melusiToolNames).not.toContain("get_personal_recurring_charges");
    expect(MELUSI_JARVIS_AGENT.toolGroups).not.toContain("personal_finance");
  });

  it("keeps get_melusi_expenses on both agents", () => {
    expect(MAIN_JARVIS_TOOLS.map((tool) => tool.name)).toContain("get_melusi_expenses");
    expect(MELUSI_JARVIS_TOOLS.map((tool) => tool.name)).toContain("get_melusi_expenses");
  });

  it("does not expose finance write tools", () => {
    const allMainTools = getToolsForGroups(MAIN_JARVIS_AGENT.toolGroups).map(
      (tool) => tool.name,
    );
    for (const name of allMainTools) {
      expect(name).not.toMatch(/create_finance|update_finance|delete_finance|sync_plaid|plaid_link/i);
    }
  });
});

describe("personal finance transaction rules", () => {
  const slugById = new Map([
    ["cat-food", "food"],
    ["cat-transfer", "transfers"],
    ["cat-debt", "debt-payments"],
  ]);

  it("excludes pending, void, transfer, adjustment, and debt payments", () => {
    expect(
      shouldIncludeInPersonalSpendingTotals(
        buildTransaction({ status: "pending" }),
        true,
        slugById,
        new Set(),
      ),
    ).toBe(false);
    expect(
      shouldIncludeInPersonalSpendingTotals(
        buildTransaction({ status: "void" }),
        true,
        slugById,
        new Set(),
      ),
    ).toBe(false);
    expect(
      shouldIncludeInPersonalSpendingTotals(
        buildTransaction({ transactionType: "transfer" }),
        true,
        slugById,
        new Set(),
      ),
    ).toBe(false);
    expect(
      shouldIncludeInPersonalSpendingTotals(
        buildTransaction({ transactionType: "adjustment", amount: -10 }),
        true,
        slugById,
        new Set(),
      ),
    ).toBe(false);
    expect(
      isIdentifiableDebtPayment(
        buildTransaction({ categoryId: "cat-debt" }),
        slugById,
      ),
    ).toBe(true);
  });

  it("excludes business and Melusi-linked transactions when configured", () => {
    expect(
      shouldIncludeInPersonalSpendingTotals(
        buildTransaction({ personalOrBusiness: "business" }),
        true,
        slugById,
        new Set(),
      ),
    ).toBe(false);
    expect(
      shouldIncludeInPersonalSpendingTotals(
        buildTransaction({ personalOrBusiness: "unclassified" }),
        true,
        slugById,
        new Set(),
      ),
    ).toBe(true);
    expect(
      shouldIncludeInPersonalSpendingTotals(
        buildTransaction({ id: "melusi-tx" }),
        true,
        slugById,
        new Set(["melusi-tx"]),
      ),
    ).toBe(false);
  });

  it("deduplicates plaid and rocket money canonical matches", () => {
    const canonical = selectCanonicalPersonalFinanceTransactions([
      buildTransaction({ id: "plaid-tx", source: "plaid", deduplicationFingerprint: "dup" }),
      buildTransaction({
        id: "rocket-tx",
        source: "rocket_money_csv",
        deduplicationFingerprint: "dup",
      }),
    ]);

    expect(canonical).toHaveLength(1);
    expect(canonical[0].source).toBe("plaid");
  });

  it("prefers mapped rocket money over duplicate plaid rows", () => {
    const canonical = selectCanonicalPersonalFinanceTransactions([
      buildTransaction({ id: "plaid-tx", source: "plaid", deduplicationFingerprint: "dup" }),
      buildTransaction({
        id: "rocket-tx",
        source: "rocket_money_csv",
        deduplicationFingerprint: "dup",
        isPlaidMapped: true,
      }),
    ]);

    expect(canonical).toHaveLength(1);
    expect(canonical[0].source).toBe("rocket_money_csv");
  });
});

describe("personal finance spending calculations", () => {
  const slugById = new Map([
    ["cat-food", "food"],
    ["cat-transfer", "transfers"],
  ]);
  const nameById = new Map([["cat-food", "Food"]]);

  it("defaults to the current calendar month", () => {
    const range = resolvePersonalFinanceSpendingDateRange({
      timeZone: "America/Chicago",
      now: new Date("2026-08-15T18:00:00.000Z"),
    });

    expect(range.ok).toBe(true);
    if (range.ok) {
      expect(range.startDate).toBe("2026-08-01");
      expect(range.endDate).toBe("2026-08-31");
    }
  });

  it("rejects invalid, reversed, and over-limit date ranges", () => {
    expect(
      resolvePersonalFinanceSpendingDateRange({
        startDate: "2026-08-10",
        endDate: "2026-08-01",
        timeZone: "America/Chicago",
      }).ok,
    ).toBe(false);
    expect(
      resolvePersonalFinanceSpendingDateRange({
        startDate: "bad-date",
        endDate: "2026-08-01",
        timeZone: "America/Chicago",
      }).ok,
    ).toBe(false);
    expect(
      resolvePersonalFinanceSpendingDateRange({
        startDate: "2026-05-01",
        endDate: "2026-08-31",
        timeZone: "America/Chicago",
      }).ok,
    ).toBe(false);
  });

  it("calculates spending, refunds, and net totals deterministically", () => {
    const totals = calculatePersonalSpendingTotals(
      [
        buildTransaction({ amount: -100 }),
        buildTransaction({ id: "tx-2", transactionType: "refund", amount: 20 }),
        buildTransaction({ id: "tx-3", transactionType: "transfer", amount: -50 }),
      ],
      "2026-08-01",
      "2026-08-31",
      true,
      slugById,
      new Set(),
    );

    expect(totals.totalSpending).toBe(100);
    expect(totals.totalRefunds).toBe(20);
    expect(totals.netSpending).toBe(80);
    expect(totals.transactionCount).toBe(2);
  });

  it("limits category and merchant groups to 12", () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      buildTransaction({
        id: `tx-${index}`,
        categoryId: `cat-${index}`,
        merchant: `Merchant ${index}`,
        deduplicationFingerprint: `fp-${index}`,
      }),
    );

    const categories = Array.from({ length: 20 }, (_, index) => ({
      id: `cat-${index}`,
      userId: USER_A,
      name: `Category ${index}`,
      slug: `cat-${index}`,
      categoryKind: "expense" as const,
      isSystem: false,
      sortOrder: index,
      active: true,
      createdAt: "",
      updatedAt: "",
    }));

    const maps = resolveCategoryMaps(categories);
    const categoryBreakdown = buildPersonalSpendingCategoryBreakdown(
      many,
      "2026-08-01",
      "2026-08-31",
      true,
      maps.slugById,
      maps.nameById,
      new Set(),
    );
    const merchantBreakdown = buildPersonalSpendingMerchantBreakdown(
      many,
      "2026-08-01",
      "2026-08-31",
      true,
      slugById,
      new Set(),
    );

    expect(categoryBreakdown.length).toBeLessThanOrEqual(12);
    expect(merchantBreakdown.length).toBeLessThanOrEqual(12);
  });
});

describe("personal finance privacy and output limits", () => {
  it("sanitizes display text and detects private identifiers", () => {
    expect(sanitizeDisplayText("  Hello\u0007world  ")).toBe("Hello world");
    expect(
      personalFinanceToolOutputContainsPrivateIdentifiers({
        success: true,
        accountId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toBe(true);
    expect(
      personalFinanceToolOutputContainsPrivateIdentifiers({
        success: true,
        scope: "personal",
        totalCash: 1000,
      }),
    ).toBe(false);
  });

  it("marks truncated output without changing aggregate totals", () => {
    const limited = enforcePersonalFinanceOutputLimits({
      success: true,
      totalSpending: 100,
      transactions: Array.from({ length: 30 }, () => ({
        merchantOrDescription: "Store",
        amount: 1,
        transactionDate: "2026-08-01",
        categoryLabel: "Food",
        transactionType: "expense",
      })),
    });

    expect(limited.resultsLimited).toBe(true);
    expect(limited.totalSpending).toBe(100);
    expect(Array.isArray(limited.transactions)).toBe(true);
    expect((limited.transactions as unknown[]).length).toBeLessThanOrEqual(25);
  });

  it("logs only safe diagnostic metadata", () => {
    const payload = buildPersonalFinanceToolDiagnosticPayload(
      "get_personal_spending",
      JSON.stringify({
        success: true,
        transactionCount: 4,
        totalSpending: 500,
        merchant: "Secret Store",
      }),
    );

    expect(payload).toEqual({
      toolName: "get_personal_spending",
      success: true,
      rowCount: 4,
    });
    expect(JSON.stringify(payload)).not.toContain("Secret Store");
    expect(JSON.stringify(payload)).not.toContain("500");
  });
});

describe("personal finance plaid health", () => {
  it("aggregates safe Plaid health counts", () => {
    const summary = buildPersonalFinancePlaidHealthSummary(
      [
        buildPlaidConnection({ status: "connected" }),
        buildPlaidConnection({
          id: "conn-2",
          status: "reconnect_required",
          reconnectRequired: true,
        }),
        buildPlaidConnection({
          id: "conn-3",
          status: "error",
          lastSuccessfulSyncAt: null,
          connectedAt: "2026-08-01T12:00:00.000Z",
        }),
      ],
      2,
      new Date("2026-08-06T13:00:00.000Z"),
    );

    expect(summary.connectedCount).toBe(1);
    expect(summary.reconnectRequiredCount).toBe(1);
    expect(summary.errorCount).toBe(1);
    expect(summary.pendingReviewCount).toBe(2);
  });

  it("formats last sync as a user-friendly state", () => {
    expect(
      formatPersonalFinanceLastSyncState(null, new Date("2026-08-06T13:00:00.000Z")),
    ).toBe("No successful sync yet");
    expect(
      formatPersonalFinanceLastSyncState(
        "2026-08-06T10:00:00.000Z",
        new Date("2026-08-06T13:00:00.000Z"),
      ),
    ).toBe("Synced today");
  });
});

describe("personal finance tool execution", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("rejects unauthenticated access", async () => {
    const result = await getPersonalFinanceSummary({} as never, "");
    expect(result).toEqual({ success: false, error: "unauthorized" });
  });

  it("returns generic errors only from spending validation", async () => {
    vi.doMock("@/lib/jarvis/finance/personal-finance/load-personal-finance-data", () => ({
      loadPersonalFinanceData: vi.fn(async () => ({
        success: true,
        data: {
          timezone: "America/Chicago",
          preferences: { ...FINANCE_DEFAULT_PREFERENCES, userId: USER_A, createdAt: "", updatedAt: "" },
          accounts: [],
          categories: [],
          transactions: [],
          recurringItems: [],
          melusiTransactionIds: new Set(),
          excludedRecurringItemIds: new Set(),
          categorySlugById: new Map(),
          categoryNameById: new Map(),
          plaidConnections: [],
          pendingReviewCount: 0,
        },
      })),
    }));

    const { getPersonalSpending: getSpending } = await import(
      "@/lib/jarvis/finance/personal-finance/personal-finance-tools"
    );

    await expect(
      getSpending({} as never, USER_A, {
        startDate: "2026-08-10",
        endDate: "2026-08-01",
      }),
    ).resolves.toEqual({ success: false, error: "invalid_date_range" });

    await expect(
      getSpending({} as never, USER_A, { merchant: "   " }),
    ).resolves.toEqual({ success: false, error: "invalid_filter" });
  });

  it("executes read-only tools without approval gating", () => {
    const personalTools = getToolsForGroups(["personal_finance"]);
    expect(personalTools).toHaveLength(3);
    for (const tool of personalTools) {
      expect(tool.name).not.toMatch(/propose_|create_|update_|delete_|sync_/);
      expect(tool.description).toContain("read-only");
    }
  });
});

describe("personal finance ownership isolation", () => {
  it("scopes loader queries to the authenticated user", async () => {
    const userFilters: string[] = [];

    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn(function (this: { _filters: Record<string, string> }, column: string, value: string) {
          if (column === "user_id") {
            userFilters.push(value);
          }
          return this;
        }),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: { timezone: "America/Chicago" }, error: null })),
        is: vi.fn().mockReturnThis(),
      })),
      auth: {},
    };

    vi.doMock("@/lib/jarvis/finance/ensure-finance-foundation", () => ({
      ensureFinanceFoundation: vi.fn(async () => ({
        success: true,
        preferences: { ...FINANCE_DEFAULT_PREFERENCES, userId: USER_A, createdAt: "", updatedAt: "" },
      })),
    }));
    vi.doMock("@/lib/jarvis/integrations/plaid/plaid-connection-tools", () => ({
      loadSafePlaidConnections: vi.fn(async () => []),
    }));
    vi.doMock("@/lib/jarvis/integrations/plaid/plaid-environment-guard", () => ({
      loadCurrentRuntimePlaidFinanceIds: vi.fn(async () => ({
        accountIds: new Set<string>(),
        transactionIds: new Set<string>(),
      })),
    }));
    vi.doMock("@/lib/jarvis/integrations/plaid/load-plaid-transaction-match-review", () => ({
      loadPlaidTransactionMatchReviewPendingCount: vi.fn(async () => 0),
    }));

    const { loadPersonalFinanceData } = await import(
      "@/lib/jarvis/finance/personal-finance/load-personal-finance-data"
    );

    await loadPersonalFinanceData(supabase as never, USER_A, "2026-08-01");
    expect(userFilters.every((value) => value === USER_A)).toBe(true);
    expect(userFilters).not.toContain(USER_B);
  });
});

describe("personal recurring charges", () => {
  it("supports upcoming, overdue, and capped results", async () => {
    const { summarizePersonalRecurringChargesForAgent } = await import(
      "@/lib/jarvis/finance/personal-finance/personal-finance-result-mappers"
    );

    const data = {
      timezone: "America/Chicago",
      preferences: { ...FINANCE_DEFAULT_PREFERENCES, userId: USER_A, createdAt: "", updatedAt: "" },
      accounts: [],
      categories: [],
      transactions: [],
      recurringItems: Array.from({ length: 25 }, (_, index) => ({
        id: `rec-${index}`,
        userId: USER_A,
        name: `Bill ${index}`,
        recurringType: "bill" as const,
        expectedAmount: 10,
        amountVariability: "fixed" as const,
        frequency: "monthly" as const,
        nextExpectedDate: index < 5 ? "2026-08-05" : "2026-08-20",
        accountId: null,
        categoryId: null,
        autopay: false,
        active: true,
        reminderDays: 3,
        endDate: null,
        notes: null,
        source: "manual" as const,
        createdAt: "",
        updatedAt: "",
      })),
      melusiTransactionIds: new Set<string>(),
      excludedRecurringItemIds: new Set(["rec-0"]),
      categorySlugById: new Map(),
      categoryNameById: new Map(),
      plaidConnections: [],
      pendingReviewCount: 0,
    };

    const upcoming = summarizePersonalRecurringChargesForAgent({
      data,
      windowDays: 30,
      status: "upcoming",
      now: new Date("2026-08-06T12:00:00.000Z"),
    });

    expect(upcoming.success).toBe(true);
    expect((upcoming.recurringCharges as unknown[]).length).toBeLessThanOrEqual(20);
    expect(
      (upcoming.recurringCharges as Array<{ label: string }>).some(
        (item) => item.label === "Bill 0",
      ),
    ).toBe(false);
  });
});
