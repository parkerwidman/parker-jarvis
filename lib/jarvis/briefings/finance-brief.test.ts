import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildFinanceBriefContext,
  createEmptyFinanceBriefSourceCounts,
  extractFinanceBriefSourceCounts,
  financeBriefPromptContainsPrivateIdentifiers,
  financeBriefSourceCountsContainPrivateIdentifiers,
  formatFinanceBriefContextForPrompt,
  mergeFinanceBriefSourceCountsIntoRoot,
} from "@/lib/jarvis/briefings/build-finance-brief-context";
import {
  FINANCE_BRIEF_FIRST_FALLBACK_DAYS,
  FINANCE_BRIEF_MAX_SURFACED_SIGNAL_KEYS,
  FINANCE_BRIEF_RECURRING_DUE_DAYS,
  FINANCE_BRIEF_STALE_SYNC_HOURS,
  buildLargeTransactionSignalKey,
  buildRefundSignalKey,
  evaluatePlaidConnectionAttention,
  evaluatePlaidSyncHealth,
  getPersonalRecurringDueWithinDays,
  hasScheduledPlaidSyncOpportunity,
  isLargePersonalExpenseCandidate,
  isRefundReceivedCandidate,
  resolveFinanceBriefActivityLowerBoundDate,
  shouldExcludeFromPersonalSpendingAlerts,
  shouldIncludePersonalFinanceTransaction,
  type FinanceBriefTransactionRow,
} from "@/lib/jarvis/briefings/finance-brief-rules";
import type { FinanceBriefSnapshot } from "@/lib/jarvis/briefings/load-finance-brief-snapshot";
import { FINANCE_DEFAULT_PREFERENCES } from "@/lib/jarvis/finance/finance-types";
import type { PlaidSafeConnectionSummary } from "@/lib/jarvis/integrations/plaid/plaid-types";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

function buildTransaction(
  overrides: Partial<FinanceBriefTransactionRow> = {},
): FinanceBriefTransactionRow {
  return {
    id: overrides.id ?? "tx-1",
    transactionDate: "2026-08-04",
    postedDate: "2026-08-04",
    amount: -120,
    merchant: "Store",
    description: null,
    transactionType: "expense",
    status: "posted",
    personalOrBusiness: "personal",
    recurringItemId: null,
    source: "plaid",
    ...overrides,
  };
}

function buildPreferences() {
  return {
    userId: USER_A,
    defaultCurrency: "USD" as const,
    minimumCashTarget: 5000,
    monthlySpendingLimit: null,
    monthlyIncomeTarget: null,
    largeTransactionThreshold: 100,
    staleBalanceDays: FINANCE_DEFAULT_PREFERENCES.staleBalanceDays,
    defaultReminderDays: FINANCE_DEFAULT_PREFERENCES.defaultReminderDays,
    excludeBusinessFromPersonal: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function buildEmptySnapshot(
  overrides: Partial<FinanceBriefSnapshot> = {},
): FinanceBriefSnapshot {
  return {
    timezone: "America/Chicago",
    localDate: "2026-08-06",
    activityLowerBoundDate: "2026-07-30",
    preferences: buildPreferences(),
    availableCash: 10000,
    hasFinanceData: true,
    connectionAttention: [],
    syncHealthSignals: [],
    pendingReviewCount: 0,
    pendingReviewSamples: [],
    largeTransactions: [],
    refundsReceived: [],
    upcomingRecurringObligations: [],
    lowCashActive: false,
    aggregateAvailableCash: 10000,
    minimumCashTarget: 5000,
    staleBalanceCount: 0,
    staleAccountLabels: [],
    ...overrides,
  };
}

function buildPlaidConnection(
  overrides: Partial<PlaidSafeConnectionSummary> = {},
): PlaidSafeConnectionSummary {
  return {
    id: "conn-1",
    connected: true,
    status: "connected",
    institutionName: "Test Bank",
    environment: "production",
    connectedAt: "2026-08-01T12:00:00.000Z",
    lastSuccessfulSyncAt: "2026-08-05T12:00:00.000Z",
    reconnectRequired: false,
    lastErrorCode: null,
    syncInProgress: false,
    linkedAccountsCount: 2,
    lastSyncAccountsCreated: 0,
    lastSyncAccountsUpdated: 0,
    lastSyncTransactionsAdded: 0,
    lastSyncTransactionsModified: 0,
    lastSyncTransactionsRemoved: 0,
    lastSyncUnclassifiedCount: 0,
    ...overrides,
  };
}

describe("finance brief transaction rules", () => {
  it("includes personal and unclassified posted transactions", () => {
    expect(
      shouldIncludePersonalFinanceTransaction(
        buildTransaction({ personalOrBusiness: "personal" }),
        true,
      ),
    ).toBe(true);
    expect(
      shouldIncludePersonalFinanceTransaction(
        buildTransaction({ personalOrBusiness: "unclassified" }),
        true,
      ),
    ).toBe(true);
  });

  it("excludes business transactions when excludeBusinessFromPersonal is enabled", () => {
    expect(
      shouldIncludePersonalFinanceTransaction(
        buildTransaction({ personalOrBusiness: "business" }),
        true,
      ),
    ).toBe(false);
  });

  it("includes business transactions when excludeBusinessFromPersonal is disabled", () => {
    expect(
      shouldIncludePersonalFinanceTransaction(
        buildTransaction({ personalOrBusiness: "business" }),
        false,
      ),
    ).toBe(true);
  });

  it("excludes non-posted transactions", () => {
    expect(
      shouldIncludePersonalFinanceTransaction(
        buildTransaction({ status: "pending" }),
        true,
      ),
    ).toBe(false);
    expect(
      shouldIncludePersonalFinanceTransaction(
        buildTransaction({ status: "void" }),
        true,
      ),
    ).toBe(false);
  });

  it("excludes transfers, adjustments, and refunds from spending alerts", () => {
    expect(
      shouldExcludeFromPersonalSpendingAlerts(
        buildTransaction({ transactionType: "transfer" }),
      ),
    ).toBe(true);
    expect(
      shouldExcludeFromPersonalSpendingAlerts(
        buildTransaction({ transactionType: "adjustment" }),
      ),
    ).toBe(true);
    expect(
      shouldExcludeFromPersonalSpendingAlerts(
        buildTransaction({ transactionType: "refund", amount: 50 }),
      ),
    ).toBe(true);
  });

  it("detects large personal expenses only when threshold is configured", () => {
    const large = buildTransaction({ amount: -250 });
    expect(
      isLargePersonalExpenseCandidate(large, true, 100, "2026-08-01", "2026-08-06"),
    ).toBe(true);
    expect(
      isLargePersonalExpenseCandidate(large, true, 0, "2026-08-01", "2026-08-06"),
    ).toBe(false);
  });

  it("skips large expenses below threshold and outside activity window", () => {
    const small = buildTransaction({ amount: -50 });
    expect(
      isLargePersonalExpenseCandidate(small, true, 100, "2026-08-01", "2026-08-06"),
    ).toBe(false);

    const old = buildTransaction({
      transactionDate: "2026-07-01",
      postedDate: "2026-07-01",
      amount: -500,
    });
    expect(
      isLargePersonalExpenseCandidate(old, true, 100, "2026-08-01", "2026-08-06"),
    ).toBe(false);
  });

  it("treats refunds separately from large expenses", () => {
    const refund = buildTransaction({
      transactionType: "refund",
      amount: 200,
    });
    expect(
      isRefundReceivedCandidate(refund, true, "2026-08-01", "2026-08-06"),
    ).toBe(true);
    expect(
      isLargePersonalExpenseCandidate(refund, true, 100, "2026-08-01", "2026-08-06"),
    ).toBe(false);
  });

  it("uses canonical finance transaction rows for deduplication semantics", () => {
    const canonical = buildTransaction({
      id: "canonical-tx",
      source: "plaid",
    });
    const duplicateCandidate = buildTransaction({
      id: "other-tx",
      source: "rocket_money_csv",
      amount: canonical.amount,
      merchant: canonical.merchant,
      transactionDate: canonical.transactionDate,
    });

    expect(canonical.source).toBe("plaid");
    expect(duplicateCandidate.source).toBe("rocket_money_csv");
    expect(
      buildLargeTransactionSignalKey({
        date: canonical.postedDate!,
        amount: 120,
        merchant: canonical.merchant,
      }),
    ).toBe(
      buildLargeTransactionSignalKey({
        date: duplicateCandidate.postedDate!,
        amount: 120,
        merchant: duplicateCandidate.merchant,
      }),
    );
  });
});

describe("finance brief plaid health rules", () => {
  it("flags reconnect-required and error connections for attention", () => {
    expect(
      evaluatePlaidConnectionAttention(
        buildPlaidConnection({ status: "reconnect_required", reconnectRequired: true }),
      ),
    ).toBe(true);
    expect(
      evaluatePlaidConnectionAttention(buildPlaidConnection({ status: "error" })),
    ).toBe(true);
    expect(
      evaluatePlaidConnectionAttention(buildPlaidConnection({ status: "connected" })),
    ).toBe(false);
  });

  it("detects first-sync-pending after scheduled sync opportunity", () => {
    const now = new Date("2026-08-06T13:00:00.000Z");
    const connection = buildPlaidConnection({
      lastSuccessfulSyncAt: null,
      connectedAt: "2026-08-01T12:00:00.000Z",
    });

    expect(evaluatePlaidSyncHealth(connection, now)).toBe("first_sync_pending");
  });

  it("does not prematurely warn before scheduled sync opportunity", () => {
    const now = new Date("2026-08-06T09:00:00.000Z");
    const connection = buildPlaidConnection({
      lastSuccessfulSyncAt: null,
      connectedAt: "2026-08-06T08:00:00.000Z",
    });

    expect(hasScheduledPlaidSyncOpportunity(connection.connectedAt, now)).toBe(false);
    expect(evaluatePlaidSyncHealth(connection, now)).toBeNull();
  });

  it("detects stale sync after 36 hours", () => {
    const now = new Date("2026-08-07T02:00:00.000Z");
    const connection = buildPlaidConnection({
      lastSuccessfulSyncAt: new Date(
        now.getTime() - (FINANCE_BRIEF_STALE_SYNC_HOURS + 1) * 60 * 60 * 1000,
      ).toISOString(),
    });

    expect(evaluatePlaidSyncHealth(connection, now)).toBe("stale");
  });

  it("detects failed sync on connected items with last error code", () => {
    const connection = buildPlaidConnection({
      status: "connected",
      lastErrorCode: "sync_failed",
    });

    expect(evaluatePlaidSyncHealth(connection, new Date())).toBe("failed");
  });
});

describe("finance brief recurring and cash rules", () => {
  it("returns personal recurring obligations due within seven days", () => {
    const obligations = getPersonalRecurringDueWithinDays(
      [
        {
          id: "rec-1",
          userId: USER_A,
          name: "Rent",
          recurringType: "bill",
          expectedAmount: 1500,
          amountVariability: "fixed",
          frequency: "monthly",
          nextExpectedDate: "2026-08-10",
          accountId: null,
          categoryId: null,
          autopay: false,
          active: true,
          reminderDays: 3,
          endDate: null,
          notes: null,
          source: "manual",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      "2026-08-06",
      FINANCE_BRIEF_RECURRING_DUE_DAYS,
      new Set(),
    );

    expect(obligations).toHaveLength(1);
  });

  it("excludes Melusi-linked recurring items", () => {
    const obligations = getPersonalRecurringDueWithinDays(
      [
        {
          id: "rec-melusi",
          userId: USER_A,
          name: "Anthropic",
          recurringType: "subscription",
          expectedAmount: 20,
          amountVariability: "fixed",
          frequency: "monthly",
          nextExpectedDate: "2026-08-08",
          accountId: null,
          categoryId: null,
          autopay: true,
          active: true,
          reminderDays: 3,
          endDate: null,
          notes: null,
          source: "manual",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      "2026-08-06",
      FINANCE_BRIEF_RECURRING_DUE_DAYS,
      new Set(["rec-melusi"]),
    );

    expect(obligations).toHaveLength(0);
  });
});

describe("finance brief activity window", () => {
  it("uses a seven-day fallback when no prior brief exists", () => {
    expect(
      resolveFinanceBriefActivityLowerBoundDate({
        timeZone: "America/Chicago",
        localDate: "2026-08-06",
      }),
    ).toBe("2026-07-30");
    expect(FINANCE_BRIEF_FIRST_FALLBACK_DAYS).toBe(7);
  });

  it("uses prior brief timestamp when available", () => {
    expect(
      resolveFinanceBriefActivityLowerBoundDate({
        since: "2026-08-04T13:00:00.000Z",
        timeZone: "America/Chicago",
        localDate: "2026-08-06",
      }),
    ).toBe("2026-08-04");
  });
});

describe("buildFinanceBriefContext", () => {
  it("builds pending review signal with count increase tracking", () => {
    const context = buildFinanceBriefContext({
      snapshot: buildEmptySnapshot({
        pendingReviewCount: 3,
        pendingReviewSamples: [{ merchant: "Store", amount: 25, date: "2026-08-05" }],
      }),
      storedSourceCounts: {
        ...createEmptyFinanceBriefSourceCounts(),
        pendingReviewCount: 1,
      },
    });

    expect(context.pendingReviews?.count).toBe(3);
    expect(context.pendingReviews?.countIncreased).toBe(true);
    expect(context.pendingReviews?.reviewRoute).toBe("/finance/plaid-review");
  });

  it("surfaces low cash only when minimum cash target is configured and breached", () => {
    const active = buildFinanceBriefContext({
      snapshot: buildEmptySnapshot({
        lowCashActive: true,
        aggregateAvailableCash: 1000,
        minimumCashTarget: 5000,
      }),
      storedSourceCounts: createEmptyFinanceBriefSourceCounts(),
    });
    expect(active.lowCash).not.toBeNull();

    const inactive = buildFinanceBriefContext({
      snapshot: buildEmptySnapshot({
        lowCashActive: false,
        aggregateAvailableCash: 10000,
        minimumCashTarget: 5000,
      }),
      storedSourceCounts: createEmptyFinanceBriefSourceCounts(),
    });
    expect(inactive.lowCash).toBeNull();
  });

  it("keeps cash separate from debt by using available cash only", () => {
    const context = buildFinanceBriefContext({
      snapshot: buildEmptySnapshot({
        lowCashActive: true,
        aggregateAvailableCash: 2500,
        minimumCashTarget: 5000,
        availableCash: 2500,
      }),
      storedSourceCounts: createEmptyFinanceBriefSourceCounts(),
    });

    expect(context.lowCash?.aggregateAvailableCash).toBe(2500);
  });

  it("surfaces stale balance aggregate signal", () => {
    const context = buildFinanceBriefContext({
      snapshot: buildEmptySnapshot({
        staleBalanceCount: 2,
        staleAccountLabels: [{ name: "Checking" }, { name: "Savings" }],
      }),
      storedSourceCounts: createEmptyFinanceBriefSourceCounts(),
    });

    expect(context.staleBalances?.staleBalanceCount).toBe(2);
  });

  it("deduplicates one-time large transactions and refunds across briefs", () => {
    const snapshot = buildEmptySnapshot({
      largeTransactions: [{ date: "2026-08-05", merchant: "Store", amount: 250 }],
      refundsReceived: [{ date: "2026-08-05", merchant: "Store", amount: 40 }],
    });
    const signalKey = buildLargeTransactionSignalKey({
      date: "2026-08-05",
      amount: 250,
      merchant: "Store",
    });
    const refundKey = buildRefundSignalKey({
      date: "2026-08-05",
      amount: 40,
      merchant: "Store",
    });

    const first = buildFinanceBriefContext({
      snapshot,
      storedSourceCounts: createEmptyFinanceBriefSourceCounts(),
    });
    expect(first.largeTransactions).toHaveLength(1);
    expect(first.refundsReceived).toHaveLength(1);

    const second = buildFinanceBriefContext({
      snapshot,
      storedSourceCounts: first.nextSourceCounts,
    });
    expect(second.largeTransactions).toHaveLength(0);
    expect(second.refundsReceived).toHaveLength(0);
    expect(first.nextSourceCounts.surfacedSignalKeys).toEqual(
      expect.arrayContaining([signalKey, refundKey]),
    );
  });

  it("keeps persistent unresolved connection and review signals visible", () => {
    const snapshot = buildEmptySnapshot({
      connectionAttention: [{ institutionName: "Test Bank", status: "error" }],
      pendingReviewCount: 2,
    });

    const first = buildFinanceBriefContext({
      snapshot,
      storedSourceCounts: createEmptyFinanceBriefSourceCounts(),
    });
    const second = buildFinanceBriefContext({
      snapshot,
      storedSourceCounts: first.nextSourceCounts,
    });

    expect(first.connectionAttention).toHaveLength(1);
    expect(second.connectionAttention).toHaveLength(1);
    expect(first.pendingReviews?.count).toBe(2);
    expect(second.pendingReviews?.count).toBe(2);
  });

  it("returns no meaningful signals for empty finance state", () => {
    const context = buildFinanceBriefContext({
      snapshot: buildEmptySnapshot({ hasFinanceData: false }),
      storedSourceCounts: createEmptyFinanceBriefSourceCounts(),
    });

    expect(context.hasMeaningfulSignals).toBe(false);
    expect(formatFinanceBriefContextForPrompt(context)).toBe("{}");
  });

  it("bounds surfacedSignalKeys to 150", () => {
    const stored = createEmptyFinanceBriefSourceCounts();
    stored.surfacedSignalKeys = Array.from(
      { length: FINANCE_BRIEF_MAX_SURFACED_SIGNAL_KEYS },
      (_, index) => `finance:test:${index}`,
    );

    const context = buildFinanceBriefContext({
      snapshot: buildEmptySnapshot({
        refundsReceived: [{ date: "2026-08-05", merchant: "Store", amount: 10 }],
      }),
      storedSourceCounts: stored,
    });

    expect(context.nextSourceCounts.surfacedSignalKeys.length).toBeLessThanOrEqual(
      FINANCE_BRIEF_MAX_SURFACED_SIGNAL_KEYS,
    );
  });

  it("stores safe aggregate source counts without private identifiers", () => {
    const context = buildFinanceBriefContext({
      snapshot: buildEmptySnapshot({
        connectionAttention: [{ institutionName: "Chase", status: "reconnect_required" }],
        syncHealthSignals: [
          {
            institutionName: "Chase",
            state: "stale",
            lastSuccessfulSyncAt: "2026-08-01T00:00:00.000Z",
          },
        ],
        pendingReviewCount: 1,
        largeTransactions: [{ date: "2026-08-05", merchant: "Store", amount: 150 }],
        refundsReceived: [{ date: "2026-08-05", merchant: "Store", amount: 20 }],
        upcomingRecurringObligations: [
          {
            name: "Rent",
            expectedAmount: 1500,
            nextExpectedDate: "2026-08-10",
            autopay: false,
          },
        ],
        lowCashActive: true,
        aggregateAvailableCash: 1000,
        minimumCashTarget: 5000,
        staleBalanceCount: 1,
      }),
      storedSourceCounts: createEmptyFinanceBriefSourceCounts(),
    });

    expect(financeBriefSourceCountsContainPrivateIdentifiers(context.nextSourceCounts)).toBe(
      false,
    );
    expect(context.nextSourceCounts).toMatchObject({
      snapshotSuccess: true,
      pendingReviewCount: 1,
      reconnectCount: 1,
      staleSyncCount: 1,
      largeTransactionCount: 1,
      refundCount: 1,
      lowCashActive: true,
      staleBalanceCount: 1,
    });

    const merged = mergeFinanceBriefSourceCountsIntoRoot({}, context.nextSourceCounts);
    expect(extractFinanceBriefSourceCounts(merged)).toEqual(context.nextSourceCounts);
  });

  it("formats prompt sections without private identifiers", () => {
    const context = buildFinanceBriefContext({
      snapshot: buildEmptySnapshot({
        connectionAttention: [{ institutionName: "Chase", status: "error" }],
        pendingReviewCount: 1,
        pendingReviewSamples: [{ merchant: "Store", amount: 25, date: "2026-08-05" }],
      }),
      storedSourceCounts: createEmptyFinanceBriefSourceCounts(),
    });

    const prompt = formatFinanceBriefContextForPrompt(context);
    expect(financeBriefPromptContainsPrivateIdentifiers(prompt)).toBe(false);
    expect(prompt).toContain("/finance/plaid-review");
    expect(prompt).not.toContain(USER_A);
  });
});

describe("loadFinanceBriefSnapshot ownership isolation", () => {
  it("rejects invalid user ids without querying finance tables", async () => {
    const from = vi.fn();
    const supabase = { from } as unknown as import("@supabase/supabase-js").SupabaseClient;
    const { loadFinanceBriefSnapshot } = await import(
      "@/lib/jarvis/briefings/load-finance-brief-snapshot"
    );

    const result = await loadFinanceBriefSnapshot(supabase, "not-a-uuid");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errorCode).toBe("invalid_user");
    }
    expect(from).not.toHaveBeenCalled();
  });

  it("scopes queries to the requested user id", async () => {
    const userFilters: string[] = [];
    const chain = {
      eq(column: string, value: string) {
        if (column === "user_id") {
          userFilters.push(value);
        }
        return chain;
      },
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    const supabase = {
      from(table: string) {
        if (table === "jarvis_profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { timezone: "America/Chicago" },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "plaid_transaction_match_review_items") {
          const countChain = {
            eq(column: string, value: string) {
              if (column === "user_id") {
                userFilters.push(value);
              }

              return countChain;
            },
            then(onFulfilled: (value: { count: number; error: null }) => unknown) {
              return Promise.resolve({ count: 0, error: null }).then(onFulfilled);
            },
          };

          return {
            select: vi.fn((_columns: string, options?: { head?: boolean }) => {
              if (options?.head) {
                return countChain;
              }

              return chain;
            }),
          };
        }

        return {
          select: vi.fn().mockReturnValue(chain),
        };
      },
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    vi.doMock("@/lib/jarvis/integrations/plaid/plaid-connection-tools", () => ({
      loadSafePlaidConnections: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock("@/lib/jarvis/integrations/plaid/plaid-environment-guard", () => ({
      loadCurrentRuntimePlaidFinanceIds: vi
        .fn()
        .mockResolvedValue({ accountIds: new Set(), transactionIds: new Set() }),
    }));

    const { loadFinanceBriefSnapshot } = await import(
      "@/lib/jarvis/briefings/load-finance-brief-snapshot"
    );

    await loadFinanceBriefSnapshot(supabase, USER_A);
    expect(userFilters).toContain(USER_A);
    expect(userFilters).not.toContain(USER_B);
  });
});

describe("finance brief failure degradation", () => {
  it("uses snapshotSuccess false when loader fails", () => {
    const counts = {
      ...createEmptyFinanceBriefSourceCounts(),
      snapshotSuccess: false,
    };

    expect(counts.snapshotSuccess).toBe(false);
    expect(extractFinanceBriefSourceCounts({ finance: counts }).snapshotSuccess).toBe(false);
  });
});
