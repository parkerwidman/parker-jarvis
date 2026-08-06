import "server-only";

import { createHash } from "crypto";
import {
  getLocalDateString,
  resolveTimeZone,
} from "@/lib/jarvis/dashboard/command-center-utils";
import type {
  FinanceFrequency,
  FinanceTransactionStatus,
  FinanceTransactionType,
} from "@/lib/jarvis/finance/finance-types";
import type { RocketMoneyFundingSource } from "@/lib/jarvis/finance/rocket-money-import-types";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_DUE_COLLECTION = 10;
const MAX_RECENT_ACTIVITY = 10;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FINANCE_BUSINESS_EXPENSE_DETAIL_COLUMNS =
  "transaction_id, funding_source, classification_status";

const FINANCE_TRANSACTION_COLUMNS =
  "id, transaction_date, posted_date, amount, merchant, transaction_type, status, recurring_item_id, created_at";

const FINANCE_RECURRING_ITEM_COLUMNS =
  "id, name, expected_amount, frequency, next_expected_date, autopay, active, reminder_days, end_date";

const FINANCE_IMPORT_BATCH_COLUMNS =
  "imported_count, skipped_count, completed_at";

const FINANCE_PREFERENCES_COLUMNS = "large_transaction_threshold";

type FinanceBusinessExpenseDetailRow = {
  transaction_id: string;
  funding_source: RocketMoneyFundingSource;
  classification_status: string;
};

type FinanceTransactionRow = {
  id: string;
  transaction_date: string;
  posted_date: string | null;
  amount: unknown;
  merchant: string | null;
  transaction_type: FinanceTransactionType;
  status: FinanceTransactionStatus;
  recurring_item_id: string | null;
  created_at: string;
};

type FinanceRecurringItemRow = {
  id: string;
  name: string;
  expected_amount: unknown;
  frequency: FinanceFrequency;
  next_expected_date: string;
  autopay: boolean;
  active: boolean;
  reminder_days: number;
  end_date: string | null;
};

type FinanceImportBatchRow = {
  imported_count: number;
  skipped_count: number;
  completed_at: string | null;
};

type MelusiExpenseRecord = {
  detail: FinanceBusinessExpenseDetailRow;
  transaction: FinanceTransactionRow;
  amount: number;
};

export type MelusiExpenseBriefRecurringDueState = "overdue" | "due_soon";

export type MelusiExpenseBriefRecurringCharge = {
  name: string;
  expectedAmount: number;
  frequency: FinanceFrequency;
  nextExpectedDate: string;
  reminderDays: number;
  autopay: boolean;
  dueState: MelusiExpenseBriefRecurringDueState;
};

export type MelusiExpenseBriefRecentRefund = {
  date: string;
  merchant: string | null;
  amount: number;
};

export type MelusiExpenseBriefRecentLargeExpense = {
  date: string;
  merchant: string | null;
  amount: number;
};

export type MelusiExpenseBriefRecentImport = {
  completedAt: string;
  importedCount: number;
  skippedCount: number;
};

export type MelusiExpenseBriefSnapshot = {
  timezone: string;
  localDate: string;
  hasMelusiExpenseData: boolean;
  needsReviewCount: number;
  currentMonthlyRecurringAmount: number;
  currentAnnualRecurringAmount: number;
  estimatedAnnualRecurringRunRate: number;
  estimatedAverageMonthlyOverhead: number;
  recurringOverheadStateKey: string;
  dueSoonRecurringCharges: MelusiExpenseBriefRecurringCharge[];
  overdueRecurringCharges: MelusiExpenseBriefRecurringCharge[];
  recentOwnerFundedRefunds: MelusiExpenseBriefRecentRefund[];
  recentLargeOwnerFundedExpenses: MelusiExpenseBriefRecentLargeExpense[];
  recentCompletedImports: MelusiExpenseBriefRecentImport[];
};

export type LoadMelusiExpenseBriefSnapshotOptions = {
  now?: Date;
  since?: string;
};

export type LoadMelusiExpenseBriefSnapshotResult =
  | { success: true; snapshot: MelusiExpenseBriefSnapshot }
  | { success: false; error: string };

function toNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function addDaysToLocalDate(localDate: string, days: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function shouldIncludeInSpendingTotals(transaction: FinanceTransactionRow): boolean {
  return (
    transaction.status === "posted" &&
    transaction.transaction_type !== "transfer" &&
    transaction.transaction_type !== "adjustment"
  );
}

function isPostedExpense(transaction: FinanceTransactionRow, amount: number): boolean {
  return transaction.transaction_type === "expense" && amount < 0;
}

function isPostedRefund(transaction: FinanceTransactionRow, amount: number): boolean {
  return transaction.transaction_type === "refund" && amount > 0;
}

function isActiveRecurringItem(item: FinanceRecurringItemRow, asOfDate: string): boolean {
  if (!item.active) {
    return false;
  }

  if (item.end_date && item.end_date < asOfDate) {
    return false;
  }

  return true;
}

function buildEmptySnapshot(timezone: string, localDate: string): MelusiExpenseBriefSnapshot {
  return {
    timezone,
    localDate,
    hasMelusiExpenseData: false,
    needsReviewCount: 0,
    currentMonthlyRecurringAmount: 0,
    currentAnnualRecurringAmount: 0,
    estimatedAnnualRecurringRunRate: 0,
    estimatedAverageMonthlyOverhead: 0,
    recurringOverheadStateKey: buildRecurringOverheadStateKey({
      currentMonthlyRecurringAmount: 0,
      currentAnnualRecurringAmount: 0,
      activeRecurringCount: 0,
      scheduleEntries: [],
    }),
    dueSoonRecurringCharges: [],
    overdueRecurringCharges: [],
    recentOwnerFundedRefunds: [],
    recentLargeOwnerFundedExpenses: [],
    recentCompletedImports: [],
  };
}

function buildRecurringOverheadStateKey(input: {
  currentMonthlyRecurringAmount: number;
  currentAnnualRecurringAmount: number;
  activeRecurringCount: number;
  scheduleEntries: Array<{
    frequency: FinanceFrequency;
    nextExpectedDate: string;
    reminderDays: number;
    autopay: boolean;
  }>;
}): string {
  const scheduleNormalized = input.scheduleEntries
    .slice()
    .sort((left, right) => {
      const dateDelta = left.nextExpectedDate.localeCompare(right.nextExpectedDate);

      if (dateDelta !== 0) {
        return dateDelta;
      }

      const frequencyDelta = left.frequency.localeCompare(right.frequency);

      if (frequencyDelta !== 0) {
        return frequencyDelta;
      }

      const reminderDaysDelta = left.reminderDays - right.reminderDays;

      if (reminderDaysDelta !== 0) {
        return reminderDaysDelta;
      }

      return Number(left.autopay) - Number(right.autopay);
    })
    .map(
      (entry) =>
        `${entry.frequency}|${entry.nextExpectedDate}|${entry.reminderDays}|${entry.autopay ? 1 : 0}`,
    )
    .join(";");

  const payload = [
    input.currentMonthlyRecurringAmount.toFixed(2),
    input.currentAnnualRecurringAmount.toFixed(2),
    String(input.activeRecurringCount),
    scheduleNormalized,
  ].join("\n");

  return createHash("sha256").update(payload).digest("hex");
}

function calculateRecurringOverhead(
  recurringItems: FinanceRecurringItemRow[],
  asOfDate: string,
): {
  currentMonthlyRecurringAmount: number;
  currentAnnualRecurringAmount: number;
  estimatedAnnualRecurringRunRate: number;
  estimatedAverageMonthlyOverhead: number;
  activeRecurringCount: number;
  scheduleEntries: Array<{
    frequency: FinanceFrequency;
    nextExpectedDate: string;
    reminderDays: number;
    autopay: boolean;
  }>;
} {
  let currentMonthlyRecurringAmount = 0;
  let currentAnnualRecurringAmount = 0;
  let activeRecurringCount = 0;
  const scheduleEntries: Array<{
    frequency: FinanceFrequency;
    nextExpectedDate: string;
    reminderDays: number;
    autopay: boolean;
  }> = [];

  for (const item of recurringItems) {
    const expectedAmount = toNumeric(item.expected_amount);

    if (
      expectedAmount === null ||
      expectedAmount <= 0 ||
      !isActiveRecurringItem(item, asOfDate)
    ) {
      continue;
    }

    if (item.frequency !== "monthly" && item.frequency !== "annual") {
      continue;
    }

    activeRecurringCount += 1;

    if (item.frequency === "monthly") {
      currentMonthlyRecurringAmount += expectedAmount;
    } else {
      currentAnnualRecurringAmount += expectedAmount;
    }

    scheduleEntries.push({
      frequency: item.frequency,
      nextExpectedDate: item.next_expected_date,
      reminderDays: item.reminder_days,
      autopay: item.autopay,
    });
  }

  currentMonthlyRecurringAmount = roundCurrency(currentMonthlyRecurringAmount);
  currentAnnualRecurringAmount = roundCurrency(currentAnnualRecurringAmount);

  const estimatedAnnualRecurringRunRate = roundCurrency(
    currentMonthlyRecurringAmount * 12 + currentAnnualRecurringAmount,
  );
  const estimatedAverageMonthlyOverhead = roundCurrency(
    estimatedAnnualRecurringRunRate / 12,
  );

  return {
    currentMonthlyRecurringAmount,
    currentAnnualRecurringAmount,
    estimatedAnnualRecurringRunRate,
    estimatedAverageMonthlyOverhead,
    activeRecurringCount,
    scheduleEntries,
  };
}

function classifyRecurringChargeDueState(
  nextExpectedDate: string,
  reminderDays: number,
  todayLocal: string,
): MelusiExpenseBriefRecurringDueState | null {
  if (nextExpectedDate < todayLocal) {
    return "overdue";
  }

  const dueSoonEndLocal = addDaysToLocalDate(todayLocal, reminderDays);

  if (nextExpectedDate <= dueSoonEndLocal) {
    return "due_soon";
  }

  return null;
}

function buildDueStateRecurringCharges(
  recurringItems: FinanceRecurringItemRow[],
  asOfDate: string,
  todayLocal: string,
  dueState: MelusiExpenseBriefRecurringDueState,
): MelusiExpenseBriefRecurringCharge[] {
  return recurringItems
    .filter((item) => isActiveRecurringItem(item, asOfDate))
    .map((item) => {
      const dueClassification = classifyRecurringChargeDueState(
        item.next_expected_date,
        item.reminder_days,
        todayLocal,
      );

      if (dueClassification !== dueState) {
        return null;
      }

      return {
        name: item.name,
        expectedAmount: toNumeric(item.expected_amount) ?? 0,
        frequency: item.frequency,
        nextExpectedDate: item.next_expected_date,
        reminderDays: item.reminder_days,
        autopay: item.autopay,
        dueState,
      };
    })
    .filter((item): item is MelusiExpenseBriefRecurringCharge => item !== null)
    .sort((left, right) =>
      left.nextExpectedDate.localeCompare(right.nextExpectedDate),
    )
    .slice(0, MAX_DUE_COLLECTION);
}

function buildRecentOwnerFundedRefunds(
  records: MelusiExpenseRecord[],
  sinceMs: number,
): MelusiExpenseBriefRecentRefund[] {
  return records
    .filter((record) => {
      if (!shouldIncludeInSpendingTotals(record.transaction)) {
        return false;
      }

      if (record.detail.funding_source !== "owner_funded") {
        return false;
      }

      if (!isPostedRefund(record.transaction, record.amount)) {
        return false;
      }

      return new Date(record.transaction.created_at).getTime() >= sinceMs;
    })
    .sort(
      (left, right) =>
        new Date(right.transaction.created_at).getTime() -
        new Date(left.transaction.created_at).getTime(),
    )
    .slice(0, MAX_RECENT_ACTIVITY)
    .map((record) => ({
      date: record.transaction.transaction_date,
      merchant: record.transaction.merchant,
      amount: record.amount,
    }));
}

function buildRecentLargeOwnerFundedExpenses(
  records: MelusiExpenseRecord[],
  sinceMs: number,
  largeTransactionThreshold: number,
): MelusiExpenseBriefRecentLargeExpense[] {
  return records
    .filter((record) => {
      if (!shouldIncludeInSpendingTotals(record.transaction)) {
        return false;
      }

      if (record.detail.funding_source !== "owner_funded") {
        return false;
      }

      if (!isPostedExpense(record.transaction, record.amount)) {
        return false;
      }

      if (Math.abs(record.amount) < largeTransactionThreshold) {
        return false;
      }

      return new Date(record.transaction.created_at).getTime() >= sinceMs;
    })
    .sort(
      (left, right) =>
        new Date(right.transaction.created_at).getTime() -
        new Date(left.transaction.created_at).getTime(),
    )
    .slice(0, MAX_RECENT_ACTIVITY)
    .map((record) => ({
      date: record.transaction.transaction_date,
      merchant: record.transaction.merchant,
      amount: Math.abs(record.amount),
    }));
}

function buildRecentCompletedImports(
  importRows: FinanceImportBatchRow[],
  sinceMs: number,
): MelusiExpenseBriefRecentImport[] {
  return importRows
    .filter((row) => {
      if (!row.completed_at) {
        return false;
      }

      return new Date(row.completed_at).getTime() >= sinceMs;
    })
    .sort(
      (left, right) =>
        new Date(right.completed_at ?? 0).getTime() -
        new Date(left.completed_at ?? 0).getTime(),
    )
    .slice(0, MAX_RECENT_ACTIVITY)
    .map((row) => ({
      completedAt: row.completed_at as string,
      importedCount: row.imported_count,
      skippedCount: row.skipped_count,
    }));
}

export async function loadMelusiExpenseBriefSnapshot(
  supabase: SupabaseClient,
  userId: string,
  options: LoadMelusiExpenseBriefSnapshotOptions = {},
): Promise<LoadMelusiExpenseBriefSnapshotResult> {
  const trimmedUserId = userId.trim();

  if (!trimmedUserId || !UUID_REGEX.test(trimmedUserId)) {
    return {
      success: false,
      error: "Invalid Melusi expense briefing user.",
    };
  }

  const now = options.now ?? new Date();

  if (Number.isNaN(now.getTime())) {
    return {
      success: false,
      error: "Invalid Melusi expense briefing timestamp.",
    };
  }

  let sinceMs: number | null = null;

  if (options.since !== undefined) {
    const parsedSinceMs = new Date(options.since).getTime();

    if (!Number.isFinite(parsedSinceMs)) {
      return {
        success: false,
        error: "Invalid Melusi expense briefing activity window.",
      };
    }

    sinceMs = parsedSinceMs;
  }

  const { data: profileRow, error: profileError } = await supabase
    .from("jarvis_profiles")
    .select("timezone")
    .eq("user_id", trimmedUserId)
    .maybeSingle();

  if (profileError) {
    return {
      success: false,
      error: "Could not load Melusi expense briefing profile settings.",
    };
  }

  const timezone = resolveTimeZone(
    (profileRow as { timezone?: string | null } | null)?.timezone,
  );
  const localDate = getLocalDateString(timezone, now);

  const detailsResult = await supabase
    .from("finance_business_expense_details")
    .select(FINANCE_BUSINESS_EXPENSE_DETAIL_COLUMNS)
    .eq("user_id", trimmedUserId)
    .eq("business_context", "melusi");

  if (detailsResult.error) {
    return {
      success: false,
      error: "Could not load Melusi expense briefing details.",
    };
  }

  const detailRows = (detailsResult.data ?? []) as FinanceBusinessExpenseDetailRow[];

  let largeTransactionThreshold: number | null = null;

  if (sinceMs !== null) {
    const preferencesResult = await supabase
      .from("finance_preferences")
      .select(FINANCE_PREFERENCES_COLUMNS)
      .eq("user_id", trimmedUserId)
      .maybeSingle();

    if (preferencesResult.error) {
      return {
        success: false,
        error: "Could not load Melusi expense briefing preferences.",
      };
    }

    largeTransactionThreshold = toNumeric(
      (preferencesResult.data as { large_transaction_threshold?: unknown } | null)
        ?.large_transaction_threshold,
    );
  }

  const importBatchesPromise =
    sinceMs !== null
      ? supabase
          .from("finance_import_batches")
          .select(FINANCE_IMPORT_BATCH_COLUMNS)
          .eq("user_id", trimmedUserId)
          .eq("source", "rocket_money_csv")
          .eq("status", "completed")
          .gte("completed_at", new Date(sinceMs).toISOString())
          .order("completed_at", { ascending: false })
          .limit(MAX_RECENT_ACTIVITY)
      : Promise.resolve({ data: [], error: null });

  if (detailRows.length === 0) {
    const importBatchesResult = await importBatchesPromise;

    if (importBatchesResult.error) {
      return {
        success: false,
        error: "Could not load Melusi expense briefing import activity.",
      };
    }

    const emptySnapshot = buildEmptySnapshot(timezone, localDate);

    if (sinceMs !== null) {
      emptySnapshot.recentCompletedImports = buildRecentCompletedImports(
        (importBatchesResult.data ?? []) as FinanceImportBatchRow[],
        sinceMs,
      );
    }

    return { success: true, snapshot: emptySnapshot };
  }

  const transactionIds = detailRows.map((row) => row.transaction_id);

  const transactionsResult = await supabase
    .from("finance_transactions")
    .select(FINANCE_TRANSACTION_COLUMNS)
    .eq("user_id", trimmedUserId)
    .in("id", transactionIds);

  if (transactionsResult.error) {
    return {
      success: false,
      error: "Could not load Melusi expense briefing transactions.",
    };
  }

  const transactionById = new Map(
    ((transactionsResult.data ?? []) as FinanceTransactionRow[]).map((row) => [
      row.id,
      row,
    ]),
  );

  const records: MelusiExpenseRecord[] = [];

  for (const detail of detailRows) {
    const transaction = transactionById.get(detail.transaction_id);

    if (!transaction) {
      continue;
    }

    const amount = toNumeric(transaction.amount);

    if (amount === null || amount === 0) {
      continue;
    }

    records.push({ detail, transaction, amount });
  }

  const recurringItemIds = [
    ...new Set(
      records
        .map((record) => record.transaction.recurring_item_id)
        .filter((id): id is string => id !== null),
    ),
  ];

  let recurringItems: FinanceRecurringItemRow[] = [];

  if (recurringItemIds.length > 0) {
    const recurringItemsResult = await supabase
      .from("finance_recurring_items")
      .select(FINANCE_RECURRING_ITEM_COLUMNS)
      .eq("user_id", trimmedUserId)
      .in("id", recurringItemIds);

    if (recurringItemsResult.error) {
      return {
        success: false,
        error: "Could not load Melusi expense briefing recurring items.",
      };
    }

    recurringItems = (recurringItemsResult.data ?? []) as FinanceRecurringItemRow[];
  }

  const importBatchesResult = await importBatchesPromise;

  if (importBatchesResult.error) {
    return {
      success: false,
      error: "Could not load Melusi expense briefing import activity.",
    };
  }

  const activeMelusiRecurringItems = recurringItems.filter((item) =>
    isActiveRecurringItem(item, localDate),
  );
  const recurringOverhead = calculateRecurringOverhead(
    activeMelusiRecurringItems,
    localDate,
  );
  const recurringOverheadStateKey = buildRecurringOverheadStateKey(recurringOverhead);

  const snapshot: MelusiExpenseBriefSnapshot = {
    timezone,
    localDate,
    hasMelusiExpenseData:
      records.length > 0 || activeMelusiRecurringItems.length > 0,
    needsReviewCount: records.filter(
      (record) => record.detail.classification_status === "needs_review",
    ).length,
    currentMonthlyRecurringAmount: recurringOverhead.currentMonthlyRecurringAmount,
    currentAnnualRecurringAmount: recurringOverhead.currentAnnualRecurringAmount,
    estimatedAnnualRecurringRunRate: recurringOverhead.estimatedAnnualRecurringRunRate,
    estimatedAverageMonthlyOverhead: recurringOverhead.estimatedAverageMonthlyOverhead,
    recurringOverheadStateKey,
    dueSoonRecurringCharges: buildDueStateRecurringCharges(
      activeMelusiRecurringItems,
      localDate,
      localDate,
      "due_soon",
    ),
    overdueRecurringCharges: buildDueStateRecurringCharges(
      activeMelusiRecurringItems,
      localDate,
      localDate,
      "overdue",
    ),
    recentOwnerFundedRefunds: [],
    recentLargeOwnerFundedExpenses: [],
    recentCompletedImports: [],
  };

  if (sinceMs !== null) {
    snapshot.recentOwnerFundedRefunds = buildRecentOwnerFundedRefunds(
      records,
      sinceMs,
    );

    if (largeTransactionThreshold !== null && largeTransactionThreshold > 0) {
      snapshot.recentLargeOwnerFundedExpenses = buildRecentLargeOwnerFundedExpenses(
        records,
        sinceMs,
        largeTransactionThreshold,
      );
    }

    snapshot.recentCompletedImports = buildRecentCompletedImports(
      (importBatchesResult.data ?? []) as FinanceImportBatchRow[],
      sinceMs,
    );
  }

  return { success: true, snapshot };
}
