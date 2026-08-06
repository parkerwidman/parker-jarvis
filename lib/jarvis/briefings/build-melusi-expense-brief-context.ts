import { createHash } from "crypto";
import type {
  MelusiExpenseBriefRecurringCharge,
  MelusiExpenseBriefRecentImport,
  MelusiExpenseBriefRecentLargeExpense,
  MelusiExpenseBriefRecentRefund,
  MelusiExpenseBriefSnapshot,
} from "@/lib/jarvis/briefings/load-melusi-expense-brief-snapshot";

const MAX_SURFACED_SIGNAL_KEYS = 150;
const MAX_OVERDUE_REMINDER_DAYS = 3;

export type MelusiExpenseBriefSourceCounts = {
  recurringOverheadStateKey: string | null;
  surfacedSignalKeys: string[];
};

export type MelusiExpenseRecurringOverheadSummary = {
  isFirstSnapshot: boolean;
  isStateChange: boolean;
  currentMonthlyRecurringAmount: number;
  currentAnnualRecurringAmount: number;
  estimatedAnnualRecurringRunRate: number;
  estimatedAverageMonthlyOverhead: number;
};

export type MelusiExpenseBriefContext = {
  hasMeaningfulSignals: boolean;
  recurringOverheadSummary: MelusiExpenseRecurringOverheadSummary | null;
  dueSoonCharges: MelusiExpenseBriefRecurringCharge[];
  overdueCharges: MelusiExpenseBriefRecurringCharge[];
  recentRefunds: MelusiExpenseBriefRecentRefund[];
  recentLargeExpenses: MelusiExpenseBriefRecentLargeExpense[];
  recentImports: MelusiExpenseBriefRecentImport[];
  needsReviewCount: number;
  newlySurfacedSignalKeys: string[];
  nextSourceCounts: MelusiExpenseBriefSourceCounts;
};

export type BuildMelusiExpenseBriefContextInput = {
  snapshot: MelusiExpenseBriefSnapshot;
  storedSourceCounts: MelusiExpenseBriefSourceCounts;
  localDate: string;
};

function hashSignalPayload(payload: string): string {
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

function buildRecurringChargeId(
  charge: Pick<MelusiExpenseBriefRecurringCharge, "name" | "nextExpectedDate">,
): string {
  return hashSignalPayload(`${charge.name}\n${charge.nextExpectedDate}`);
}

function buildRefundSignalKey(refund: MelusiExpenseBriefRecentRefund): string {
  return `melusi:rf:${hashSignalPayload(
    `${refund.date}\n${refund.amount}\n${refund.merchant ?? ""}`,
  )}`;
}

function buildLargeExpenseSignalKey(
  expense: MelusiExpenseBriefRecentLargeExpense,
): string {
  return `melusi:le:${hashSignalPayload(
    `${expense.date}\n${expense.amount}\n${expense.merchant ?? ""}`,
  )}`;
}

function buildImportSignalKey(importSummary: MelusiExpenseBriefRecentImport): string {
  return `melusi:im:${hashSignalPayload(
    `${importSummary.completedAt}\n${importSummary.importedCount}\n${importSummary.skippedCount}`,
  )}`;
}

function daysBetweenLocalDates(startLocalDate: string, endLocalDate: string): number {
  const [startYear, startMonth, startDay] = startLocalDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endLocalDate.split("-").map(Number);
  const startMs = Date.UTC(startYear, startMonth - 1, startDay);
  const endMs = Date.UTC(endYear, endMonth - 1, endDay);

  return Math.round((endMs - startMs) / (24 * 60 * 60 * 1000));
}

function isSignalAlreadySurfaced(
  signalKey: string,
  storedSourceCounts: MelusiExpenseBriefSourceCounts,
): boolean {
  return storedSourceCounts.surfacedSignalKeys.includes(signalKey);
}

function mergeSurfacedSignalKeys(
  storedSourceCounts: MelusiExpenseBriefSourceCounts,
  newlySurfacedSignalKeys: string[],
): string[] {
  const merged = [...storedSourceCounts.surfacedSignalKeys];

  for (const signalKey of newlySurfacedSignalKeys) {
    if (!merged.includes(signalKey)) {
      merged.push(signalKey);
    }
  }

  if (merged.length <= MAX_SURFACED_SIGNAL_KEYS) {
    return merged;
  }

  return merged.slice(merged.length - MAX_SURFACED_SIGNAL_KEYS);
}

export function createEmptyMelusiExpenseBriefSourceCounts(): MelusiExpenseBriefSourceCounts {
  return {
    recurringOverheadStateKey: null,
    surfacedSignalKeys: [],
  };
}

export function extractMelusiExpenseSourceCounts(
  sourceCounts: unknown,
): MelusiExpenseBriefSourceCounts {
  const empty = createEmptyMelusiExpenseBriefSourceCounts();

  if (!sourceCounts || typeof sourceCounts !== "object") {
    return empty;
  }

  const root = sourceCounts as Record<string, unknown>;
  const melusiExpenses = root.melusiExpenses;

  if (!melusiExpenses || typeof melusiExpenses !== "object") {
    return empty;
  }

  const stored = melusiExpenses as Record<string, unknown>;
  const recurringOverheadStateKey =
    typeof stored.recurringOverheadStateKey === "string"
      ? stored.recurringOverheadStateKey
      : stored.recurringOverheadStateKey === null
        ? null
        : empty.recurringOverheadStateKey;

  const surfacedSignalKeys = Array.isArray(stored.surfacedSignalKeys)
    ? stored.surfacedSignalKeys.filter(
        (value): value is string => typeof value === "string",
      )
    : empty.surfacedSignalKeys;

  return {
    recurringOverheadStateKey,
    surfacedSignalKeys,
  };
}

export function mergeMelusiExpenseSourceCountsIntoRoot(
  sourceCounts: Record<string, unknown>,
  melusiSourceCounts: MelusiExpenseBriefSourceCounts,
): Record<string, unknown> {
  return {
    ...sourceCounts,
    melusiExpenses: melusiSourceCounts,
  };
}

function filterDueSoonCharges(
  charges: MelusiExpenseBriefRecurringCharge[],
  localDate: string,
  storedSourceCounts: MelusiExpenseBriefSourceCounts,
  newlySurfacedSignalKeys: string[],
): MelusiExpenseBriefRecurringCharge[] {
  const filtered: MelusiExpenseBriefRecurringCharge[] = [];

  for (const charge of charges) {
    const chargeId = buildRecurringChargeId(charge);
    const dueSoonKey = `melusi:ds:${chargeId}`;
    const dueDateKey = `melusi:dd:${chargeId}:${charge.nextExpectedDate}`;
    const includeDueSoon =
      !isSignalAlreadySurfaced(dueSoonKey, storedSourceCounts) &&
      !newlySurfacedSignalKeys.includes(dueSoonKey);
    const includeDueDate =
      charge.nextExpectedDate === localDate &&
      !isSignalAlreadySurfaced(dueDateKey, storedSourceCounts) &&
      !newlySurfacedSignalKeys.includes(dueDateKey);

    if (!includeDueSoon && !includeDueDate) {
      continue;
    }

    filtered.push(charge);

    if (includeDueSoon) {
      newlySurfacedSignalKeys.push(dueSoonKey);
    }

    if (includeDueDate) {
      newlySurfacedSignalKeys.push(dueDateKey);
    }
  }

  return filtered;
}

function filterOverdueCharges(
  charges: MelusiExpenseBriefRecurringCharge[],
  localDate: string,
  storedSourceCounts: MelusiExpenseBriefSourceCounts,
  newlySurfacedSignalKeys: string[],
): MelusiExpenseBriefRecurringCharge[] {
  const filtered: MelusiExpenseBriefRecurringCharge[] = [];

  for (const charge of charges) {
    const overdueDays = daysBetweenLocalDates(charge.nextExpectedDate, localDate);

    if (overdueDays < 1 || overdueDays > MAX_OVERDUE_REMINDER_DAYS) {
      continue;
    }

    const chargeId = buildRecurringChargeId(charge);
    const overdueKey = `melusi:od:${chargeId}:${localDate}`;

    if (
      isSignalAlreadySurfaced(overdueKey, storedSourceCounts) ||
      newlySurfacedSignalKeys.includes(overdueKey)
    ) {
      continue;
    }

    filtered.push(charge);
    newlySurfacedSignalKeys.push(overdueKey);
  }

  return filtered;
}

function filterRecentRefunds(
  refunds: MelusiExpenseBriefRecentRefund[],
  storedSourceCounts: MelusiExpenseBriefSourceCounts,
  newlySurfacedSignalKeys: string[],
): MelusiExpenseBriefRecentRefund[] {
  const filtered: MelusiExpenseBriefRecentRefund[] = [];

  for (const refund of refunds) {
    const signalKey = buildRefundSignalKey(refund);

    if (
      isSignalAlreadySurfaced(signalKey, storedSourceCounts) ||
      newlySurfacedSignalKeys.includes(signalKey)
    ) {
      continue;
    }

    filtered.push(refund);
    newlySurfacedSignalKeys.push(signalKey);
  }

  return filtered;
}

function filterRecentLargeExpenses(
  expenses: MelusiExpenseBriefRecentLargeExpense[],
  storedSourceCounts: MelusiExpenseBriefSourceCounts,
  newlySurfacedSignalKeys: string[],
): MelusiExpenseBriefRecentLargeExpense[] {
  const filtered: MelusiExpenseBriefRecentLargeExpense[] = [];

  for (const expense of expenses) {
    const signalKey = buildLargeExpenseSignalKey(expense);

    if (
      isSignalAlreadySurfaced(signalKey, storedSourceCounts) ||
      newlySurfacedSignalKeys.includes(signalKey)
    ) {
      continue;
    }

    filtered.push(expense);
    newlySurfacedSignalKeys.push(signalKey);
  }

  return filtered;
}

function filterRecentImports(
  imports: MelusiExpenseBriefRecentImport[],
  storedSourceCounts: MelusiExpenseBriefSourceCounts,
  newlySurfacedSignalKeys: string[],
): MelusiExpenseBriefRecentImport[] {
  const filtered: MelusiExpenseBriefRecentImport[] = [];

  for (const importSummary of imports) {
    const signalKey = buildImportSignalKey(importSummary);

    if (
      isSignalAlreadySurfaced(signalKey, storedSourceCounts) ||
      newlySurfacedSignalKeys.includes(signalKey)
    ) {
      continue;
    }

    filtered.push(importSummary);
    newlySurfacedSignalKeys.push(signalKey);
  }

  return filtered;
}

function buildRecurringOverheadSummary(
  snapshot: MelusiExpenseBriefSnapshot,
  storedSourceCounts: MelusiExpenseBriefSourceCounts,
  newlySurfacedSignalKeys: string[],
): MelusiExpenseRecurringOverheadSummary | null {
  if (!snapshot.hasMelusiExpenseData) {
    return null;
  }

  const isFirstSnapshot = storedSourceCounts.recurringOverheadStateKey === null;
  const isStateChange =
    storedSourceCounts.recurringOverheadStateKey !== null &&
    storedSourceCounts.recurringOverheadStateKey !== snapshot.recurringOverheadStateKey;

  if (!isFirstSnapshot && !isStateChange) {
    return null;
  }

  const signalKey = isFirstSnapshot
    ? "melusi:ro:init"
    : `melusi:ro:${hashSignalPayload(snapshot.recurringOverheadStateKey)}`;

  if (
    isSignalAlreadySurfaced(signalKey, storedSourceCounts) ||
    newlySurfacedSignalKeys.includes(signalKey)
  ) {
    return null;
  }

  newlySurfacedSignalKeys.push(signalKey);

  return {
    isFirstSnapshot,
    isStateChange,
    currentMonthlyRecurringAmount: snapshot.currentMonthlyRecurringAmount,
    currentAnnualRecurringAmount: snapshot.currentAnnualRecurringAmount,
    estimatedAnnualRecurringRunRate: snapshot.estimatedAnnualRecurringRunRate,
    estimatedAverageMonthlyOverhead: snapshot.estimatedAverageMonthlyOverhead,
  };
}

export function buildMelusiExpenseBriefContext(
  input: BuildMelusiExpenseBriefContextInput,
): MelusiExpenseBriefContext {
  const newlySurfacedSignalKeys: string[] = [];

  const recurringOverheadSummary = buildRecurringOverheadSummary(
    input.snapshot,
    input.storedSourceCounts,
    newlySurfacedSignalKeys,
  );
  const dueSoonCharges = filterDueSoonCharges(
    input.snapshot.dueSoonRecurringCharges,
    input.localDate,
    input.storedSourceCounts,
    newlySurfacedSignalKeys,
  );
  const overdueCharges = filterOverdueCharges(
    input.snapshot.overdueRecurringCharges,
    input.localDate,
    input.storedSourceCounts,
    newlySurfacedSignalKeys,
  );
  const recentRefunds = filterRecentRefunds(
    input.snapshot.recentOwnerFundedRefunds,
    input.storedSourceCounts,
    newlySurfacedSignalKeys,
  );
  const recentLargeExpenses = filterRecentLargeExpenses(
    input.snapshot.recentLargeOwnerFundedExpenses,
    input.storedSourceCounts,
    newlySurfacedSignalKeys,
  );
  const recentImports = filterRecentImports(
    input.snapshot.recentCompletedImports,
    input.storedSourceCounts,
    newlySurfacedSignalKeys,
  );
  const needsReviewCount = input.snapshot.needsReviewCount;

  const hasMeaningfulSignals =
    recurringOverheadSummary !== null ||
    dueSoonCharges.length > 0 ||
    overdueCharges.length > 0 ||
    recentRefunds.length > 0 ||
    recentLargeExpenses.length > 0 ||
    recentImports.length > 0 ||
    needsReviewCount > 0;

  const nextSourceCounts: MelusiExpenseBriefSourceCounts = {
    recurringOverheadStateKey: input.snapshot.hasMelusiExpenseData
      ? input.snapshot.recurringOverheadStateKey
      : input.storedSourceCounts.recurringOverheadStateKey,
    surfacedSignalKeys: mergeSurfacedSignalKeys(
      input.storedSourceCounts,
      newlySurfacedSignalKeys,
    ),
  };

  return {
    hasMeaningfulSignals,
    recurringOverheadSummary,
    dueSoonCharges,
    overdueCharges,
    recentRefunds,
    recentLargeExpenses,
    recentImports,
    needsReviewCount,
    newlySurfacedSignalKeys,
    nextSourceCounts,
  };
}

export function formatMelusiExpenseBriefContextForPrompt(
  context: MelusiExpenseBriefContext,
): string {
  const payload: Record<string, unknown> = {};

  if (context.recurringOverheadSummary) {
    payload.recurringOverheadSummary = context.recurringOverheadSummary;
  }

  if (context.dueSoonCharges.length > 0) {
    payload.dueSoonRecurringCharges = context.dueSoonCharges;
  }

  if (context.overdueCharges.length > 0) {
    payload.overdueRecurringCharges = context.overdueCharges;
  }

  if (context.recentRefunds.length > 0) {
    payload.recentOwnerFundedRefunds = context.recentRefunds;
  }

  if (context.recentLargeExpenses.length > 0) {
    payload.recentLargeOwnerFundedExpenses = context.recentLargeExpenses;
  }

  if (context.recentImports.length > 0) {
    payload.recentCompletedImports = context.recentImports;
  }

  if (context.needsReviewCount > 0) {
    payload.needsReviewCount = context.needsReviewCount;
  }

  return JSON.stringify(payload, null, 2);
}
