import type {
  FinancePersonalOrBusiness,
  FinanceTransactionStatus,
  FinanceTransactionType,
} from "@/lib/jarvis/finance/finance-types";
import { isTransactionDateInRange } from "@/lib/jarvis/finance/finance-calculations";
import { getEffectivePostedDate } from "@/lib/jarvis/briefings/finance-brief-rules";

export type PersonalFinanceTransactionRow = {
  id: string;
  accountId: string | null;
  categoryId: string | null;
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
  deduplicationFingerprint: string | null;
  isPlaidMapped: boolean;
};

const EXCLUDED_CATEGORY_SLUGS = new Set(["transfers", "debt-payments"]);

export function buildPersonalFinanceDedupKey(
  transaction: PersonalFinanceTransactionRow,
): string {
  if (transaction.deduplicationFingerprint) {
    return transaction.deduplicationFingerprint;
  }

  return [
    transaction.accountId ?? "none",
    transaction.transactionDate,
    transaction.amount.toFixed(2),
    transaction.transactionType,
    (transaction.merchant ?? "").trim().toLowerCase(),
    (transaction.description ?? "").trim().toLowerCase(),
  ].join("|");
}

function sourcePriority(transaction: PersonalFinanceTransactionRow): number {
  if (transaction.source === "rocket_money_csv" && transaction.isPlaidMapped) {
    return 0;
  }

  if (transaction.source === "plaid") {
    return 1;
  }

  if (transaction.source === "manual") {
    return 2;
  }

  return 3;
}

export function selectCanonicalPersonalFinanceTransactions(
  transactions: PersonalFinanceTransactionRow[],
): PersonalFinanceTransactionRow[] {
  const groups = new Map<string, PersonalFinanceTransactionRow[]>();

  for (const transaction of transactions) {
    const key = buildPersonalFinanceDedupKey(transaction);
    const group = groups.get(key) ?? [];
    group.push(transaction);
    groups.set(key, group);
  }

  const canonical: PersonalFinanceTransactionRow[] = [];

  for (const group of groups.values()) {
    if (group.length === 1) {
      canonical.push(group[0]);
      continue;
    }

    const sorted = [...group].sort((left, right) => {
      const priorityDelta = sourcePriority(left) - sourcePriority(right);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return left.transactionDate.localeCompare(right.transactionDate);
    });

    canonical.push(sorted[0]);
  }

  return canonical;
}

export function isActivePostedPersonalFinanceTransaction(
  transaction: PersonalFinanceTransactionRow,
): boolean {
  return transaction.status === "posted";
}

export function shouldIncludeInPersonalFinanceScope(
  transaction: PersonalFinanceTransactionRow,
  excludeBusinessFromPersonal: boolean,
): boolean {
  if (!isActivePostedPersonalFinanceTransaction(transaction)) {
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

export function isIdentifiableDebtPayment(
  transaction: PersonalFinanceTransactionRow,
  categorySlugById: Map<string, string>,
): boolean {
  if (
    transaction.transactionType === "transfer" ||
    transaction.transactionType === "adjustment"
  ) {
    return true;
  }

  if (!transaction.categoryId) {
    return false;
  }

  const slug = categorySlugById.get(transaction.categoryId)?.toLowerCase();
  return slug !== undefined && EXCLUDED_CATEGORY_SLUGS.has(slug);
}

export function shouldIncludeInPersonalSpendingTotals(
  transaction: PersonalFinanceTransactionRow,
  excludeBusinessFromPersonal: boolean,
  categorySlugById: Map<string, string>,
  melusiTransactionIds: Set<string>,
): boolean {
  if (!shouldIncludeInPersonalFinanceScope(transaction, excludeBusinessFromPersonal)) {
    return false;
  }

  if (melusiTransactionIds.has(transaction.id)) {
    return false;
  }

  if (isIdentifiableDebtPayment(transaction, categorySlugById)) {
    return false;
  }

  return (
    transaction.transactionType === "expense" || transaction.transactionType === "refund"
  );
}

export function isPersonalSpendingExpense(
  transaction: PersonalFinanceTransactionRow,
): boolean {
  return transaction.transactionType === "expense" && transaction.amount < 0;
}

export function isPersonalSpendingRefund(
  transaction: PersonalFinanceTransactionRow,
): boolean {
  return transaction.transactionType === "refund" && transaction.amount > 0;
}

export function isTransactionInPersonalSpendingDateRange(
  transaction: PersonalFinanceTransactionRow,
  startDate: string,
  endDate: string,
): boolean {
  const effectiveDate = getEffectivePostedDate({
    postedDate: transaction.postedDate,
    transactionDate: transaction.transactionDate,
  });

  return isTransactionDateInRange(effectiveDate, startDate, endDate);
}

export function normalizePersonalFinanceFilter(value: unknown): string | null | "invalid" {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return "invalid";
  }

  const trimmed = value.trim().slice(0, 64);

  if (!trimmed) {
    return "invalid";
  }

  return trimmed.toLowerCase();
}

export function matchesPersonalFinanceMerchantFilter(
  transaction: PersonalFinanceTransactionRow,
  merchantFilter: string,
): boolean {
  const merchant = transaction.merchant?.trim().toLowerCase() ?? "";
  const description = transaction.description?.trim().toLowerCase() ?? "";
  const needle = merchantFilter.toLowerCase();

  return merchant.includes(needle) || description.includes(needle);
}

export function matchesPersonalFinanceCategoryFilter(
  transaction: PersonalFinanceTransactionRow,
  categoryFilter: string,
  categoryNameById: Map<string, string>,
): boolean {
  if (!transaction.categoryId) {
    return categoryFilter === "uncategorized";
  }

  const categoryName =
    categoryNameById.get(transaction.categoryId)?.trim().toLowerCase() ?? "";

  return categoryName.includes(categoryFilter);
}
