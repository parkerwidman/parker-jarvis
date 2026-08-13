import { describe, expect, it } from "vitest";
import {
  buildFinanceSummary,
  calculateAvailableCash,
  calculateCreditCardBalance,
  calculateMonthlyIncome,
  calculateMonthlyNetCashFlow,
  calculateMonthlySpending,
  calculateTotalCash,
  calculateTotalDebt,
} from "@/lib/jarvis/finance/finance-calculations";
import {
  FINANCE_DEFAULT_PREFERENCES,
  type FinanceAccount,
  type FinanceTransaction,
} from "@/lib/jarvis/finance/finance-types";

function buildAccount(overrides: Partial<FinanceAccount> = {}): FinanceAccount {
  return {
    id: overrides.id ?? "acct-1",
    userId: "user-1",
    name: overrides.name ?? "Checking",
    institutionName: overrides.institutionName ?? "Bank",
    accountType: overrides.accountType ?? "checking",
    currentBalance: overrides.currentBalance ?? 1000,
    availableBalance:
      overrides.availableBalance === undefined ? 900 : overrides.availableBalance,
    balanceAsOf: overrides.balanceAsOf ?? "2026-08-05",
    currency: "USD",
    lastFour: overrides.lastFour ?? "1234",
    active: overrides.active ?? true,
    hidden: overrides.hidden ?? false,
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function buildTransaction(
  overrides: Partial<FinanceTransaction> = {},
): FinanceTransaction {
  return {
    id: overrides.id ?? "tx-1",
    userId: "user-1",
    accountId: overrides.accountId ?? "acct-1",
    categoryId: overrides.categoryId ?? "cat-1",
    transactionDate: overrides.transactionDate ?? "2026-08-04",
    postedDate: overrides.postedDate ?? "2026-08-04",
    amount: overrides.amount ?? -50,
    merchant: overrides.merchant ?? "Store",
    description: null,
    transactionType: overrides.transactionType ?? "expense",
    status: overrides.status ?? "posted",
    notes: null,
    source: overrides.source ?? "plaid",
    deduplicationFingerprint: null,
    recurringItemId: null,
    personalOrBusiness: overrides.personalOrBusiness ?? "personal",
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
  };
}

describe("calculateTotalCash", () => {
  it("sums checking, savings, and cash account current balances", () => {
    const total = calculateTotalCash([
      buildAccount({ accountType: "checking", currentBalance: 1000 }),
      buildAccount({ id: "acct-2", accountType: "savings", currentBalance: 500 }),
      buildAccount({ id: "acct-3", accountType: "cash", currentBalance: 200 }),
    ]);

    expect(total).toBe(1700);
  });

  it("excludes investment, credit card, loan, and other accounts", () => {
    const total = calculateTotalCash([
      buildAccount({ accountType: "checking", currentBalance: 1000 }),
      buildAccount({ id: "inv", accountType: "investment", currentBalance: 50000 }),
      buildAccount({ id: "cc", accountType: "credit_card", currentBalance: 800 }),
      buildAccount({ id: "loan", accountType: "loan", currentBalance: 12000 }),
      buildAccount({ id: "other", accountType: "other", currentBalance: 75 }),
    ]);

    expect(total).toBe(1000);
  });

  it("returns null when no cash accounts exist", () => {
    expect(
      calculateTotalCash([
        buildAccount({ accountType: "investment", currentBalance: 1000 }),
      ]),
    ).toBeNull();
  });
});

describe("calculateAvailableCash", () => {
  it("uses available balance for checking and savings when present", () => {
    const total = calculateAvailableCash([
      buildAccount({ accountType: "checking", currentBalance: 1000, availableBalance: 850 }),
      buildAccount({
        id: "acct-2",
        accountType: "savings",
        currentBalance: 500,
        availableBalance: 480,
      }),
    ]);

    expect(total).toBe(1330);
  });

  it("falls back to current balance when available is null", () => {
    const total = calculateAvailableCash([
      buildAccount({ accountType: "checking", currentBalance: 1000, availableBalance: null }),
    ]);

    expect(total).toBe(1000);
  });

  it("uses current balance for cash-type accounts", () => {
    const total = calculateAvailableCash([
      buildAccount({ accountType: "cash", currentBalance: 250, availableBalance: null }),
    ]);

    expect(total).toBe(250);
  });
});

describe("monthly income and spending", () => {
  it("counts posted income transactions with positive amounts", () => {
    const income = calculateMonthlyIncome(
      [
        buildTransaction({
          id: "income-1",
          transactionType: "income",
          amount: 2500,
        }),
        buildTransaction({
          id: "expense-1",
          transactionType: "expense",
          amount: -100,
        }),
      ],
      "2026-08-01",
      "2026-08-31",
      true,
    );

    expect(income).toBe(2500);
  });

  it("excludes pending and business transactions from spending", () => {
    const spending = calculateMonthlySpending(
      [
        buildTransaction({ id: "posted", amount: -120 }),
        buildTransaction({ id: "pending", status: "pending", amount: -999 }),
        buildTransaction({
          id: "business",
          amount: -500,
          personalOrBusiness: "business",
        }),
        buildTransaction({
          id: "transfer",
          transactionType: "transfer",
          amount: -1000,
        }),
      ],
      "2026-08-01",
      "2026-08-31",
      true,
    );

    expect(spending).toBe(120);
  });

  it("subtracts refunds from spending totals", () => {
    const spending = calculateMonthlySpending(
      [
        buildTransaction({ id: "expense", amount: -200 }),
        buildTransaction({
          id: "refund",
          transactionType: "refund",
          amount: 50,
        }),
      ],
      "2026-08-01",
      "2026-08-31",
      true,
    );

    expect(spending).toBe(150);
  });
});

describe("calculateMonthlyNetCashFlow", () => {
  it("returns income minus spending", () => {
    expect(calculateMonthlyNetCashFlow(3000, 1200)).toBe(1800);
  });

  it("returns null when either input is null", () => {
    expect(calculateMonthlyNetCashFlow(null, 100)).toBeNull();
    expect(calculateMonthlyNetCashFlow(100, null)).toBeNull();
  });
});

describe("debt balances", () => {
  it("aggregates credit card balances separately from total debt", () => {
    const creditCards = calculateCreditCardBalance([
      buildAccount({ id: "cc-1", accountType: "credit_card", currentBalance: 500 }),
      buildAccount({ id: "cc-2", accountType: "credit_card", currentBalance: 300 }),
    ]);

    expect(creditCards).toBe(800);
  });

  it("includes credit cards and loans in total debt", () => {
    const totalDebt = calculateTotalDebt([
      buildAccount({ id: "cc-1", accountType: "credit_card", currentBalance: 800 }),
      buildAccount({ id: "loan-1", accountType: "loan", currentBalance: 12000 }),
    ]);

    expect(totalDebt).toBe(12800);
  });
});

describe("buildFinanceSummary", () => {
  it("derives net cash flow from monthly income and spending", () => {
    const summary = buildFinanceSummary({
      accounts: [buildAccount()],
      transactions: [
        buildTransaction({
          id: "income",
          transactionType: "income",
          amount: 1000,
        }),
        buildTransaction({ id: "expense", amount: -250 }),
      ],
      recurringItems: [],
      preferences: {
        ...FINANCE_DEFAULT_PREFERENCES,
        userId: "user-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      timeZone: "UTC",
      now: new Date("2026-08-12T12:00:00.000Z"),
    });

    expect(summary.currentMonthIncome).toBe(1000);
    expect(summary.currentMonthSpending).toBe(250);
    expect(summary.currentMonthNetCashFlow).toBe(750);
  });
});
