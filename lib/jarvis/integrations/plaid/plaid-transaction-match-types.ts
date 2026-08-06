import type { FinanceTransactionType } from "@/lib/jarvis/finance/finance-types";

export const PLAID_MATCH_REASON_CODES = [
  "amount",
  "date",
  "posted_date",
  "merchant",
  "description",
  "transaction_type",
  "account",
] as const;

export type PlaidMatchReasonCode = (typeof PLAID_MATCH_REASON_CODES)[number];

export type PlaidPostedTransactionMatchInput = {
  providerTransactionId: string;
  pendingProviderTransactionId?: string | null;
  transactionDate: string;
  postedDate: string | null;
  amount: number;
  merchant: string | null;
  description: string | null;
  transactionType: FinanceTransactionType;
  status: "posted" | "pending";
};

export type PlaidPostedOnlyTransactionMatchInput = PlaidPostedTransactionMatchInput & {
  status: "posted";
  postedDate: string;
};

export type PlaidTransactionMatchResult =
  | {
      outcome: "matched_existing";
      financeTransactionId: string;
    }
  | {
      outcome: "review_required";
      reviewItemId: string;
      candidateCount: number;
    }
  | {
      outcome: "no_match";
    };

export type RocketMoneyCandidateRow = {
  id: string;
  account_id: string | null;
  transaction_date: string;
  posted_date: string | null;
  amount: number;
  merchant: string | null;
  description: string | null;
  transaction_type: FinanceTransactionType;
  status: string;
  source: string;
};

export type ScoredCandidate = {
  candidate: RocketMoneyCandidateRow;
  score: number;
  reasons: PlaidMatchReasonCode[];
  hasExactMerchantMatch: boolean;
  calendarDayDistance: number;
};
