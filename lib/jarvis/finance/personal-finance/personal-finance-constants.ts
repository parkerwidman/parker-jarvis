export const PERSONAL_FINANCE_MAX_SPENDING_WINDOW_DAYS = 90;
export const PERSONAL_FINANCE_DEFAULT_TRANSACTION_LIMIT = 15;
export const PERSONAL_FINANCE_MAX_TRANSACTION_LIMIT = 25;
export const PERSONAL_FINANCE_MAX_CATEGORY_GROUPS = 12;
export const PERSONAL_FINANCE_MAX_MERCHANT_GROUPS = 12;
export const PERSONAL_FINANCE_MAX_RECURRING_ITEMS = 20;
export const PERSONAL_FINANCE_DEFAULT_RECURRING_WINDOW_DAYS = 30;
export const PERSONAL_FINANCE_MIN_RECURRING_WINDOW_DAYS = 1;
export const PERSONAL_FINANCE_MAX_RECURRING_WINDOW_DAYS = 90;
export const PERSONAL_FINANCE_SUMMARY_MAX_UPCOMING_RECURRING = 5;
export const PERSONAL_FINANCE_MAX_FILTER_LENGTH = 64;
export const PERSONAL_FINANCE_MAX_DISPLAY_TEXT_LENGTH = 120;
export const PERSONAL_FINANCE_TARGET_MAX_BYTES = 12 * 1024;
export const PERSONAL_FINANCE_HARD_MAX_BYTES = 24 * 1024;
export const PERSONAL_FINANCE_MAX_TRANSACTIONS_LOAD = 2000;

export const PERSONAL_FINANCE_ERROR_CODES = {
  unauthorized: "unauthorized",
  finance_data_unavailable: "finance_data_unavailable",
  invalid_date_range: "invalid_date_range",
  invalid_filter: "invalid_filter",
  finance_query_failed: "finance_query_failed",
} as const;

export type PersonalFinanceErrorCode =
  (typeof PERSONAL_FINANCE_ERROR_CODES)[keyof typeof PERSONAL_FINANCE_ERROR_CODES];
