import type { FinanceTransactionType } from "@/lib/jarvis/finance/finance-types";
import {
  amountsEqualAbsolute,
  calendarDayDistance,
  descriptionSimilarityScore,
  merchantContainsMatch,
  normalizeDescriptionText,
  normalizeMerchantText,
  resolveCandidateComparisonDate,
} from "@/lib/jarvis/integrations/plaid/plaid-transaction-match-normalization";
import type {
  PlaidMatchReasonCode,
  PlaidPostedOnlyTransactionMatchInput,
  RocketMoneyCandidateRow,
  ScoredCandidate,
} from "@/lib/jarvis/integrations/plaid/plaid-transaction-match-types";

export const PLAID_AUTO_MATCH_SCORE_THRESHOLD = 85;
export const PLAID_MATCH_AMBIGUITY_SCORE_GAP = 8;

const DATE_SCORE_BY_DISTANCE: Record<number, number> = {
  0: 30,
  1: 24,
  2: 18,
  3: 12,
};

const EXACT_MERCHANT_SCORE = 40;
const PARTIAL_MERCHANT_SCORE = 12;
const DESCRIPTION_SCORE_MAX = 10;
const AMOUNT_SCORE = 15;
const ACCOUNT_SCORE = 5;

export function transactionTypesCompatible(
  plaidType: FinanceTransactionType,
  candidateType: FinanceTransactionType,
  plaidAmount: number,
  candidateAmount: number,
): boolean {
  if (plaidType !== candidateType) {
    return false;
  }

  switch (plaidType) {
    case "expense":
      return plaidAmount < 0 && candidateAmount < 0;
    case "refund":
    case "income":
      return plaidAmount > 0 && candidateAmount > 0;
    case "transfer":
    case "adjustment":
      return Math.sign(plaidAmount) === Math.sign(candidateAmount);
    default:
      return false;
  }
}

export function isCandidateEligible(
  input: PlaidPostedOnlyTransactionMatchInput,
  candidate: RocketMoneyCandidateRow,
  financeAccountId: string,
  mappedProviderTransactionIds: ReadonlyMap<string, string>,
): boolean {
  if (candidate.source !== "rocket_money_csv" || candidate.status !== "posted") {
    return false;
  }

  if (
    candidate.account_id !== null &&
    candidate.account_id !== financeAccountId
  ) {
    return false;
  }

  if (!amountsEqualAbsolute(input.amount, candidate.amount)) {
    return false;
  }

  if (
    !transactionTypesCompatible(
      input.transactionType,
      candidate.transaction_type,
      input.amount,
      candidate.amount,
    )
  ) {
    return false;
  }

  const comparisonDate = resolveCandidateComparisonDate(candidate);
  const dayDistance = calendarDayDistance(input.postedDate, comparisonDate);
  if (dayDistance === null || dayDistance > 3) {
    return false;
  }

  const existingProviderTransactionId = mappedProviderTransactionIds.get(candidate.id);
  if (
    existingProviderTransactionId &&
    existingProviderTransactionId !== input.providerTransactionId
  ) {
    return false;
  }

  return true;
}

export function scoreCandidate(
  input: PlaidPostedOnlyTransactionMatchInput,
  candidate: RocketMoneyCandidateRow,
  financeAccountId: string,
): ScoredCandidate {
  const reasons: PlaidMatchReasonCode[] = ["amount", "transaction_type"];
  const normalizedPlaidMerchant = normalizeMerchantText(input.merchant);
  const normalizedCandidateMerchant = normalizeMerchantText(candidate.merchant);
  const normalizedPlaidDescription = normalizeDescriptionText(input.description);
  const normalizedCandidateDescription = normalizeDescriptionText(candidate.description);

  const comparisonDate = resolveCandidateComparisonDate(candidate);
  const dayDistance = calendarDayDistance(input.postedDate, comparisonDate) ?? 99;

  let score = AMOUNT_SCORE + DATE_SCORE_BY_DISTANCE[dayDistance];
  reasons.push("posted_date");
  if (candidate.transaction_date !== comparisonDate) {
    reasons.push("date");
  }

  const hasExactMerchantMatch =
    normalizedPlaidMerchant.length > 0 &&
    normalizedCandidateMerchant.length > 0 &&
    normalizedPlaidMerchant === normalizedCandidateMerchant;

  if (hasExactMerchantMatch) {
    score += EXACT_MERCHANT_SCORE;
    reasons.push("merchant");
  } else if (
    merchantContainsMatch(normalizedPlaidMerchant, normalizedCandidateMerchant)
  ) {
    score += PARTIAL_MERCHANT_SCORE;
    reasons.push("merchant");
  } else if (normalizedPlaidMerchant.length === 0 || normalizedCandidateMerchant.length === 0) {
    score -= 10;
  }

  const descriptionScore = descriptionSimilarityScore(
    normalizedPlaidDescription,
    normalizedCandidateDescription,
  );
  if (descriptionScore > 0) {
    score += Math.round(descriptionScore * DESCRIPTION_SCORE_MAX);
    reasons.push("description");
  }

  if (candidate.account_id === financeAccountId) {
    score += ACCOUNT_SCORE;
    reasons.push("account");
  }

  return {
    candidate,
    score: Math.max(0, Math.min(100, score)),
    reasons: [...new Set(reasons)],
    hasExactMerchantMatch,
    calendarDayDistance: dayDistance,
  };
}

export function selectAutoMatchCandidate(
  scoredCandidates: readonly ScoredCandidate[],
): ScoredCandidate | null {
  if (scoredCandidates.length !== 1) {
    return null;
  }

  const [candidate] = scoredCandidates;
  if (
    !candidate.hasExactMerchantMatch ||
    candidate.score < PLAID_AUTO_MATCH_SCORE_THRESHOLD
  ) {
    return null;
  }

  return candidate;
}

export function hasAmbiguousCandidates(scoredCandidates: readonly ScoredCandidate[]): boolean {
  if (scoredCandidates.length < 2) {
    return false;
  }

  const sorted = [...scoredCandidates].sort((left, right) => right.score - left.score);
  const top = sorted[0];
  const runnerUp = sorted[1];

  return top.score - runnerUp.score < PLAID_MATCH_AMBIGUITY_SCORE_GAP;
}

export function scoreEligibleCandidates(
  input: PlaidPostedOnlyTransactionMatchInput,
  candidates: readonly RocketMoneyCandidateRow[],
  financeAccountId: string,
  mappedProviderTransactionIds: ReadonlyMap<string, string>,
): ScoredCandidate[] {
  return candidates
    .filter((candidate) =>
      isCandidateEligible(input, candidate, financeAccountId, mappedProviderTransactionIds),
    )
    .map((candidate) => scoreCandidate(input, candidate, financeAccountId))
    .sort((left, right) => right.score - left.score);
}
