import {
  CASH_ACCOUNT_TYPES,
  DEBT_ACCOUNT_TYPES,
  type FinanceAccount,
  type FinanceAccountType,
  type FinanceCalculatedSummary,
  type FinanceCalculationInput,
  type FinanceRecurringItem,
  type FinanceTransaction,
} from "./finance-types";

function isCashAccountType(accountType: FinanceAccountType): boolean {
  return (CASH_ACCOUNT_TYPES as readonly string[]).includes(accountType);
}

function isDebtAccountType(accountType: FinanceAccountType): boolean {
  return (DEBT_ACCOUNT_TYPES as readonly string[]).includes(accountType);
}

function hasActiveAccountsOfTypes(
  accounts: FinanceAccount[],
  accountTypes: readonly FinanceAccountType[],
): boolean {
  return accounts.some(
    (account) =>
      account.active &&
      !account.hidden &&
      (accountTypes as readonly string[]).includes(account.accountType),
  );
}

function getEffectiveCashBalance(account: FinanceAccount): number {
  if (
    (account.accountType === "checking" || account.accountType === "savings") &&
    account.availableBalance !== null
  ) {
    return account.availableBalance;
  }

  return account.currentBalance;
}

export function getCurrentCalendarMonth(
  timeZone: string,
  now = new Date(),
): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
  }).formatToParts(now);

  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);

  return { year, month };
}

export function getCalendarMonthDateRange(
  year: number,
  month: number,
): { startDate: string; endDate: string } {
  const monthString = String(month).padStart(2, "0");
  const startDate = `${year}-${monthString}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const endDate = `${year}-${monthString}-${String(lastDay).padStart(2, "0")}`;

  return { startDate, endDate };
}

export function isTransactionDateInRange(
  transactionDate: string,
  startDate: string,
  endDate: string,
): boolean {
  return transactionDate >= startDate && transactionDate <= endDate;
}

export function daysBetweenDates(startDate: string, endDate: string): number {
  const startMs = Date.parse(`${startDate}T12:00:00.000Z`);
  const endMs = Date.parse(`${endDate}T12:00:00.000Z`);

  return Math.floor((endMs - startMs) / (24 * 60 * 60 * 1000));
}

function shouldIncludeTransactionInPersonalTotals(
  transaction: FinanceTransaction,
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

export function calculateTotalCash(accounts: FinanceAccount[]): number | null {
  const cashAccounts = accounts.filter(
    (account) =>
      account.active &&
      !account.hidden &&
      isCashAccountType(account.accountType),
  );

  if (cashAccounts.length === 0) {
    return null;
  }

  return cashAccounts.reduce((total, account) => total + account.currentBalance, 0);
}

export function calculateAvailableCash(accounts: FinanceAccount[]): number | null {
  const cashAccounts = accounts.filter(
    (account) =>
      account.active &&
      !account.hidden &&
      isCashAccountType(account.accountType),
  );

  if (cashAccounts.length === 0) {
    return null;
  }

  return cashAccounts.reduce(
    (total, account) => total + getEffectiveCashBalance(account),
    0,
  );
}

export function calculateCreditCardBalance(
  accounts: FinanceAccount[],
): number | null {
  const creditCards = accounts.filter(
    (account) =>
      account.active &&
      !account.hidden &&
      account.accountType === "credit_card",
  );

  if (creditCards.length === 0) {
    return null;
  }

  return creditCards.reduce((total, account) => total + account.currentBalance, 0);
}

export function calculateTotalDebt(accounts: FinanceAccount[]): number | null {
  const debtAccounts = accounts.filter(
    (account) =>
      account.active &&
      !account.hidden &&
      isDebtAccountType(account.accountType),
  );

  if (debtAccounts.length === 0) {
    return null;
  }

  return debtAccounts.reduce((total, account) => total + account.currentBalance, 0);
}

export function calculateMonthlyIncome(
  transactions: FinanceTransaction[],
  startDate: string,
  endDate: string,
  excludeBusinessFromPersonal: boolean,
): number {
  let total = 0;

  for (const transaction of transactions) {
    if (!shouldIncludeTransactionInPersonalTotals(transaction, excludeBusinessFromPersonal)) {
      continue;
    }

    if (transaction.transactionType !== "income") {
      continue;
    }

    if (!isTransactionDateInRange(transaction.transactionDate, startDate, endDate)) {
      continue;
    }

    if (transaction.amount <= 0) {
      continue;
    }

    total += transaction.amount;
  }

  return total;
}

export function calculateMonthlySpending(
  transactions: FinanceTransaction[],
  startDate: string,
  endDate: string,
  excludeBusinessFromPersonal: boolean,
): number {
  let total = 0;

  for (const transaction of transactions) {
    if (!shouldIncludeTransactionInPersonalTotals(transaction, excludeBusinessFromPersonal)) {
      continue;
    }

    if (
      transaction.transactionType === "transfer" ||
      transaction.transactionType === "adjustment"
    ) {
      continue;
    }

    if (!isTransactionDateInRange(transaction.transactionDate, startDate, endDate)) {
      continue;
    }

    if (transaction.transactionType === "expense" && transaction.amount < 0) {
      total += Math.abs(transaction.amount);
      continue;
    }

    if (transaction.transactionType === "refund" && transaction.amount > 0) {
      total -= transaction.amount;
    }
  }

  return Math.max(0, total);
}

export function calculateMonthlyNetCashFlow(
  income: number | null,
  spending: number | null,
): number | null {
  if (income === null || spending === null) {
    return null;
  }

  return income - spending;
}

export function calculateCategorySpending(
  transactions: FinanceTransaction[],
  startDate: string,
  endDate: string,
  excludeBusinessFromPersonal: boolean,
): Record<string, number> {
  const totals: Record<string, number> = {};

  for (const transaction of transactions) {
    if (!shouldIncludeTransactionInPersonalTotals(transaction, excludeBusinessFromPersonal)) {
      continue;
    }

    if (
      transaction.transactionType === "transfer" ||
      transaction.transactionType === "adjustment" ||
      transaction.transactionType === "income"
    ) {
      continue;
    }

    if (!isTransactionDateInRange(transaction.transactionDate, startDate, endDate)) {
      continue;
    }

    const categoryKey = transaction.categoryId ?? "uncategorized";
    let delta = 0;

    if (transaction.transactionType === "expense" && transaction.amount < 0) {
      delta = Math.abs(transaction.amount);
    } else if (transaction.transactionType === "refund" && transaction.amount > 0) {
      delta = -transaction.amount;
    }

    if (delta === 0) {
      continue;
    }

    totals[categoryKey] = (totals[categoryKey] ?? 0) + delta;
  }

  for (const categoryId of Object.keys(totals)) {
    totals[categoryId] = Math.max(0, totals[categoryId]);
  }

  return totals;
}

export function getUpcomingObligations(
  recurringItems: FinanceRecurringItem[],
  asOfDate: string,
  reminderDays: number,
): FinanceRecurringItem[] {
  return recurringItems
    .filter((item) => {
      if (!item.active) {
        return false;
      }

      if (item.endDate && item.endDate < asOfDate) {
        return false;
      }

      const daysUntilDue = daysBetweenDates(asOfDate, item.nextExpectedDate);
      const effectiveReminderDays = item.reminderDays ?? reminderDays;

      return daysUntilDue >= 0 && daysUntilDue <= effectiveReminderDays;
    })
    .sort((left, right) => left.nextExpectedDate.localeCompare(right.nextExpectedDate));
}

export function getStaleAccounts(
  accounts: FinanceAccount[],
  asOfDate: string,
  staleBalanceDays: number,
): FinanceAccount[] {
  return accounts
    .filter((account) => {
      if (!account.active || account.hidden) {
        return false;
      }

      const ageDays = daysBetweenDates(account.balanceAsOf, asOfDate);
      return ageDays > staleBalanceDays;
    })
    .sort((left, right) => left.balanceAsOf.localeCompare(right.balanceAsOf));
}

function hasMonthlyTotalsContext(
  accounts: FinanceAccount[],
  transactions: FinanceTransaction[],
): boolean {
  if (accounts.some((account) => account.active)) {
    return true;
  }

  return transactions.some((transaction) => transaction.status === "posted");
}

export function buildFinanceSummary(input: FinanceCalculationInput): FinanceCalculatedSummary {
  const now = input.now ?? new Date();
  const month = input.month ?? getCurrentCalendarMonth(input.timeZone, now);
  const { startDate, endDate } = getCalendarMonthDateRange(month.year, month.month);
  const asOfDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: input.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const totalCash = calculateTotalCash(input.accounts);
  const availableCash = calculateAvailableCash(input.accounts);
  const creditCardBalance = calculateCreditCardBalance(input.accounts);
  const totalDebt = calculateTotalDebt(input.accounts);

  const hasMonthlyContext = hasMonthlyTotalsContext(
    input.accounts,
    input.transactions,
  );
  const currentMonthIncome = hasMonthlyContext
    ? calculateMonthlyIncome(
        input.transactions,
        startDate,
        endDate,
        input.preferences.excludeBusinessFromPersonal,
      )
    : null;
  const currentMonthSpending = hasMonthlyContext
    ? calculateMonthlySpending(
        input.transactions,
        startDate,
        endDate,
        input.preferences.excludeBusinessFromPersonal,
      )
    : null;

  return {
    totalCash,
    availableCash,
    creditCardBalance,
    totalDebt,
    currentMonthIncome,
    currentMonthSpending,
    currentMonthNetCashFlow: calculateMonthlyNetCashFlow(
      currentMonthIncome,
      currentMonthSpending,
    ),
    categorySpending: hasMonthlyContext
      ? calculateCategorySpending(
          input.transactions,
          startDate,
          endDate,
          input.preferences.excludeBusinessFromPersonal,
        )
      : {},
    upcomingObligations: getUpcomingObligations(
      input.recurringItems,
      asOfDate,
      input.preferences.defaultReminderDays,
    ),
    staleAccounts: getStaleAccounts(
      input.accounts,
      asOfDate,
      input.preferences.staleBalanceDays,
    ),
  };
}

export function investmentBalancesExcludedFromCash(
  accounts: FinanceAccount[],
): boolean {
  const investmentAccounts = accounts.filter(
    (account) => account.active && !account.hidden && account.accountType === "investment",
  );

  if (investmentAccounts.length === 0) {
    return true;
  }

  return !hasActiveAccountsOfTypes(accounts, CASH_ACCOUNT_TYPES);
}
