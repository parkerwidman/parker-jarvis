import {
  calculateMonthlySpending,
  daysBetweenDates,
  getCalendarMonthDateRange,
  getCurrentCalendarMonth,
  getStaleAccounts,
  getUpcomingObligations,
  isTransactionDateInRange,
} from "./finance-calculations";
import type {
  FinanceAccount,
  FinanceAlert,
  FinancePreferences,
  FinanceRecurringItem,
  FinanceTransaction,
} from "./finance-types";

export function buildRecurringDueSoonAlerts(
  recurringItems: FinanceRecurringItem[],
  asOfDate: string,
  defaultReminderDays: number,
): FinanceAlert[] {
  return getUpcomingObligations(recurringItems, asOfDate, defaultReminderDays).map(
    (item) => ({
      kind: "recurring_due_soon" as const,
      title: `${item.name} due soon`,
      explanation: `${item.name} is expected on ${item.nextExpectedDate}.`,
      recurringItemId: item.id,
      accountId: item.accountId ?? undefined,
      categoryId: item.categoryId ?? undefined,
    }),
  );
}

export function buildCashBelowTargetAlert(
  totalCash: number | null,
  preferences: FinancePreferences,
): FinanceAlert | null {
  if (preferences.minimumCashTarget === null || totalCash === null) {
    return null;
  }

  if (totalCash >= preferences.minimumCashTarget) {
    return null;
  }

  return {
    kind: "cash_below_target",
    title: "Cash below target",
    explanation: `Total cash is below your minimum cash target of ${preferences.minimumCashTarget.toFixed(2)} USD.`,
  };
}

export function buildLargeTransactionAlerts(
  transactions: FinanceTransaction[],
  preferences: FinancePreferences,
): FinanceAlert[] {
  if (preferences.largeTransactionThreshold === null) {
    return [];
  }

  return transactions
    .filter(
      (transaction) =>
        transaction.status === "posted" &&
        Math.abs(transaction.amount) > preferences.largeTransactionThreshold!,
    )
    .map((transaction) => ({
      kind: "large_transaction" as const,
      title: "Large transaction detected",
      explanation: `A posted transaction on ${transaction.transactionDate} exceeds your large-transaction threshold.`,
      transactionId: transaction.id,
      accountId: transaction.accountId ?? undefined,
      categoryId: transaction.categoryId ?? undefined,
    }));
}

export function buildUncategorizedTransactionAlerts(
  transactions: FinanceTransaction[],
): FinanceAlert[] {
  return transactions
    .filter(
      (transaction) =>
        transaction.status === "posted" &&
        transaction.categoryId === null &&
        transaction.transactionType !== "transfer" &&
        transaction.transactionType !== "adjustment",
    )
    .map((transaction) => ({
      kind: "uncategorized_transaction" as const,
      title: "Uncategorized transaction",
      explanation: `Posted transaction on ${transaction.transactionDate} has no category assigned.`,
      transactionId: transaction.id,
      accountId: transaction.accountId ?? undefined,
    }));
}

export function buildStaleBalanceAlerts(
  accounts: FinanceAccount[],
  asOfDate: string,
  staleBalanceDays: number,
): FinanceAlert[] {
  return getStaleAccounts(accounts, asOfDate, staleBalanceDays).map((account) => ({
    kind: "stale_balance" as const,
    title: `${account.name} balance may be stale`,
    explanation: `Balance has not been updated since ${account.balanceAsOf}.`,
    accountId: account.id,
  }));
}

export function buildPossibleDuplicateTransactionAlerts(
  transactions: FinanceTransaction[],
): FinanceAlert[] {
  const posted = transactions.filter((transaction) => transaction.status === "posted");
  const groups = new Map<string, FinanceTransaction[]>();

  for (const transaction of posted) {
    const fingerprint =
      transaction.deduplicationFingerprint ??
      [
        transaction.accountId ?? "none",
        transaction.transactionDate,
        transaction.amount.toFixed(2),
        transaction.transactionType,
        transaction.merchant ?? "",
        transaction.description ?? "",
      ].join("|");

    const existing = groups.get(fingerprint) ?? [];
    existing.push(transaction);
    groups.set(fingerprint, existing);
  }

  const alerts: FinanceAlert[] = [];

  for (const group of groups.values()) {
    if (group.length < 2) {
      continue;
    }

    for (const transaction of group) {
      alerts.push({
        kind: "possible_duplicate",
        title: "Possible duplicate transaction",
        explanation: `Transaction on ${transaction.transactionDate} matches another posted transaction.`,
        transactionId: transaction.id,
        accountId: transaction.accountId ?? undefined,
        categoryId: transaction.categoryId ?? undefined,
      });
    }
  }

  return alerts;
}

export function buildMonthlySpendingAboveLimitAlert(
  transactions: FinanceTransaction[],
  preferences: FinancePreferences,
  timeZone: string,
  now = new Date(),
): FinanceAlert | null {
  if (preferences.monthlySpendingLimit === null) {
    return null;
  }

  const { year, month } = getCurrentCalendarMonth(timeZone, now);
  const { startDate, endDate } = getCalendarMonthDateRange(year, month);
  const spending = calculateMonthlySpending(
    transactions,
    startDate,
    endDate,
    preferences.excludeBusinessFromPersonal,
  );

  if (spending === null || spending <= preferences.monthlySpendingLimit) {
    return null;
  }

  return {
    kind: "monthly_spending_above_limit",
    title: "Monthly spending above limit",
    explanation: `Current-month spending exceeds your configured limit of ${preferences.monthlySpendingLimit.toFixed(2)} USD.`,
  };
}

export function buildFinanceAlerts(input: {
  accounts: FinanceAccount[];
  transactions: FinanceTransaction[];
  recurringItems: FinanceRecurringItem[];
  preferences: FinancePreferences;
  totalCash: number | null;
  timeZone: string;
  now?: Date;
}): FinanceAlert[] {
  const now = input.now ?? new Date();
  const asOfDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: input.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const alerts: FinanceAlert[] = [
    ...buildRecurringDueSoonAlerts(
      input.recurringItems,
      asOfDate,
      input.preferences.defaultReminderDays,
    ),
    ...buildLargeTransactionAlerts(input.transactions, input.preferences),
    ...buildUncategorizedTransactionAlerts(input.transactions),
    ...buildStaleBalanceAlerts(
      input.accounts,
      asOfDate,
      input.preferences.staleBalanceDays,
    ),
    ...buildPossibleDuplicateTransactionAlerts(input.transactions),
  ];

  const cashAlert = buildCashBelowTargetAlert(input.totalCash, input.preferences);
  if (cashAlert) {
    alerts.push(cashAlert);
  }

  const spendingAlert = buildMonthlySpendingAboveLimitAlert(
    input.transactions,
    input.preferences,
    input.timeZone,
    now,
  );
  if (spendingAlert) {
    alerts.push(spendingAlert);
  }

  return alerts;
}

export function isRecurringItemDueSoon(
  item: FinanceRecurringItem,
  asOfDate: string,
  defaultReminderDays: number,
): boolean {
  if (!item.active) {
    return false;
  }

  if (item.endDate && item.endDate < asOfDate) {
    return false;
  }

  const daysUntilDue = daysBetweenDates(asOfDate, item.nextExpectedDate);
  const effectiveReminderDays = item.reminderDays ?? defaultReminderDays;

  return daysUntilDue >= 0 && daysUntilDue <= effectiveReminderDays;
}

export function isTransactionInCurrentMonth(
  transactionDate: string,
  timeZone: string,
  now = new Date(),
): boolean {
  const { year, month } = getCurrentCalendarMonth(timeZone, now);
  const { startDate, endDate } = getCalendarMonthDateRange(year, month);

  return isTransactionDateInRange(transactionDate, startDate, endDate);
}
