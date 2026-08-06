import "server-only";

import {
  getLocalDateString,
  resolveTimeZone,
} from "@/lib/jarvis/dashboard/command-center-utils";
import { ensureFinanceFoundation } from "@/lib/jarvis/finance/ensure-finance-foundation";
import type {
  FinanceFrequency,
  FinanceTransactionStatus,
  FinanceTransactionType,
} from "@/lib/jarvis/finance/finance-types";
import type {
  RocketMoneyClassificationStatus,
  RocketMoneyCostTreatment,
  RocketMoneyFundingSource,
} from "@/lib/jarvis/finance/rocket-money-import-types";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_EXPENSE_HISTORY = 100;
const MAX_UPCOMING_CHARGES = 20;
const MAX_IMPORT_HISTORY = 10;

const FINANCE_BUSINESS_EXPENSE_DETAIL_COLUMNS =
  "id, transaction_id, business_context, funding_source, cost_treatment, prepaid_months, service_through_date, classification_status, notes";

const FINANCE_TRANSACTION_COLUMNS =
  "id, user_id, category_id, transaction_date, posted_date, amount, merchant, description, transaction_type, status, notes, source, recurring_item_id, created_at";

const FINANCE_RECURRING_ITEM_COLUMNS =
  "id, user_id, name, recurring_type, expected_amount, amount_variability, frequency, next_expected_date, autopay, active, reminder_days, end_date, notes, source";

const FINANCE_IMPORT_BATCH_COLUMNS =
  "id, source, row_count, imported_count, skipped_count, completed_at";

type FinanceBusinessExpenseDetailRow = {
  id: string;
  transaction_id: string;
  business_context: "melusi";
  funding_source: RocketMoneyFundingSource;
  cost_treatment: RocketMoneyCostTreatment;
  prepaid_months: number | null;
  service_through_date: string | null;
  classification_status: RocketMoneyClassificationStatus;
  notes: string | null;
};

type FinanceTransactionRow = {
  id: string;
  user_id: string;
  category_id: string | null;
  transaction_date: string;
  posted_date: string | null;
  amount: unknown;
  merchant: string | null;
  description: string | null;
  transaction_type: FinanceTransactionType;
  status: FinanceTransactionStatus;
  notes: string | null;
  source: "manual" | "plaid" | "rocket_money_csv";
  recurring_item_id: string | null;
  created_at: string;
};

type FinanceRecurringItemRow = {
  id: string;
  user_id: string;
  name: string;
  recurring_type: string;
  expected_amount: unknown;
  amount_variability: string;
  frequency: FinanceFrequency;
  next_expected_date: string;
  autopay: boolean;
  active: boolean;
  reminder_days: number;
  end_date: string | null;
  notes: string | null;
  source: "manual" | "plaid" | "rocket_money_csv";
};

type FinanceImportBatchRow = {
  id: string;
  source: "rocket_money_csv";
  row_count: number;
  imported_count: number;
  skipped_count: number;
  completed_at: string | null;
};

type MelusiExpenseRecord = {
  detail: FinanceBusinessExpenseDetailRow;
  transaction: FinanceTransactionRow;
  amount: number;
};

export type MelusiExpenseHistoryItem = {
  transactionId: string;
  transactionDate: string;
  postedDate: string | null;
  merchant: string | null;
  description: string | null;
  amount: number;
  transactionType: FinanceTransactionType;
  status: FinanceTransactionStatus;
  source: FinanceTransactionRow["source"];
  rocketMoneyCategory: string | null;
  fundingSource: RocketMoneyFundingSource;
  costTreatment: RocketMoneyCostTreatment;
  prepaidMonths: number | null;
  serviceThroughDate: string | null;
  classificationStatus: RocketMoneyClassificationStatus;
  notes: string | null;
  recurringItemId: string | null;
  isRefund: boolean;
};

export type MelusiUpcomingRecurringCharge = {
  recurringItemId: string;
  name: string;
  expectedAmount: number;
  frequency: FinanceFrequency;
  nextExpectedDate: string;
  autopay: boolean;
  reminderDays: number;
  classificationSource: RocketMoneyClassificationStatus | null;
};

export type MelusiExpenseImportHistoryItem = {
  importBatchId: string;
  source: "rocket_money_csv";
  rowCount: number;
  importedCount: number;
  skippedCount: number;
  completedAt: string;
};

export type MelusiExpensesCommandCenterData = {
  timezone: string;
  grossOwnerFundedExpenses: number;
  ownerFundedRefunds: number;
  netOwnerFundedSpending: number;
  oneTimeSpending: number;
  prepaidSpending: number;
  historicalMonthlyRecurringSpending: number;
  historicalAnnualRecurringSpending: number;
  unknownSpending: number;
  currentMonthlyRecurringAmount: number;
  currentAnnualRecurringAmount: number;
  estimatedAnnualRecurringRunRate: number;
  estimatedAverageMonthlyOverhead: number;
  nextExpectedChargeDate: string | null;
  recurringItemCount: number;
  totalExpenseRecordCount: number;
  needsReviewCount: number;
  importedExpenseHistory: MelusiExpenseHistoryItem[];
  upcomingRecurringCharges: MelusiUpcomingRecurringCharge[];
  safeImportHistory: MelusiExpenseImportHistoryItem[];
};

export type LoadMelusiExpensesResult =
  | { success: true; data: MelusiExpensesCommandCenterData }
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

function addCostTreatmentSpending(
  totals: Record<RocketMoneyCostTreatment, number>,
  costTreatment: RocketMoneyCostTreatment,
  delta: number,
): void {
  totals[costTreatment] = roundCurrency((totals[costTreatment] ?? 0) + delta);
}

function buildEmptyCostTreatmentTotals(): Record<RocketMoneyCostTreatment, number> {
  return {
    one_time: 0,
    prepaid: 0,
    monthly_recurring: 0,
    annual_recurring: 0,
    unknown: 0,
  };
}

function mapExpenseHistoryItem(record: MelusiExpenseRecord): MelusiExpenseHistoryItem {
  const { detail, transaction, amount } = record;

  return {
    transactionId: transaction.id,
    transactionDate: transaction.transaction_date,
    postedDate: transaction.posted_date,
    merchant: transaction.merchant,
    description: transaction.description,
    amount,
    transactionType: transaction.transaction_type,
    status: transaction.status,
    source: transaction.source,
    rocketMoneyCategory: null,
    fundingSource: detail.funding_source,
    costTreatment: detail.cost_treatment,
    prepaidMonths: detail.prepaid_months,
    serviceThroughDate: detail.service_through_date,
    classificationStatus: detail.classification_status,
    notes: detail.notes ?? transaction.notes,
    recurringItemId: transaction.recurring_item_id,
    isRefund: isPostedRefund(transaction, amount),
  };
}

function calculateOwnerFundedTotals(records: MelusiExpenseRecord[]): {
  grossOwnerFundedExpenses: number;
  ownerFundedRefunds: number;
  netOwnerFundedSpending: number;
} {
  let grossOwnerFundedExpenses = 0;
  let ownerFundedRefunds = 0;

  for (const record of records) {
    if (!shouldIncludeInSpendingTotals(record.transaction)) {
      continue;
    }

    if (record.detail.funding_source !== "owner_funded") {
      continue;
    }

    if (isPostedExpense(record.transaction, record.amount)) {
      grossOwnerFundedExpenses += Math.abs(record.amount);
      continue;
    }

    if (isPostedRefund(record.transaction, record.amount)) {
      ownerFundedRefunds += record.amount;
    }
  }

  grossOwnerFundedExpenses = roundCurrency(grossOwnerFundedExpenses);
  ownerFundedRefunds = roundCurrency(ownerFundedRefunds);

  return {
    grossOwnerFundedExpenses,
    ownerFundedRefunds,
    netOwnerFundedSpending: roundCurrency(
      grossOwnerFundedExpenses - ownerFundedRefunds,
    ),
  };
}

function calculateCostTreatmentTotals(
  records: MelusiExpenseRecord[],
): Record<RocketMoneyCostTreatment, number> {
  const totals = buildEmptyCostTreatmentTotals();

  for (const record of records) {
    if (!shouldIncludeInSpendingTotals(record.transaction)) {
      continue;
    }

    if (isPostedExpense(record.transaction, record.amount)) {
      addCostTreatmentSpending(
        totals,
        record.detail.cost_treatment,
        Math.abs(record.amount),
      );
      continue;
    }

    if (isPostedRefund(record.transaction, record.amount)) {
      addCostTreatmentSpending(
        totals,
        record.detail.cost_treatment,
        -record.amount,
      );
    }
  }

  for (const key of Object.keys(totals) as RocketMoneyCostTreatment[]) {
    totals[key] = Math.max(0, totals[key]);
  }

  return totals;
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

function calculateRecurringOverhead(
  recurringItems: FinanceRecurringItemRow[],
  asOfDate: string,
): {
  currentMonthlyRecurringAmount: number;
  currentAnnualRecurringAmount: number;
  estimatedAnnualRecurringRunRate: number;
  estimatedAverageMonthlyOverhead: number;
  nextExpectedChargeDate: string | null;
  recurringItemCount: number;
} {
  let currentMonthlyRecurringAmount = 0;
  let currentAnnualRecurringAmount = 0;
  let nextExpectedChargeDate: string | null = null;

  for (const item of recurringItems) {
    const expectedAmount = toNumeric(item.expected_amount);

    if (expectedAmount === null || expectedAmount <= 0 || !isActiveRecurringItem(item, asOfDate)) {
      continue;
    }

    if (item.frequency === "monthly") {
      currentMonthlyRecurringAmount += expectedAmount;
    } else if (item.frequency === "annual") {
      currentAnnualRecurringAmount += expectedAmount;
    }

    if (
      nextExpectedChargeDate === null ||
      item.next_expected_date < nextExpectedChargeDate
    ) {
      nextExpectedChargeDate = item.next_expected_date;
    }
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
    nextExpectedChargeDate,
    recurringItemCount: recurringItems.length,
  };
}

function buildUpcomingRecurringCharges(
  recurringItems: FinanceRecurringItemRow[],
  classificationByRecurringItemId: Map<string, RocketMoneyClassificationStatus>,
  asOfDate: string,
): MelusiUpcomingRecurringCharge[] {
  return recurringItems
    .filter((item) => isActiveRecurringItem(item, asOfDate))
    .map((item) => {
      const expectedAmount = toNumeric(item.expected_amount) ?? 0;

      return {
        recurringItemId: item.id,
        name: item.name,
        expectedAmount,
        frequency: item.frequency,
        nextExpectedDate: item.next_expected_date,
        autopay: item.autopay,
        reminderDays: item.reminder_days,
        classificationSource:
          classificationByRecurringItemId.get(item.id) ?? null,
      };
    })
    .sort((left, right) =>
      left.nextExpectedDate.localeCompare(right.nextExpectedDate),
    )
    .slice(0, MAX_UPCOMING_CHARGES);
}

function buildExpenseHistory(records: MelusiExpenseRecord[]): MelusiExpenseHistoryItem[] {
  return records
    .slice()
    .sort((left, right) => {
      const dateDelta = right.transaction.transaction_date.localeCompare(
        left.transaction.transaction_date,
      );

      if (dateDelta !== 0) {
        return dateDelta;
      }

      return right.transaction.created_at.localeCompare(left.transaction.created_at);
    })
    .slice(0, MAX_EXPENSE_HISTORY)
    .map(mapExpenseHistoryItem);
}

function mapImportHistoryRow(row: FinanceImportBatchRow): MelusiExpenseImportHistoryItem | null {
  if (!row.completed_at) {
    return null;
  }

  return {
    importBatchId: row.id,
    source: row.source,
    rowCount: row.row_count,
    importedCount: row.imported_count,
    skippedCount: row.skipped_count,
    completedAt: row.completed_at,
  };
}

export async function loadMelusiExpenses(
  supabase: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<LoadMelusiExpensesResult> {
  const foundation = await ensureFinanceFoundation(supabase, userId);

  if (!foundation.success) {
    return { success: false, error: foundation.error };
  }

  const { data: profileRow, error: profileError } = await supabase
    .from("jarvis_profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    return { success: false, error: "Could not load Melusi expense profile settings." };
  }

  const timezone = resolveTimeZone(
    (profileRow as { timezone?: string | null } | null)?.timezone,
  );
  const asOfDate = getLocalDateString(timezone, now);

  const [detailsResult, importBatchesResult] = await Promise.all([
    supabase
      .from("finance_business_expense_details")
      .select(FINANCE_BUSINESS_EXPENSE_DETAIL_COLUMNS)
      .eq("user_id", userId)
      .eq("business_context", "melusi"),
    supabase
      .from("finance_import_batches")
      .select(FINANCE_IMPORT_BATCH_COLUMNS)
      .eq("user_id", userId)
      .eq("source", "rocket_money_csv")
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(MAX_IMPORT_HISTORY),
  ]);

  if (detailsResult.error) {
    return { success: false, error: "Could not load Melusi business expense details." };
  }

  if (importBatchesResult.error) {
    return { success: false, error: "Could not load Melusi expense import history." };
  }

  const detailRows = (detailsResult.data ?? []) as FinanceBusinessExpenseDetailRow[];

  if (detailRows.length === 0) {
    const safeImportHistory = ((importBatchesResult.data ?? []) as FinanceImportBatchRow[])
      .map(mapImportHistoryRow)
      .filter((item): item is MelusiExpenseImportHistoryItem => item !== null);

    return {
      success: true,
      data: {
        timezone,
        grossOwnerFundedExpenses: 0,
        ownerFundedRefunds: 0,
        netOwnerFundedSpending: 0,
        oneTimeSpending: 0,
        prepaidSpending: 0,
        historicalMonthlyRecurringSpending: 0,
        historicalAnnualRecurringSpending: 0,
        unknownSpending: 0,
        currentMonthlyRecurringAmount: 0,
        currentAnnualRecurringAmount: 0,
        estimatedAnnualRecurringRunRate: 0,
        estimatedAverageMonthlyOverhead: 0,
        nextExpectedChargeDate: null,
        recurringItemCount: 0,
        totalExpenseRecordCount: 0,
        needsReviewCount: 0,
        importedExpenseHistory: [],
        upcomingRecurringCharges: [],
        safeImportHistory,
      },
    };
  }

  const transactionIds = detailRows.map((row) => row.transaction_id);

  const transactionsResult = await supabase
    .from("finance_transactions")
    .select(FINANCE_TRANSACTION_COLUMNS)
    .eq("user_id", userId)
    .in("id", transactionIds);

  if (transactionsResult.error) {
    return { success: false, error: "Could not load Melusi expense transactions." };
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
      .eq("user_id", userId)
      .in("id", recurringItemIds);

    if (recurringItemsResult.error) {
      return { success: false, error: "Could not load Melusi recurring overhead items." };
    }

    recurringItems = (recurringItemsResult.data ?? []) as FinanceRecurringItemRow[];
  }

  const activeMelusiRecurringItems = recurringItems.filter((item) =>
    isActiveRecurringItem(item, asOfDate),
  );

  const classificationByRecurringItemId = new Map<
    string,
    RocketMoneyClassificationStatus
  >();

  for (const record of records) {
    const recurringItemId = record.transaction.recurring_item_id;

    if (!recurringItemId || classificationByRecurringItemId.has(recurringItemId)) {
      continue;
    }

    classificationByRecurringItemId.set(
      recurringItemId,
      record.detail.classification_status,
    );
  }

  const ownerFundedTotals = calculateOwnerFundedTotals(records);
  const costTreatmentTotals = calculateCostTreatmentTotals(records);
  const recurringOverhead = calculateRecurringOverhead(activeMelusiRecurringItems, asOfDate);
  const upcomingRecurringCharges = buildUpcomingRecurringCharges(
    activeMelusiRecurringItems,
    classificationByRecurringItemId,
    asOfDate,
  );

  const safeImportHistory = ((importBatchesResult.data ?? []) as FinanceImportBatchRow[])
    .map(mapImportHistoryRow)
    .filter((item): item is MelusiExpenseImportHistoryItem => item !== null);

  return {
    success: true,
    data: {
      timezone,
      grossOwnerFundedExpenses: ownerFundedTotals.grossOwnerFundedExpenses,
      ownerFundedRefunds: ownerFundedTotals.ownerFundedRefunds,
      netOwnerFundedSpending: ownerFundedTotals.netOwnerFundedSpending,
      oneTimeSpending: costTreatmentTotals.one_time,
      prepaidSpending: costTreatmentTotals.prepaid,
      historicalMonthlyRecurringSpending: costTreatmentTotals.monthly_recurring,
      historicalAnnualRecurringSpending: costTreatmentTotals.annual_recurring,
      unknownSpending: costTreatmentTotals.unknown,
      currentMonthlyRecurringAmount: recurringOverhead.currentMonthlyRecurringAmount,
      currentAnnualRecurringAmount: recurringOverhead.currentAnnualRecurringAmount,
      estimatedAnnualRecurringRunRate: recurringOverhead.estimatedAnnualRecurringRunRate,
      estimatedAverageMonthlyOverhead: recurringOverhead.estimatedAverageMonthlyOverhead,
      nextExpectedChargeDate: recurringOverhead.nextExpectedChargeDate,
      recurringItemCount: recurringOverhead.recurringItemCount,
      totalExpenseRecordCount: records.length,
      needsReviewCount: records.filter(
        (record) => record.detail.classification_status === "needs_review",
      ).length,
      importedExpenseHistory: buildExpenseHistory(records),
      upcomingRecurringCharges,
      safeImportHistory,
    },
  };
}
