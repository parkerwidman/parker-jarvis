import { createHash } from "crypto";
import {
  calculateAvailableCash,
  daysBetweenDates,
  getStaleAccounts,
} from "@/lib/jarvis/finance/finance-calculations";
import type {
  FinanceAccount,
  FinancePersonalOrBusiness,
  FinanceRecurringItem,
  FinanceTransaction,
  FinanceTransactionStatus,
  FinanceTransactionType,
} from "@/lib/jarvis/finance/finance-types";
import type { PlaidSafeConnectionSummary } from "@/lib/jarvis/integrations/plaid/plaid-types";

export const FINANCE_BRIEF_FIRST_FALLBACK_DAYS = 7;
export const FINANCE_BRIEF_STALE_SYNC_HOURS = 36;
export const FINANCE_BRIEF_RECURRING_DUE_DAYS = 7;
export const FINANCE_BRIEF_PLAID_SYNC_UTC_HOUR = 10;
export const FINANCE_BRIEF_MAX_SURFACED_SIGNAL_KEYS = 150;
export const FINANCE_BRIEF_MAX_RECENT_ACTIVITY = 10;
export const FINANCE_BRIEF_MAX_REVIEW_SAMPLES = 3;
export const FINANCE_BRIEF_MAX_STALE_ACCOUNT_LABELS = 3;

export type FinanceBriefTransactionRow = {
  id: string;
  transactionDate: string;
  postedDate: string | null;
  amount: number;
  merchant: string | null;
  description: string | null;
  transactionType: FinanceTransactionType;
  status: FinanceTransactionStatus;
  personalOrBusiness: FinancePersonalOrBusiness;
  recurringItemId: string | null;
  source: "manual" | "plaid" | "rocket_money_csv";
};

export type FinanceBriefSyncHealthState =
  | "first_sync_pending"
  | "stale"
  | "failed";

export function hashFinanceBriefSignalPayload(payload: string): string {
  return createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

export function buildFinanceInstitutionSignalToken(
  institutionName: string | null,
): string {
  return hashFinanceBriefSignalPayload(institutionName?.trim() || "unknown-institution");
}

export function buildFinanceRecurringSignalToken(
  name: string,
  nextExpectedDate: string,
): string {
  return hashFinanceBriefSignalPayload(`${name}\n${nextExpectedDate}`);
}

export function getEffectivePostedDate(transaction: {
  postedDate: string | null;
  transactionDate: string;
}): string {
  return transaction.postedDate ?? transaction.transactionDate;
}

export function subtractDaysFromLocalDate(localDate: string, days: number): string {
  const anchorMs = Date.parse(`${localDate}T12:00:00.000Z`);
  return new Date(anchorMs - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function resolveFinanceBriefActivityLowerBoundDate(input: {
  since?: string;
  timeZone: string;
  localDate: string;
  fallbackDays?: number;
}): string {
  if (input.since) {
    const parsed = new Date(input.since);

    if (Number.isFinite(parsed.getTime())) {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: input.timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(parsed);
    }
  }

  return subtractDaysFromLocalDate(
    input.localDate,
    input.fallbackDays ?? FINANCE_BRIEF_FIRST_FALLBACK_DAYS,
  );
}

export function isTransactionInFinanceBriefActivityWindow(
  transaction: FinanceBriefTransactionRow,
  lowerBoundDate: string,
  upperBoundDate: string,
): boolean {
  const effectiveDate = getEffectivePostedDate(transaction);
  return effectiveDate >= lowerBoundDate && effectiveDate <= upperBoundDate;
}

export function shouldIncludePersonalFinanceTransaction(
  transaction: FinanceBriefTransactionRow,
  excludeBusinessFromPersonal: boolean,
): boolean {
  if (transaction.status !== "posted") {
    return false;
  }

  if (
    excludeBusinessFromPersonal &&
    transaction.personalOrBusiness === "business"
  ) {
    return false;
  }

  return true;
}

export function shouldExcludeFromPersonalSpendingAlerts(
  transaction: FinanceBriefTransactionRow,
): boolean {
  return (
    transaction.transactionType === "transfer" ||
    transaction.transactionType === "adjustment" ||
    transaction.transactionType === "refund"
  );
}

export function isPersonalPostedExpense(
  transaction: FinanceBriefTransactionRow,
): boolean {
  return transaction.transactionType === "expense" && transaction.amount < 0;
}

export function isPersonalPostedRefund(
  transaction: FinanceBriefTransactionRow,
): boolean {
  return transaction.transactionType === "refund" && transaction.amount > 0;
}

export function isLargePersonalExpenseCandidate(
  transaction: FinanceBriefTransactionRow,
  excludeBusinessFromPersonal: boolean,
  largeTransactionThreshold: number | null,
  lowerBoundDate: string,
  upperBoundDate: string,
): boolean {
  if (largeTransactionThreshold === null || largeTransactionThreshold <= 0) {
    return false;
  }

  if (!shouldIncludePersonalFinanceTransaction(transaction, excludeBusinessFromPersonal)) {
    return false;
  }

  if (shouldExcludeFromPersonalSpendingAlerts(transaction)) {
    return false;
  }

  if (!isPersonalPostedExpense(transaction)) {
    return false;
  }

  if (
    !isTransactionInFinanceBriefActivityWindow(
      transaction,
      lowerBoundDate,
      upperBoundDate,
    )
  ) {
    return false;
  }

  return Math.abs(transaction.amount) >= largeTransactionThreshold;
}

export function isRefundReceivedCandidate(
  transaction: FinanceBriefTransactionRow,
  excludeBusinessFromPersonal: boolean,
  lowerBoundDate: string,
  upperBoundDate: string,
): boolean {
  if (!shouldIncludePersonalFinanceTransaction(transaction, excludeBusinessFromPersonal)) {
    return false;
  }

  if (!isPersonalPostedRefund(transaction)) {
    return false;
  }

  return isTransactionInFinanceBriefActivityWindow(
    transaction,
    lowerBoundDate,
    upperBoundDate,
  );
}

export function getLastScheduledPlaidSyncUtc(now: Date): Date {
  const scheduled = new Date(now);
  scheduled.setUTCMinutes(0, 0, 0);
  scheduled.setUTCHours(FINANCE_BRIEF_PLAID_SYNC_UTC_HOUR);

  if (now.getTime() < scheduled.getTime()) {
    scheduled.setUTCDate(scheduled.getUTCDate() - 1);
  }

  return scheduled;
}

export function hasScheduledPlaidSyncOpportunity(
  connectedAt: string | null,
  now: Date,
): boolean {
  if (!connectedAt) {
    return true;
  }

  const connectedMs = Date.parse(connectedAt);

  if (!Number.isFinite(connectedMs)) {
    return true;
  }

  return connectedMs <= getLastScheduledPlaidSyncUtc(now).getTime();
}

export function hoursSinceIsoTimestamp(
  isoTimestamp: string | null,
  now: Date,
): number | null {
  if (!isoTimestamp) {
    return null;
  }

  const parsedMs = Date.parse(isoTimestamp);

  if (!Number.isFinite(parsedMs)) {
    return null;
  }

  return (now.getTime() - parsedMs) / (60 * 60 * 1000);
}

export function evaluatePlaidConnectionAttention(
  connection: PlaidSafeConnectionSummary,
): boolean {
  return (
    connection.status === "reconnect_required" || connection.status === "error"
  );
}

export function evaluatePlaidSyncHealth(
  connection: PlaidSafeConnectionSummary,
  now: Date,
): FinanceBriefSyncHealthState | null {
  if (connection.status !== "connected") {
    return null;
  }

  if (
    connection.lastErrorCode &&
    !connection.reconnectRequired &&
    connection.status === "connected"
  ) {
    return "failed";
  }

  if (!connection.lastSuccessfulSyncAt) {
    if (!hasScheduledPlaidSyncOpportunity(connection.connectedAt, now)) {
      return null;
    }

    return "first_sync_pending";
  }

  const ageHours = hoursSinceIsoTimestamp(connection.lastSuccessfulSyncAt, now);

  if (ageHours !== null && ageHours > FINANCE_BRIEF_STALE_SYNC_HOURS) {
    return "stale";
  }

  return null;
}

export function getPersonalRecurringDueWithinDays(
  recurringItems: FinanceRecurringItem[],
  asOfDate: string,
  withinDays: number,
  excludedRecurringItemIds: Set<string>,
): FinanceRecurringItem[] {
  return recurringItems
    .filter((item) => {
      if (!item.active) {
        return false;
      }

      if (item.endDate && item.endDate < asOfDate) {
        return false;
      }

      if (excludedRecurringItemIds.has(item.id)) {
        return false;
      }

      const daysUntilDue = daysBetweenDates(asOfDate, item.nextExpectedDate);
      return daysUntilDue >= 0 && daysUntilDue <= withinDays;
    })
    .sort((left, right) =>
      left.nextExpectedDate.localeCompare(right.nextExpectedDate),
    );
}

export function calculateFinanceBriefAvailableCash(
  accounts: FinanceAccount[],
): number | null {
  return calculateAvailableCash(accounts);
}

export function getFinanceBriefStaleAccounts(
  accounts: FinanceAccount[],
  asOfDate: string,
  staleBalanceDays: number,
): FinanceAccount[] {
  return getStaleAccounts(accounts, asOfDate, staleBalanceDays);
}

export function buildLargeTransactionSignalKey(input: {
  date: string;
  amount: number;
  merchant: string | null;
}): string {
  return `finance:le:${hashFinanceBriefSignalPayload(
    `${input.date}\n${input.amount}\n${input.merchant ?? ""}`,
  )}`;
}

export function buildRefundSignalKey(input: {
  date: string;
  amount: number;
  merchant: string | null;
}): string {
  return `finance:rf:${hashFinanceBriefSignalPayload(
    `${input.date}\n${input.amount}\n${input.merchant ?? ""}`,
  )}`;
}

export function buildRecurringObligationSignalKey(input: {
  name: string;
  nextExpectedDate: string;
}): string {
  return `finance:recurring:${buildFinanceRecurringSignalToken(
    input.name,
    input.nextExpectedDate,
  )}:${input.nextExpectedDate}`;
}

export function mergeFinanceBriefSurfacedSignalKeys(
  storedKeys: string[],
  newlySurfacedKeys: string[],
): string[] {
  const merged = [...storedKeys];

  for (const signalKey of newlySurfacedKeys) {
    if (!merged.includes(signalKey)) {
      merged.push(signalKey);
    }
  }

  if (merged.length <= FINANCE_BRIEF_MAX_SURFACED_SIGNAL_KEYS) {
    return merged;
  }

  return merged.slice(merged.length - FINANCE_BRIEF_MAX_SURFACED_SIGNAL_KEYS);
}

export function roundFinanceBriefCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function resolveMerchantOrDescription(transaction: {
  merchant: string | null;
  description: string | null;
}): string | null {
  const merchant = transaction.merchant?.trim();

  if (merchant) {
    return merchant;
  }

  const description = transaction.description?.trim();
  return description || null;
}

export function mapSnapshotTransaction(
  transaction: FinanceTransaction,
): FinanceBriefTransactionRow {
  return {
    id: transaction.id,
    transactionDate: transaction.transactionDate,
    postedDate: transaction.postedDate,
    amount: transaction.amount,
    merchant: transaction.merchant,
    description: transaction.description,
    transactionType: transaction.transactionType,
    status: transaction.status,
    personalOrBusiness: transaction.personalOrBusiness,
    recurringItemId: transaction.recurringItemId,
    source: transaction.source,
  };
}
