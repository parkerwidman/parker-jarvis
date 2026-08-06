import "server-only";

import { subtractDaysFromLocalDate } from "@/lib/jarvis/briefings/finance-brief-rules";
import { getLocalDateString } from "@/lib/jarvis/dashboard/command-center-utils";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPersonalFinanceData } from "./load-personal-finance-data";
import {
  PERSONAL_FINANCE_DEFAULT_RECURRING_WINDOW_DAYS,
  PERSONAL_FINANCE_MAX_RECURRING_WINDOW_DAYS,
  PERSONAL_FINANCE_MAX_SPENDING_WINDOW_DAYS,
  PERSONAL_FINANCE_MIN_RECURRING_WINDOW_DAYS,
} from "./personal-finance-constants";
import {
  resolvePersonalFinanceSpendingDateRange,
} from "./personal-finance-calculations";
import {
  normalizePersonalFinanceFilter,
} from "./personal-finance-transaction-rules";
import {
  resolveDefaultTransactionLimit,
  resolveIncludeTransactions,
  summarizePersonalFinanceSummaryForAgent,
  summarizePersonalRecurringChargesForAgent,
  summarizePersonalSpendingForAgent,
  type PersonalRecurringStatus,
} from "./personal-finance-result-mappers";

function parseRecurringStatus(value: unknown): PersonalRecurringStatus | "invalid" {
  if (value === null || value === undefined) {
    return "upcoming";
  }

  if (typeof value !== "string") {
    return "invalid";
  }

  switch (value) {
    case "upcoming":
    case "overdue":
    case "all":
      return value;
    default:
      return "invalid";
  }
}

function parseWindowDays(value: unknown): number | "invalid" {
  if (value === null || value === undefined) {
    return PERSONAL_FINANCE_DEFAULT_RECURRING_WINDOW_DAYS;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    return "invalid";
  }

  if (
    value < PERSONAL_FINANCE_MIN_RECURRING_WINDOW_DAYS ||
    value > PERSONAL_FINANCE_MAX_RECURRING_WINDOW_DAYS
  ) {
    return "invalid";
  }

  return value;
}

function failure(error: string): Record<string, unknown> {
  return { success: false, error };
}

export async function getPersonalFinanceSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, unknown>> {
  const asOfDate = getLocalDateString("UTC");
  const transactionStartDate = subtractDaysFromLocalDate(
    asOfDate,
    PERSONAL_FINANCE_MAX_SPENDING_WINDOW_DAYS + 31,
  );

  const loaded = await loadPersonalFinanceData(
    supabase,
    userId,
    transactionStartDate,
  );

  if (!loaded.success) {
    return failure(loaded.errorCode);
  }

  return summarizePersonalFinanceSummaryForAgent(loaded.data);
}

export async function getPersonalSpending(
  supabase: SupabaseClient,
  userId: string,
  args: {
    startDate?: unknown;
    endDate?: unknown;
    category?: unknown;
    merchant?: unknown;
    includeTransactions?: unknown;
    transactionLimit?: unknown;
  },
): Promise<Record<string, unknown>> {
  const merchantFilter = normalizePersonalFinanceFilter(args.merchant);
  if (merchantFilter === "invalid") {
    return failure("invalid_filter");
  }

  const categoryFilter = normalizePersonalFinanceFilter(args.category);
  if (categoryFilter === "invalid") {
    return failure("invalid_filter");
  }

  const transactionLimit = resolveDefaultTransactionLimit(args.transactionLimit);
  if (transactionLimit === "invalid") {
    return failure("invalid_filter");
  }

  const includeTransactions = resolveIncludeTransactions(args.includeTransactions);

  const loaded = await loadPersonalFinanceData(
    supabase,
    userId,
    subtractDaysFromLocalDate(
      getLocalDateString("UTC"),
      PERSONAL_FINANCE_MAX_SPENDING_WINDOW_DAYS + 31,
    ),
  );

  if (!loaded.success) {
    return failure(loaded.errorCode);
  }

  const resolvedRange = resolvePersonalFinanceSpendingDateRange({
    startDate: args.startDate,
    endDate: args.endDate,
    timeZone: loaded.data.timezone,
  });

  if (!resolvedRange.ok) {
    return failure(resolvedRange.error);
  }

  return summarizePersonalSpendingForAgent({
    data: loaded.data,
    startDate: resolvedRange.startDate,
    endDate: resolvedRange.endDate,
    merchantFilter,
    categoryFilter,
    includeTransactions,
    transactionLimit,
  });
}

export async function getPersonalRecurringCharges(
  supabase: SupabaseClient,
  userId: string,
  args: {
    windowDays?: unknown;
    status?: unknown;
  },
): Promise<Record<string, unknown>> {
  const windowDays = parseWindowDays(args.windowDays);

  if (windowDays === "invalid") {
    return failure("invalid_filter");
  }

  const status = parseRecurringStatus(args.status);

  if (status === "invalid") {
    return failure("invalid_filter");
  }

  const asOfDate = getLocalDateString("UTC");
  const loaded = await loadPersonalFinanceData(
    supabase,
    userId,
    subtractDaysFromLocalDate(asOfDate, 1),
  );

  if (!loaded.success) {
    return failure(loaded.errorCode);
  }

  return summarizePersonalRecurringChargesForAgent({
    data: loaded.data,
    windowDays,
    status,
  });
}
