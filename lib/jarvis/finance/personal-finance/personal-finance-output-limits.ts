import {
  PERSONAL_FINANCE_HARD_MAX_BYTES,
  PERSONAL_FINANCE_MAX_CATEGORY_GROUPS,
  PERSONAL_FINANCE_MAX_MERCHANT_GROUPS,
  PERSONAL_FINANCE_MAX_RECURRING_ITEMS,
  PERSONAL_FINANCE_MAX_TRANSACTION_LIMIT,
} from "./personal-finance-constants";

function truncateArrayField<T>(
  result: Record<string, unknown>,
  field: string,
  maxItems: number,
): boolean {
  const value = result[field];

  if (!Array.isArray(value) || value.length <= maxItems) {
    return false;
  }

  result[field] = value.slice(0, maxItems);
  return true;
}

export function enforcePersonalFinanceOutputLimits(
  result: Record<string, unknown>,
): Record<string, unknown> {
  const limited = { ...result };
  let resultsLimited = false;

  resultsLimited =
    truncateArrayField(limited, "transactions", PERSONAL_FINANCE_MAX_TRANSACTION_LIMIT) ||
    resultsLimited;
  resultsLimited =
    truncateArrayField(limited, "categoryBreakdown", PERSONAL_FINANCE_MAX_CATEGORY_GROUPS) ||
    resultsLimited;
  resultsLimited =
    truncateArrayField(limited, "merchantBreakdown", PERSONAL_FINANCE_MAX_MERCHANT_GROUPS) ||
    resultsLimited;
  resultsLimited =
    truncateArrayField(limited, "upcomingRecurringObligations", 5) || resultsLimited;
  resultsLimited =
    truncateArrayField(limited, "recurringCharges", PERSONAL_FINANCE_MAX_RECURRING_ITEMS) ||
    resultsLimited;

  let serialized = JSON.stringify(limited);

  if (serialized.length > PERSONAL_FINANCE_HARD_MAX_BYTES) {
    return {
      success: false,
      error: "finance_query_failed",
    };
  }

  if (resultsLimited || serialized.length > PERSONAL_FINANCE_HARD_MAX_BYTES / 2) {
    limited.resultsLimited = true;
  }

  serialized = JSON.stringify(limited);

  if (serialized.length > PERSONAL_FINANCE_HARD_MAX_BYTES) {
    return {
      success: false,
      error: "finance_query_failed",
    };
  }

  return limited;
}
