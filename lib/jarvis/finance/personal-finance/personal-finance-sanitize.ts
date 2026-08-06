import { PERSONAL_FINANCE_MAX_DISPLAY_TEXT_LENGTH } from "./personal-finance-constants";

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;

const FORBIDDEN_OUTPUT_KEYS = new Set([
  "userId",
  "user_id",
  "accountId",
  "account_id",
  "transactionId",
  "transaction_id",
  "categoryId",
  "category_id",
  "recurringItemId",
  "recurring_item_id",
  "reviewId",
  "review_id",
  "plaidConnectionId",
  "plaid_connection_id",
  "financeTransactionId",
  "finance_transaction_id",
  "financeAccountId",
  "finance_account_id",
  "itemId",
  "item_id",
  "providerAccountId",
  "provider_account_id",
  "providerTransactionId",
  "provider_transaction_id",
  "accessToken",
  "access_token",
  "encryptedAccessToken",
  "encrypted_access_token",
  "cursor",
  "transactionsCursor",
  "transactions_cursor",
  "deduplicationFingerprint",
  "deduplication_fingerprint",
  "fingerprint",
  "importBatchId",
  "import_batch_id",
  "lastFour",
  "last_four",
  "routingNumber",
  "routing_number",
  "accountNumber",
  "account_number",
]);

const FORBIDDEN_OUTPUT_PATTERNS = [
  /\bitem_[a-z0-9]+\b/i,
  /\btxn_[a-z0-9]+\b/i,
  /\bacct_[a-z0-9]+\b/i,
  /\baccess-[a-z0-9-]+\b/i,
];

export function sanitizeDisplayText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const withoutControlChars = value.replace(/[\u0000-\u001F\u007F]/g, " ");
  const collapsed = withoutControlChars.replace(/\s+/g, " ").trim();

  if (!collapsed) {
    return null;
  }

  return collapsed.slice(0, PERSONAL_FINANCE_MAX_DISPLAY_TEXT_LENGTH);
}

export function roundPersonalFinanceAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

function scanValueForPrivateIdentifiers(value: unknown, path: string): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    if (UUID_PATTERN.test(value)) {
      return true;
    }

    for (const pattern of FORBIDDEN_OUTPUT_PATTERNS) {
      if (pattern.test(value)) {
        return true;
      }
    }

    return false;
  }

  if (Array.isArray(value)) {
    return value.some((entry, index) =>
      scanValueForPrivateIdentifiers(entry, `${path}[${index}]`),
    );
  }

  if (typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_OUTPUT_KEYS.has(key)) {
        return true;
      }

      if (scanValueForPrivateIdentifiers(nestedValue, `${path}.${key}`)) {
        return true;
      }
    }
  }

  return false;
}

export function personalFinanceToolOutputContainsPrivateIdentifiers(
  output: Record<string, unknown>,
): boolean {
  UUID_PATTERN.lastIndex = 0;
  return scanValueForPrivateIdentifiers(output, "root");
}
