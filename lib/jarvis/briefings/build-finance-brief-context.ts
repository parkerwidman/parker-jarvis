import {
  buildFinanceInstitutionSignalToken,
  buildLargeTransactionSignalKey,
  buildRecurringObligationSignalKey,
  buildRefundSignalKey,
  mergeFinanceBriefSurfacedSignalKeys,
  roundFinanceBriefCurrency,
  type FinanceBriefSyncHealthState,
} from "@/lib/jarvis/briefings/finance-brief-rules";
import type {
  FinanceBriefConnectionAttention,
  FinanceBriefLargeTransaction,
  FinanceBriefPendingReviewSample,
  FinanceBriefRefundReceived,
  FinanceBriefSnapshot,
  FinanceBriefSyncHealthSignal,
  FinanceBriefUpcomingRecurring,
} from "@/lib/jarvis/briefings/load-finance-brief-snapshot";

export type FinanceBriefSourceCounts = {
  snapshotSuccess: boolean;
  signalsGenerated: number;
  pendingReviewCount: number;
  reconnectCount: number;
  staleSyncCount: number;
  firstSyncPendingCount: number;
  syncFailedCount: number;
  upcomingRecurringCount: number;
  largeTransactionCount: number;
  refundCount: number;
  lowCashActive: boolean;
  staleBalanceCount: number;
  surfacedSignalKeys: string[];
};

export type FinanceBriefConnectionAttentionSignal =
  FinanceBriefConnectionAttention & {
    priority: "urgent" | "high";
  };

export type FinanceBriefSyncHealthContextSignal = FinanceBriefSyncHealthSignal & {
  priority: "high";
};

export type FinanceBriefPendingReviewSignal = {
  count: number;
  countIncreased: boolean;
  samples: FinanceBriefPendingReviewSample[];
  reviewRoute: "/finance/plaid-review";
  priority: "high";
};

export type FinanceBriefLowCashSignal = {
  aggregateAvailableCash: number;
  minimumCashTarget: number;
  priority: "high";
};

export type FinanceBriefStaleBalanceSignal = {
  staleBalanceCount: number;
  accountLabels: Array<{ name: string }>;
  priority: "high";
};

export type FinanceBriefLargeTransactionSignal = FinanceBriefLargeTransaction & {
  priority: "informational" | "high";
};

export type FinanceBriefRefundSignal = FinanceBriefRefundReceived & {
  priority: "informational";
};

export type FinanceBriefRecurringObligationSignal = FinanceBriefUpcomingRecurring & {
  priority: "informational";
};

export type FinanceBriefContext = {
  hasMeaningfulSignals: boolean;
  connectionAttention: FinanceBriefConnectionAttentionSignal[];
  syncHealth: FinanceBriefSyncHealthContextSignal[];
  pendingReviews: FinanceBriefPendingReviewSignal | null;
  largeTransactions: FinanceBriefLargeTransactionSignal[];
  refundsReceived: FinanceBriefRefundSignal[];
  upcomingRecurringObligations: FinanceBriefRecurringObligationSignal[];
  lowCash: FinanceBriefLowCashSignal | null;
  staleBalances: FinanceBriefStaleBalanceSignal | null;
  newlySurfacedSignalKeys: string[];
  nextSourceCounts: FinanceBriefSourceCounts;
};

export type BuildFinanceBriefContextInput = {
  snapshot: FinanceBriefSnapshot;
  storedSourceCounts: FinanceBriefSourceCounts;
};

function buildConnectionAttentionSignalKey(
  attention: FinanceBriefConnectionAttention,
): string {
  return `finance:plaid:conn:attention:${buildFinanceInstitutionSignalToken(
    attention.institutionName,
  )}`;
}

function buildSyncHealthSignalKey(
  signal: FinanceBriefSyncHealthSignal,
): string {
  const suffix: Record<FinanceBriefSyncHealthState, string> = {
    first_sync_pending: "first-pending",
    stale: "stale",
    failed: "failed",
  };

  return `finance:plaid:sync:${suffix[signal.state]}:${buildFinanceInstitutionSignalToken(
    signal.institutionName,
  )}`;
}

const PENDING_REVIEW_SIGNAL_KEY = "finance:reviews:pending";
const LOW_CASH_SIGNAL_KEY = "finance:low-cash:active";
const STALE_BALANCE_SIGNAL_KEY = "finance:stale-balances:active";

function connectionAttentionPriority(
  status: FinanceBriefConnectionAttention["status"],
): "urgent" | "high" {
  return status === "reconnect_required" ? "urgent" : "high";
}

function filterPersistentSignals<T>(
  items: T[],
  buildKey: (item: T) => string,
  storedSourceCounts: FinanceBriefSourceCounts,
  newlySurfacedSignalKeys: string[],
): T[] {
  const filtered: T[] = [];

  for (const item of items) {
    const signalKey = buildKey(item);

    if (!storedSourceCounts.surfacedSignalKeys.includes(signalKey)) {
      newlySurfacedSignalKeys.push(signalKey);
    }

    filtered.push(item);
  }

  return filtered;
}

function filterOneTimeSignals<T>(
  items: T[],
  buildKey: (item: T) => string,
  storedSourceCounts: FinanceBriefSourceCounts,
  newlySurfacedSignalKeys: string[],
): T[] {
  const filtered: T[] = [];

  for (const item of items) {
    const signalKey = buildKey(item);

    if (
      storedSourceCounts.surfacedSignalKeys.includes(signalKey) ||
      newlySurfacedSignalKeys.includes(signalKey)
    ) {
      continue;
    }

    filtered.push(item);
    newlySurfacedSignalKeys.push(signalKey);
  }

  return filtered;
}

function buildConnectionAttention(
  snapshot: FinanceBriefSnapshot,
  storedSourceCounts: FinanceBriefSourceCounts,
  newlySurfacedSignalKeys: string[],
): FinanceBriefConnectionAttentionSignal[] {
  return filterPersistentSignals(
    snapshot.connectionAttention,
    buildConnectionAttentionSignalKey,
    storedSourceCounts,
    newlySurfacedSignalKeys,
  ).map((attention) => ({
    ...attention,
    priority: connectionAttentionPriority(attention.status),
  }));
}

function buildSyncHealth(
  snapshot: FinanceBriefSnapshot,
  storedSourceCounts: FinanceBriefSourceCounts,
  newlySurfacedSignalKeys: string[],
): FinanceBriefSyncHealthContextSignal[] {
  return filterPersistentSignals(
    snapshot.syncHealthSignals,
    buildSyncHealthSignalKey,
    storedSourceCounts,
    newlySurfacedSignalKeys,
  ).map((signal) => ({
    ...signal,
    priority: "high" as const,
  }));
}

function buildPendingReviews(
  snapshot: FinanceBriefSnapshot,
  storedSourceCounts: FinanceBriefSourceCounts,
  newlySurfacedSignalKeys: string[],
): FinanceBriefPendingReviewSignal | null {
  if (snapshot.pendingReviewCount <= 0) {
    return null;
  }

  if (!storedSourceCounts.surfacedSignalKeys.includes(PENDING_REVIEW_SIGNAL_KEY)) {
    newlySurfacedSignalKeys.push(PENDING_REVIEW_SIGNAL_KEY);
  }

  const countIncreased =
    snapshot.pendingReviewCount > storedSourceCounts.pendingReviewCount;

  if (countIncreased) {
    const increaseKey = "finance:reviews:increased";
    if (!newlySurfacedSignalKeys.includes(increaseKey)) {
      newlySurfacedSignalKeys.push(increaseKey);
    }
  }

  return {
    count: snapshot.pendingReviewCount,
    countIncreased,
    samples: snapshot.pendingReviewSamples,
    reviewRoute: "/finance/plaid-review",
    priority: "high",
  };
}

function buildLargeTransactionSignals(
  snapshot: FinanceBriefSnapshot,
  storedSourceCounts: FinanceBriefSourceCounts,
  newlySurfacedSignalKeys: string[],
): FinanceBriefLargeTransactionSignal[] {
  return filterOneTimeSignals(
    snapshot.largeTransactions,
    (transaction) =>
      buildLargeTransactionSignalKey({
        date: transaction.date,
        amount: transaction.amount,
        merchant: transaction.merchant,
      }),
    storedSourceCounts,
    newlySurfacedSignalKeys,
  ).map((transaction) => ({
    ...transaction,
    priority: "informational" as const,
  }));
}

function buildRefundSignals(
  snapshot: FinanceBriefSnapshot,
  storedSourceCounts: FinanceBriefSourceCounts,
  newlySurfacedSignalKeys: string[],
): FinanceBriefRefundSignal[] {
  return filterOneTimeSignals(
    snapshot.refundsReceived,
    (refund) =>
      buildRefundSignalKey({
        date: refund.date,
        amount: refund.amount,
        merchant: refund.merchant,
      }),
    storedSourceCounts,
    newlySurfacedSignalKeys,
  ).map((refund) => ({
    ...refund,
    priority: "informational" as const,
  }));
}

function buildRecurringObligationSignals(
  snapshot: FinanceBriefSnapshot,
  storedSourceCounts: FinanceBriefSourceCounts,
  newlySurfacedSignalKeys: string[],
): FinanceBriefRecurringObligationSignal[] {
  return filterOneTimeSignals(
    snapshot.upcomingRecurringObligations,
    (obligation) =>
      buildRecurringObligationSignalKey({
        name: obligation.name,
        nextExpectedDate: obligation.nextExpectedDate,
      }),
    storedSourceCounts,
    newlySurfacedSignalKeys,
  ).map((obligation) => ({
    ...obligation,
    priority: "informational" as const,
  }));
}

function buildLowCashSignal(
  snapshot: FinanceBriefSnapshot,
  storedSourceCounts: FinanceBriefSourceCounts,
  newlySurfacedSignalKeys: string[],
): FinanceBriefLowCashSignal | null {
  if (
    !snapshot.lowCashActive ||
    snapshot.aggregateAvailableCash === null ||
    snapshot.minimumCashTarget === null
  ) {
    return null;
  }

  if (!storedSourceCounts.surfacedSignalKeys.includes(LOW_CASH_SIGNAL_KEY)) {
    newlySurfacedSignalKeys.push(LOW_CASH_SIGNAL_KEY);
  }

  return {
    aggregateAvailableCash: roundFinanceBriefCurrency(snapshot.aggregateAvailableCash),
    minimumCashTarget: roundFinanceBriefCurrency(snapshot.minimumCashTarget),
    priority: "high",
  };
}

function buildStaleBalanceSignal(
  snapshot: FinanceBriefSnapshot,
  storedSourceCounts: FinanceBriefSourceCounts,
  newlySurfacedSignalKeys: string[],
): FinanceBriefStaleBalanceSignal | null {
  if (snapshot.staleBalanceCount <= 0) {
    return null;
  }

  if (!storedSourceCounts.surfacedSignalKeys.includes(STALE_BALANCE_SIGNAL_KEY)) {
    newlySurfacedSignalKeys.push(STALE_BALANCE_SIGNAL_KEY);
  }

  return {
    staleBalanceCount: snapshot.staleBalanceCount,
    accountLabels: snapshot.staleAccountLabels,
    priority: "high",
  };
}

export function createEmptyFinanceBriefSourceCounts(): FinanceBriefSourceCounts {
  return {
    snapshotSuccess: true,
    signalsGenerated: 0,
    pendingReviewCount: 0,
    reconnectCount: 0,
    staleSyncCount: 0,
    firstSyncPendingCount: 0,
    syncFailedCount: 0,
    upcomingRecurringCount: 0,
    largeTransactionCount: 0,
    refundCount: 0,
    lowCashActive: false,
    staleBalanceCount: 0,
    surfacedSignalKeys: [],
  };
}

export function extractFinanceBriefSourceCounts(
  sourceCounts: unknown,
): FinanceBriefSourceCounts {
  const empty = createEmptyFinanceBriefSourceCounts();

  if (!sourceCounts || typeof sourceCounts !== "object") {
    return empty;
  }

  const root = sourceCounts as Record<string, unknown>;
  const finance = root.finance;

  if (!finance || typeof finance !== "object") {
    return empty;
  }

  const stored = finance as Record<string, unknown>;

  return {
    snapshotSuccess:
      typeof stored.snapshotSuccess === "boolean"
        ? stored.snapshotSuccess
        : empty.snapshotSuccess,
    signalsGenerated:
      typeof stored.signalsGenerated === "number"
        ? stored.signalsGenerated
        : empty.signalsGenerated,
    pendingReviewCount:
      typeof stored.pendingReviewCount === "number"
        ? stored.pendingReviewCount
        : empty.pendingReviewCount,
    reconnectCount:
      typeof stored.reconnectCount === "number"
        ? stored.reconnectCount
        : empty.reconnectCount,
    staleSyncCount:
      typeof stored.staleSyncCount === "number"
        ? stored.staleSyncCount
        : empty.staleSyncCount,
    firstSyncPendingCount:
      typeof stored.firstSyncPendingCount === "number"
        ? stored.firstSyncPendingCount
        : empty.firstSyncPendingCount,
    syncFailedCount:
      typeof stored.syncFailedCount === "number"
        ? stored.syncFailedCount
        : empty.syncFailedCount,
    upcomingRecurringCount:
      typeof stored.upcomingRecurringCount === "number"
        ? stored.upcomingRecurringCount
        : empty.upcomingRecurringCount,
    largeTransactionCount:
      typeof stored.largeTransactionCount === "number"
        ? stored.largeTransactionCount
        : empty.largeTransactionCount,
    refundCount:
      typeof stored.refundCount === "number"
        ? stored.refundCount
        : empty.refundCount,
    lowCashActive:
      typeof stored.lowCashActive === "boolean"
        ? stored.lowCashActive
        : empty.lowCashActive,
    staleBalanceCount:
      typeof stored.staleBalanceCount === "number"
        ? stored.staleBalanceCount
        : empty.staleBalanceCount,
    surfacedSignalKeys: Array.isArray(stored.surfacedSignalKeys)
      ? stored.surfacedSignalKeys.filter(
          (value): value is string => typeof value === "string",
        )
      : empty.surfacedSignalKeys,
  };
}

export function mergeFinanceBriefSourceCountsIntoRoot(
  sourceCounts: Record<string, unknown>,
  financeSourceCounts: FinanceBriefSourceCounts,
): Record<string, unknown> {
  return {
    ...sourceCounts,
    finance: financeSourceCounts,
  };
}

export function buildFinanceBriefContext(
  input: BuildFinanceBriefContextInput,
): FinanceBriefContext {
  const newlySurfacedSignalKeys: string[] = [];

  const connectionAttention = buildConnectionAttention(
    input.snapshot,
    input.storedSourceCounts,
    newlySurfacedSignalKeys,
  );
  const syncHealth = buildSyncHealth(
    input.snapshot,
    input.storedSourceCounts,
    newlySurfacedSignalKeys,
  );
  const pendingReviews = buildPendingReviews(
    input.snapshot,
    input.storedSourceCounts,
    newlySurfacedSignalKeys,
  );
  const largeTransactions = buildLargeTransactionSignals(
    input.snapshot,
    input.storedSourceCounts,
    newlySurfacedSignalKeys,
  );
  const refundsReceived = buildRefundSignals(
    input.snapshot,
    input.storedSourceCounts,
    newlySurfacedSignalKeys,
  );
  const upcomingRecurringObligations = buildRecurringObligationSignals(
    input.snapshot,
    input.storedSourceCounts,
    newlySurfacedSignalKeys,
  );
  const lowCash = buildLowCashSignal(
    input.snapshot,
    input.storedSourceCounts,
    newlySurfacedSignalKeys,
  );
  const staleBalances = buildStaleBalanceSignal(
    input.snapshot,
    input.storedSourceCounts,
    newlySurfacedSignalKeys,
  );

  const signalsGenerated =
    connectionAttention.length +
    syncHealth.length +
    (pendingReviews ? 1 : 0) +
    largeTransactions.length +
    refundsReceived.length +
    upcomingRecurringObligations.length +
    (lowCash ? 1 : 0) +
    (staleBalances ? 1 : 0);

  const hasMeaningfulSignals = signalsGenerated > 0;

  const reconnectCount = connectionAttention.filter(
    (attention) => attention.status === "reconnect_required",
  ).length;
  const staleSyncCount = syncHealth.filter((signal) => signal.state === "stale").length;
  const firstSyncPendingCount = syncHealth.filter(
    (signal) => signal.state === "first_sync_pending",
  ).length;
  const syncFailedCount = syncHealth.filter(
    (signal) => signal.state === "failed",
  ).length;

  const nextSourceCounts: FinanceBriefSourceCounts = {
    snapshotSuccess: true,
    signalsGenerated,
    pendingReviewCount: input.snapshot.pendingReviewCount,
    reconnectCount,
    staleSyncCount,
    firstSyncPendingCount,
    syncFailedCount,
    upcomingRecurringCount: upcomingRecurringObligations.length,
    largeTransactionCount: largeTransactions.length,
    refundCount: refundsReceived.length,
    lowCashActive: input.snapshot.lowCashActive,
    staleBalanceCount: input.snapshot.staleBalanceCount,
    surfacedSignalKeys: mergeFinanceBriefSurfacedSignalKeys(
      input.storedSourceCounts.surfacedSignalKeys,
      newlySurfacedSignalKeys,
    ),
  };

  return {
    hasMeaningfulSignals,
    connectionAttention,
    syncHealth,
    pendingReviews,
    largeTransactions,
    refundsReceived,
    upcomingRecurringObligations,
    lowCash,
    staleBalances,
    newlySurfacedSignalKeys,
    nextSourceCounts,
  };
}

export function formatFinanceBriefContextForPrompt(
  context: FinanceBriefContext,
): string {
  const payload: Record<string, unknown> = {};

  if (context.connectionAttention.length > 0) {
    payload.connectionAttention = context.connectionAttention;
  }

  if (context.syncHealth.length > 0) {
    payload.syncHealth = context.syncHealth;
  }

  if (context.pendingReviews) {
    payload.pendingPlaidMatchReviews = context.pendingReviews;
  }

  if (context.largeTransactions.length > 0) {
    payload.largePersonalTransactions = context.largeTransactions;
  }

  if (context.refundsReceived.length > 0) {
    payload.refundsReceived = context.refundsReceived;
  }

  if (context.upcomingRecurringObligations.length > 0) {
    payload.upcomingPersonalRecurringObligations =
      context.upcomingRecurringObligations;
  }

  if (context.lowCash) {
    payload.lowCash = context.lowCash;
  }

  if (context.staleBalances) {
    payload.staleBalances = context.staleBalances;
  }

  return JSON.stringify(payload, null, 2);
}

export function financeBriefSourceCountsContainPrivateIdentifiers(
  sourceCounts: FinanceBriefSourceCounts,
): boolean {
  const uuidPattern =
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

  for (const key of sourceCounts.surfacedSignalKeys) {
    if (uuidPattern.test(key)) {
      return true;
    }
  }

  return false;
}

export function financeBriefPromptContainsPrivateIdentifiers(
  promptSection: string,
): boolean {
  const uuidPattern =
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

  return (
    uuidPattern.test(promptSection) ||
    promptSection.includes("item_id") ||
    promptSection.includes("access_token") ||
    promptSection.includes("plaid_transaction_id")
  );
}
