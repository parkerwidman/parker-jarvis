import "server-only";

import { ensureFinanceFoundation } from "@/lib/jarvis/finance/ensure-finance-foundation";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  ROCKET_MONEY_MAX_DATA_ROWS,
  type RocketMoneyConfirmedImportInput,
  type RocketMoneyConfirmedImportRow,
  type RocketMoneyCostTreatment,
  type RocketMoneyImportErrorCode,
  type RocketMoneyImportFailureResult,
  type RocketMoneyImportResult,
  type RocketMoneyImportSuccessResult,
  type RocketMoneyRecurrenceProposal,
} from "./rocket-money-import-types";

const CONTENT_HASH_PATTERN = /^[a-f0-9]{64}$/;
const SOURCE_FINGERPRINT_PATTERN = /^rm:[a-f0-9]{64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type RocketMoneyImportRpcRow = {
  source_row_index: number;
  source_fingerprint: string;
  transaction_date: string;
  original_date: string | null;
  merchant: string;
  description: string | null;
  jarvis_amount: number;
  transaction_type: RocketMoneyConfirmedImportRow["transactionType"];
  personal_or_business: "business";
  business_context: "melusi";
  funding_source: RocketMoneyConfirmedImportRow["fundingSource"];
  cost_treatment: RocketMoneyCostTreatment;
  prepaid_months: number | null;
  service_through_date: string | null;
  classification_status: RocketMoneyConfirmedImportRow["classificationStatus"];
  notes: string | null;
  recurrence_proposal: RocketMoneyImportRpcRecurrence | null;
};

type RocketMoneyImportRpcRecurrence = {
  name: string;
  recurring_type: RocketMoneyRecurrenceProposal["recurringType"];
  frequency: RocketMoneyRecurrenceProposal["frequency"];
  expected_amount: number;
};

type RocketMoneyImportRpcPayload = {
  content_hash: string;
  business_category_id: string;
  default_reminder_days: number;
  rows: RocketMoneyImportRpcRow[];
};

type RocketMoneyImportRpcResponse = {
  success: boolean;
  code: string;
  batch_id?: string;
  imported_transaction_count?: unknown;
  recurring_item_count?: unknown;
  owner_funded_spending_total?: unknown;
  monthly_recurring_amount?: unknown;
  annual_recurring_amount?: unknown;
  estimated_annual_recurring_run_rate?: unknown;
};

const RPC_ERROR_CODES = new Set<RocketMoneyImportErrorCode>([
  "unauthenticated",
  "invalid_input",
  "preview_errors_present",
  "needs_review_present",
  "duplicate_rows_in_file",
  "no_importable_rows",
  "invalid_content_hash",
  "invalid_fingerprint",
  "batch_already_exists",
  "fingerprint_conflict",
  "invalid_classification",
  "recurrence_conflict",
  "category_not_found",
  "foundation_error",
  "import_failed",
]);

function failure(code: RocketMoneyImportErrorCode): RocketMoneyImportFailureResult {
  return { success: false, code };
}

function toNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function toRequiredNumber(value: unknown): number | null {
  const parsed = toNumeric(value);
  return parsed === null ? null : parsed;
}

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function recurrenceConflictsWithCostTreatment(
  costTreatment: RocketMoneyCostTreatment,
  proposal: RocketMoneyRecurrenceProposal | null,
): boolean {
  if (costTreatment === "monthly_recurring") {
    return proposal === null || proposal.frequency !== "monthly";
  }

  if (costTreatment === "annual_recurring") {
    return proposal === null || proposal.frequency !== "annual";
  }

  return proposal !== null;
}

function validateConfirmedRow(row: RocketMoneyConfirmedImportRow): RocketMoneyImportErrorCode | null {
  if (!Number.isInteger(row.sourceRowIndex) || row.sourceRowIndex < 0) {
    return "invalid_input";
  }

  if (!SOURCE_FINGERPRINT_PATTERN.test(row.sourceFingerprint)) {
    return "invalid_fingerprint";
  }

  if (!isValidIsoDate(row.transactionDate)) {
    return "invalid_input";
  }

  if (row.originalDate !== null && !isValidIsoDate(row.originalDate)) {
    return "invalid_input";
  }

  const merchant = row.merchant.trim();
  if (merchant.length < 1 || merchant.length > 200) {
    return "invalid_input";
  }

  if (row.description !== null && row.description.trim().length > 500) {
    return "invalid_input";
  }

  if (row.notes !== null && row.notes.trim().length > 1000) {
    return "invalid_input";
  }

  if (!Number.isFinite(row.jarvisAmount) || row.jarvisAmount === 0) {
    return "invalid_input";
  }

  if (row.transactionType === "expense" && row.jarvisAmount >= 0) {
    return "invalid_classification";
  }

  if (row.transactionType === "refund" && row.jarvisAmount <= 0) {
    return "invalid_classification";
  }

  if (row.personalOrBusiness !== "business" || row.businessContext !== "melusi") {
    return "invalid_classification";
  }

  if (row.classificationStatus === "needs_review") {
    return "needs_review_present";
  }

  if (row.classificationStatus !== "user_confirmed" && row.classificationStatus !== "inferred") {
    return "invalid_classification";
  }

  if (row.prepaidMonths !== null && (!Number.isInteger(row.prepaidMonths) || row.prepaidMonths <= 0)) {
    return "invalid_classification";
  }

  if (row.serviceThroughDate !== null && !isValidIsoDate(row.serviceThroughDate)) {
    return "invalid_classification";
  }

  if (recurrenceConflictsWithCostTreatment(row.costTreatment, row.recurrenceProposal)) {
    return "recurrence_conflict";
  }

  if (row.transactionType === "refund" && row.recurrenceProposal !== null) {
    return "recurrence_conflict";
  }

  if (row.recurrenceProposal !== null) {
    const proposal = row.recurrenceProposal;
    const proposalName = proposal.name.trim();

    if (proposalName.length < 1 || proposalName.length > 200) {
      return "invalid_input";
    }

    if (proposal.recurringType !== "subscription") {
      return "recurrence_conflict";
    }

    if (!Number.isFinite(proposal.expectedAmount) || proposal.expectedAmount <= 0) {
      return "invalid_input";
    }
  }

  return null;
}

export function validateConfirmedImportInput(
  input: RocketMoneyConfirmedImportInput,
): RocketMoneyImportFailureResult | null {
  if (!CONTENT_HASH_PATTERN.test(input.contentHash)) {
    return failure("invalid_content_hash");
  }

  if (input.previewErrors.length > 0) {
    return failure("preview_errors_present");
  }

  if (input.rows.length === 0) {
    return failure("no_importable_rows");
  }

  if (input.rows.length > ROCKET_MONEY_MAX_DATA_ROWS) {
    return failure("invalid_input");
  }

  const seenFingerprints = new Set<string>();
  const seenSourceRowIndexes = new Set<number>();

  for (const row of input.rows) {
    const rowError = validateConfirmedRow(row);
    if (rowError) {
      return failure(rowError);
    }

    if (seenSourceRowIndexes.has(row.sourceRowIndex)) {
      return failure("duplicate_rows_in_file");
    }

    if (seenFingerprints.has(row.sourceFingerprint)) {
      return failure("duplicate_rows_in_file");
    }

    seenSourceRowIndexes.add(row.sourceRowIndex);
    seenFingerprints.add(row.sourceFingerprint);
  }

  return null;
}

function mapRecurrenceProposal(
  proposal: RocketMoneyRecurrenceProposal | null,
): RocketMoneyImportRpcRecurrence | null {
  if (!proposal) {
    return null;
  }

  return {
    name: proposal.name.trim(),
    recurring_type: proposal.recurringType,
    frequency: proposal.frequency,
    expected_amount: proposal.expectedAmount,
  };
}

export function shapeRocketMoneyImportRpcPayload(
  input: RocketMoneyConfirmedImportInput,
  businessCategoryId: string,
  defaultReminderDays: number,
): RocketMoneyImportRpcPayload {
  return {
    content_hash: input.contentHash,
    business_category_id: businessCategoryId,
    default_reminder_days: defaultReminderDays,
    rows: input.rows.map((row) => ({
      source_row_index: row.sourceRowIndex,
      source_fingerprint: row.sourceFingerprint,
      transaction_date: row.transactionDate,
      original_date: row.originalDate,
      merchant: row.merchant.trim(),
      description: row.description?.trim() ? row.description.trim() : null,
      jarvis_amount: row.jarvisAmount,
      transaction_type: row.transactionType,
      personal_or_business: "business",
      business_context: "melusi",
      funding_source: row.fundingSource,
      cost_treatment: row.costTreatment,
      prepaid_months: row.prepaidMonths,
      service_through_date: row.serviceThroughDate,
      classification_status: row.classificationStatus,
      notes: row.notes?.trim() ? row.notes.trim() : null,
      recurrence_proposal: mapRecurrenceProposal(row.recurrenceProposal),
    })),
  };
}

function isRpcErrorCode(value: string): value is RocketMoneyImportErrorCode {
  return RPC_ERROR_CODES.has(value as RocketMoneyImportErrorCode);
}

export function parseRocketMoneyImportRpcResult(data: unknown): RocketMoneyImportResult {
  if (!data || typeof data !== "object") {
    return failure("import_failed");
  }

  const response = data as RocketMoneyImportRpcResponse;

  if (typeof response.success !== "boolean" || typeof response.code !== "string") {
    return failure("import_failed");
  }

  if (!response.success) {
    if (isRpcErrorCode(response.code)) {
      return failure(response.code);
    }

    return failure("import_failed");
  }

  if (response.code !== "completed") {
    return failure("import_failed");
  }

  const batchId = response.batch_id;
  const importedTransactionCount = toRequiredNumber(response.imported_transaction_count);
  const recurringItemCount = toRequiredNumber(response.recurring_item_count);
  const ownerFundedSpendingTotal = toRequiredNumber(response.owner_funded_spending_total);
  const monthlyRecurringAmount = toRequiredNumber(response.monthly_recurring_amount);
  const annualRecurringAmount = toRequiredNumber(response.annual_recurring_amount);
  const estimatedAnnualRecurringRunRate = toRequiredNumber(
    response.estimated_annual_recurring_run_rate,
  );

  if (
    typeof batchId !== "string" ||
    batchId.length === 0 ||
    importedTransactionCount === null ||
    recurringItemCount === null ||
    ownerFundedSpendingTotal === null ||
    monthlyRecurringAmount === null ||
    annualRecurringAmount === null ||
    estimatedAnnualRecurringRunRate === null ||
    importedTransactionCount < 0 ||
    recurringItemCount < 0
  ) {
    return failure("import_failed");
  }

  const successResult: RocketMoneyImportSuccessResult = {
    success: true,
    code: "completed",
    batchId,
    importedTransactionCount,
    recurringItemCount,
    ownerFundedSpendingTotal,
    monthlyRecurringAmount,
    annualRecurringAmount,
    estimatedAnnualRecurringRunRate,
  };

  return successResult;
}

async function resolveBusinessCategoryId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("finance_categories")
    .select("id")
    .eq("user_id", userId)
    .eq("slug", "business")
    .eq("category_kind", "expense")
    .eq("active", true)
    .maybeSingle();

  if (error || !data?.id) {
    return null;
  }

  return data.id;
}

export async function importRocketMoneyBusinessExpenses(
  supabase: SupabaseClient,
  userId: string,
  input: RocketMoneyConfirmedImportInput,
): Promise<RocketMoneyImportResult> {
  const validationFailure = validateConfirmedImportInput(input);
  if (validationFailure) {
    return validationFailure;
  }

  const foundation = await ensureFinanceFoundation(supabase, userId);
  if (!foundation.success) {
    return failure("foundation_error");
  }

  const businessCategoryId = await resolveBusinessCategoryId(supabase, userId);
  if (!businessCategoryId) {
    return failure("category_not_found");
  }

  const rpcPayload = shapeRocketMoneyImportRpcPayload(
    input,
    businessCategoryId,
    foundation.preferences.defaultReminderDays,
  );

  const { data, error } = await supabase.rpc("import_rocket_money_business_expenses", {
    p_input: rpcPayload,
  });

  if (error) {
    return failure("import_failed");
  }

  return parseRocketMoneyImportRpcResult(data);
}
