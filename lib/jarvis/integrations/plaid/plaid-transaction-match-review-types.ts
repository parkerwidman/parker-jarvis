export type PlaidReviewCandidateView = {
  candidateKey: string;
  merchantLabel: string;
  transactionDate: string;
  postedDate: string | null;
  formattedAmount: string;
  transactionTypeLabel: string;
  personalOrBusinessLabel: string;
  recurringStatusLabel: string | null;
  matchScore: number;
  matchReasonLabels: string[];
};

export type PlaidReviewPendingItemView = {
  reviewKey: string;
  merchantLabel: string;
  transactionDate: string;
  postedDate: string;
  formattedAmount: string;
  transactionTypeLabel: string;
  accountDisplayLabel: string | null;
  candidateCount: number;
  pauseReason: string;
  candidates: PlaidReviewCandidateView[];
  createdAt: string;
};

export type PlaidReviewResolvedItemView = {
  reviewKey: string;
  merchantLabel: string;
  transactionDate: string;
  postedDate: string;
  formattedAmount: string;
  transactionTypeLabel: string;
  accountDisplayLabel: string | null;
  resolutionOutcomeLabel: string;
  resolvedAtLabel: string;
};

export type PlaidTransactionMatchReviewData = {
  timezone: string;
  pendingCount: number;
  pendingItems: PlaidReviewPendingItemView[];
  recentResolvedItems: PlaidReviewResolvedItemView[];
};

export function getPlaidReviewPagePresentation(
  data: PlaidTransactionMatchReviewData,
): {
  showPending: boolean;
  showEmpty: boolean;
  showRecent: boolean;
  pendingCount: number;
} {
  return {
    showPending: data.pendingItems.length > 0,
    showEmpty: data.pendingItems.length === 0,
    showRecent: data.recentResolvedItems.length > 0,
    pendingCount: data.pendingCount,
  };
}

const FORBIDDEN_VIEW_MODEL_KEYS = [
  "plaidTransactionId",
  "providerTransactionId",
  "pendingPlaidTransactionId",
  "plaidConnectionId",
  "financeAccountId",
  "financeTransactionId",
  "accessToken",
  "itemId",
  "accountId",
] as const;

export function reviewViewContainsPrivateIdentifiers(
  data: PlaidTransactionMatchReviewData,
): boolean {
  const serialized = JSON.stringify(data);

  if (/txn_|item_|access_|provider/i.test(serialized)) {
    return true;
  }

  return FORBIDDEN_VIEW_MODEL_KEYS.some((key) => serialized.includes(`"${key}"`));
}
