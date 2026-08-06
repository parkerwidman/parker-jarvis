const PAYMENT_PREFIX_PATTERN =
  /^(?:SQ\s\*|TST\s\*|SP\s\*|PP\s\*|PAYPAL\s\*|PAYPAL\s+|VENMO\s+|ZEL\s+|ZELLE\s+|AMZN\s+Mktp\s+|AMAZON\s+MKTPLCE\s+|CHECKCARD\s+|POS\s+|DEBIT\s+|ACH\s+|WEB\s+PAY\s+|ONLINE\s+PAYMENT\s+|PURCHASE\s+AUTHORIZED\s+ON\s+)/i;

export function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function removePunctuation(value: string): string {
  return value.replace(/[^\w\s]/g, " ");
}

export function normalizeCase(value: string): string {
  return value.toLowerCase();
}

export function stripSafePaymentPrefix(value: string): string {
  let current = value;
  let previous = "";

  while (current !== previous) {
    previous = current;
    current = current.replace(PAYMENT_PREFIX_PATTERN, "").trim();
  }

  return current;
}

export function normalizeMatchText(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const collapsed = collapseWhitespace(value);
  if (collapsed.length === 0) {
    return "";
  }

  const withoutPrefix = stripSafePaymentPrefix(collapsed);
  const withoutPunctuation = removePunctuation(withoutPrefix);
  const normalized = normalizeCase(collapseWhitespace(withoutPunctuation));

  return normalized.slice(0, 500);
}

export function normalizeMerchantText(value: string | null | undefined): string {
  return normalizeMatchText(value).slice(0, 200);
}

export function normalizeDescriptionText(value: string | null | undefined): string {
  return normalizeMatchText(value).slice(0, 500);
}

export function amountToCents(amount: number): number {
  if (!Number.isFinite(amount)) {
    return Number.NaN;
  }

  return Math.round(amount * 100);
}

export function amountsEqualAbsolute(left: number, right: number): boolean {
  const leftCents = amountToCents(Math.abs(left));
  const rightCents = amountToCents(Math.abs(right));

  if (!Number.isFinite(leftCents) || !Number.isFinite(rightCents)) {
    return false;
  }

  return leftCents === rightCents;
}

export function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

export function calendarDayDistance(leftDate: string, rightDate: string): number | null {
  const left = parseIsoDate(leftDate);
  const right = parseIsoDate(rightDate);

  if (!left || !right) {
    return null;
  }

  const millisecondsPerDay = 86_400_000;
  return Math.abs(Math.round((left.getTime() - right.getTime()) / millisecondsPerDay));
}

export function addCalendarDays(isoDate: string, dayDelta: number): string | null {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) {
    return null;
  }

  parsed.setUTCDate(parsed.getUTCDate() + dayDelta);
  return parsed.toISOString().slice(0, 10);
}

export function resolveCandidateComparisonDate(candidate: {
  posted_date: string | null;
  transaction_date: string;
}): string {
  return candidate.posted_date ?? candidate.transaction_date;
}

export function merchantContainsMatch(left: string, right: string): boolean {
  if (left.length === 0 || right.length === 0) {
    return false;
  }

  if (left === right) {
    return true;
  }

  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;

  return longer.includes(shorter) && shorter.length >= 4;
}

export function descriptionSimilarityScore(
  plaidDescription: string,
  candidateDescription: string,
): number {
  if (plaidDescription.length === 0 || candidateDescription.length === 0) {
    return 0;
  }

  if (plaidDescription === candidateDescription) {
    return 1;
  }

  if (
    merchantContainsMatch(plaidDescription, candidateDescription) ||
    merchantContainsMatch(candidateDescription, plaidDescription)
  ) {
    return 0.6;
  }

  const plaidTokens = new Set(plaidDescription.split(" ").filter((token) => token.length >= 3));
  const candidateTokens = candidateDescription.split(" ").filter((token) => token.length >= 3);

  if (plaidTokens.size === 0 || candidateTokens.length === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of candidateTokens) {
    if (plaidTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(plaidTokens.size, candidateTokens.length);
}
