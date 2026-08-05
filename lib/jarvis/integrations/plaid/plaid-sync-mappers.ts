import "server-only";

import {
  AccountType,
  DepositoryAccountSubtype,
  type AccountBase,
  type PersonalFinanceCategory,
  type Transaction,
} from "plaid";
import type { FinanceAccountType, FinanceTransactionType } from "@/lib/jarvis/finance/finance-types";

const TRANSFER_PFC_PRIMARIES = new Set([
  "TRANSFER_IN",
  "TRANSFER_OUT",
]);

const INCOME_PFC_PRIMARIES = new Set([
  "INCOME",
]);

const CREDIT_CARD_PAYMENT_PFC_DETAILED = new Set([
  "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
]);

const LOAN_PAYMENT_PFC_DETAILED_PREFIX = "LOAN_PAYMENTS_";

const PFC_PRIMARY_TO_CATEGORY_SLUG: Record<string, string> = {
  INCOME: "income",
  FOOD_AND_DRINK: "food",
  TRANSPORTATION: "transportation",
  RENT_AND_UTILITIES: "housing",
  HOME_IMPROVEMENT: "housing",
  MEDICAL: "health",
  ENTERTAINMENT: "entertainment",
  TRAVEL: "travel",
  GENERAL_MERCHANDISE: "shopping",
  PERSONAL_CARE: "personal-care",
  LOAN_PAYMENTS: "debt-payments",
  BANK_FEES: "fees",
  TRANSFER_IN: "transfers",
  TRANSFER_OUT: "transfers",
  GOVERNMENT_AND_NON_PROFIT: "uncategorized",
  GENERAL_SERVICES: "uncategorized",
  RECREATION: "entertainment",
  TRAVEL_AND_TRANSPORTATION: "travel",
};

export function normalizePlaidTransactionAmount(plaidAmount: number): number {
  if (!Number.isFinite(plaidAmount)) {
    throw new Error("invalid_plaid_amount");
  }

  // Plaid: positive = outflow, negative = inflow. Jarvis uses the opposite convention.
  return -plaidAmount;
}

export function isSupportedUsdCurrency(
  isoCurrencyCode: string | null | undefined,
  unofficialCurrencyCode: string | null | undefined,
): boolean {
  if (unofficialCurrencyCode) {
    return false;
  }

  return isoCurrencyCode === "USD";
}

export function mapPlaidAccountType(account: AccountBase): FinanceAccountType {
  const subtype = account.subtype?.toString().toLowerCase() ?? null;

  switch (account.type) {
    case AccountType.Depository:
      if (subtype === DepositoryAccountSubtype.Checking) {
        return "checking";
      }
      if (subtype === DepositoryAccountSubtype.Savings) {
        return "savings";
      }
      if (
        subtype === DepositoryAccountSubtype.Paypal ||
        subtype === DepositoryAccountSubtype.Prepaid ||
        subtype === DepositoryAccountSubtype.CashManagement
      ) {
        return "cash";
      }
      return "other";
    case AccountType.Credit:
      return "credit_card";
    case AccountType.Loan:
      return "loan";
    case AccountType.Investment:
    case AccountType.Brokerage:
      return "investment";
    case AccountType.Other:
    default:
      return "other";
  }
}

export function resolvePlaidAccountName(account: AccountBase): string {
  const candidate = account.official_name?.trim() || account.name.trim();
  return candidate.length > 0 ? candidate.slice(0, 200) : "Linked account";
}

export function resolvePlaidAccountLastFour(mask: string | null | undefined): string | null {
  if (!mask) {
    return null;
  }

  const digits = mask.replace(/\D/g, "");
  if (digits.length !== 4) {
    return null;
  }

  return digits;
}

export function mapPlaidAccountBalances(
  accountType: FinanceAccountType,
  balances: AccountBase["balances"],
): { currentBalance: number; availableBalance: number | null } {
  const current = balances.current ?? 0;

  if (accountType === "credit_card" || accountType === "loan") {
    return {
      currentBalance: Math.abs(current),
      availableBalance: null,
    };
  }

  const availableBalance =
    accountType === "checking" || accountType === "savings"
      ? balances.available
      : null;

  return {
    currentBalance: current,
    availableBalance,
  };
}

function normalizePfcValue(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value.trim().toUpperCase();
}

export function mapPlaidCategorySlug(
  personalFinanceCategory: PersonalFinanceCategory | null | undefined,
): string {
  const primary = normalizePfcValue(personalFinanceCategory?.primary);
  if (!primary) {
    return "uncategorized";
  }

  return PFC_PRIMARY_TO_CATEGORY_SLUG[primary] ?? "uncategorized";
}

export function mapPlaidTransactionType(
  transaction: Transaction,
  jarvisAmount: number,
): FinanceTransactionType {
  const primary = normalizePfcValue(transaction.personal_finance_category?.primary);
  const detailed = normalizePfcValue(transaction.personal_finance_category?.detailed);

  if (primary && TRANSFER_PFC_PRIMARIES.has(primary)) {
    return "transfer";
  }

  if (primary && INCOME_PFC_PRIMARIES.has(primary)) {
    return "income";
  }

  if (detailed && CREDIT_CARD_PAYMENT_PFC_DETAILED.has(detailed)) {
    return "transfer";
  }

  if (detailed?.startsWith(LOAN_PAYMENT_PFC_DETAILED_PREFIX)) {
    return "transfer";
  }

  if (jarvisAmount < 0) {
    return "expense";
  }

  if (jarvisAmount > 0) {
    return "refund";
  }

  return "expense";
}

export function resolvePlaidTransactionDate(transaction: Transaction): string {
  return transaction.authorized_date ?? transaction.date;
}

export function resolvePlaidPostedDate(transaction: Transaction): string | null {
  if (transaction.pending) {
    return null;
  }

  return transaction.date;
}

export function resolvePlaidMerchant(transaction: Transaction): string | null {
  const merchant = transaction.merchant_name?.trim();
  if (merchant) {
    return merchant.slice(0, 200);
  }

  const description = transaction.name?.trim();
  return description ? description.slice(0, 200) : null;
}

export function isInvestmentPlaidAccount(accountType: FinanceAccountType): boolean {
  return accountType === "investment";
}
