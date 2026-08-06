import type {
  FinanceFrequency,
  FinancePersonalOrBusiness,
  FinanceTransactionType,
} from "./finance-types";

export const ROCKET_MONEY_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const ROCKET_MONEY_MAX_DATA_ROWS = 5_000;

export const ROCKET_MONEY_REQUIRED_HEADERS = [
  "Date",
  "Original Date",
  "Account Type",
  "Account Name",
  "Account Number",
  "Institution Name",
  "Name",
  "Custom Name",
  "Amount",
  "Description",
  "Category",
  "Note",
  "Ignored From",
  "Tax Deductible",
  "Transaction Tags",
] as const;

export type RocketMoneyRequiredHeader =
  (typeof ROCKET_MONEY_REQUIRED_HEADERS)[number];

export type RocketMoneyFundingSource =
  | "owner_funded"
  | "business_account"
  | "unknown";

export type RocketMoneyCostTreatment =
  | "one_time"
  | "monthly_recurring"
  | "annual_recurring"
  | "prepaid"
  | "unknown";

export type RocketMoneyClassificationStatus =
  | "user_confirmed"
  | "inferred"
  | "needs_review";

export type RocketMoneyBusinessContext = "melusi";

export type RocketMoneyParsedSourceRow = {
  sourceRowIndex: number;
  date: string;
  originalDate: string;
  name: string;
  customName: string;
  amount: string;
  description: string;
  category: string;
  note: string;
  ignoredFrom: string;
  taxDeductible: string;
  transactionTags: string;
};

export type RocketMoneyBusinessClassification = {
  businessContext: RocketMoneyBusinessContext;
  fundingSource: RocketMoneyFundingSource;
  costTreatment: RocketMoneyCostTreatment;
  prepaidMonths: number | null;
  serviceThroughDate: string | null;
  classificationStatus: RocketMoneyClassificationStatus;
};

export type RocketMoneyRecurrenceProposal = {
  name: string;
  recurringType: "subscription";
  frequency: FinanceFrequency;
  expectedAmount: number;
};

export type RocketMoneyPreviewValidationError = {
  rowNumber: number | null;
  code: string;
  message: string;
};

export type RocketMoneyPreviewTransaction = {
  sourceRowIndex: number;
  sourceFingerprint: string;
  transactionDate: string;
  originalDate: string | null;
  merchant: string;
  description: string | null;
  rocketMoneyCategory: string | null;
  rocketMoneyAmount: number;
  jarvisAmount: number;
  transactionType: FinanceTransactionType;
  personalOrBusiness: Extract<FinancePersonalOrBusiness, "business">;
  businessContext: RocketMoneyBusinessContext;
  fundingSource: RocketMoneyFundingSource;
  costTreatment: RocketMoneyCostTreatment;
  prepaidMonths: number | null;
  serviceThroughDate: string | null;
  classificationStatus: RocketMoneyClassificationStatus;
  recurrenceProposal: RocketMoneyRecurrenceProposal | null;
  isDuplicate: boolean;
  notes: string | null;
};

export type RocketMoneyImportTotals = {
  ownerFundedSpending: number;
  oneTimeSpending: number;
  prepaidSpending: number;
  monthlyRecurringAmount: number;
  annualRecurringAmount: number;
  estimatedAnnualRecurringRunRate: number;
  refundTotal: number;
  validRowCount: number;
  duplicateRowCount: number;
  errorRowCount: number;
  needsReviewCount: number;
};

export type RocketMoneyCsvParseResult = {
  rows: RocketMoneyParsedSourceRow[];
  errors: RocketMoneyPreviewValidationError[];
};

export type RocketMoneyPreviewResult = {
  contentHash: string;
  transactions: RocketMoneyPreviewTransaction[];
  errors: RocketMoneyPreviewValidationError[];
  totals: RocketMoneyImportTotals;
};

export type RocketMoneyImportErrorCode =
  | "unauthenticated"
  | "invalid_input"
  | "preview_errors_present"
  | "needs_review_present"
  | "duplicate_rows_in_file"
  | "no_importable_rows"
  | "invalid_content_hash"
  | "invalid_fingerprint"
  | "batch_already_exists"
  | "fingerprint_conflict"
  | "invalid_classification"
  | "recurrence_conflict"
  | "category_not_found"
  | "foundation_error"
  | "import_failed";

export type RocketMoneyConfirmedImportRow = {
  sourceRowIndex: number;
  sourceFingerprint: string;
  transactionDate: string;
  originalDate: string | null;
  merchant: string;
  description: string | null;
  rocketMoneyCategory: string | null;
  jarvisAmount: number;
  transactionType: FinanceTransactionType;
  personalOrBusiness: Extract<FinancePersonalOrBusiness, "business">;
  businessContext: RocketMoneyBusinessContext;
  fundingSource: RocketMoneyFundingSource;
  costTreatment: RocketMoneyCostTreatment;
  prepaidMonths: number | null;
  serviceThroughDate: string | null;
  classificationStatus: RocketMoneyClassificationStatus;
  notes: string | null;
  recurrenceProposal: RocketMoneyRecurrenceProposal | null;
};

export type RocketMoneyConfirmedImportInput = {
  contentHash: string;
  rows: RocketMoneyConfirmedImportRow[];
  previewErrors: RocketMoneyPreviewValidationError[];
};

export type RocketMoneyImportSuccessResult = {
  success: true;
  code: "completed";
  batchId: string;
  importedTransactionCount: number;
  recurringItemCount: number;
  ownerFundedSpendingTotal: number;
  monthlyRecurringAmount: number;
  annualRecurringAmount: number;
  estimatedAnnualRecurringRunRate: number;
};

export type RocketMoneyImportFailureResult = {
  success: false;
  code: RocketMoneyImportErrorCode;
};

export type RocketMoneyImportResult =
  | RocketMoneyImportSuccessResult
  | RocketMoneyImportFailureResult;
