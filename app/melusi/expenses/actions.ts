"use server";

import type { FinanceFrequency } from "@/lib/jarvis/finance/finance-types";
import {
  buildRocketMoneyBusinessPreview,
  parseRocketMoneyBusinessCsv,
} from "@/lib/jarvis/finance/rocket-money-csv-parser";
import { importRocketMoneyBusinessExpenses } from "@/lib/jarvis/finance/rocket-money-import-service";
import {
  ROCKET_MONEY_MAX_FILE_BYTES,
  type RocketMoneyClassificationStatus,
  type RocketMoneyConfirmedImportRow,
  type RocketMoneyCostTreatment,
  type RocketMoneyFundingSource,
  type RocketMoneyImportErrorCode,
  type RocketMoneyImportTotals,
  type RocketMoneyPreviewTransaction,
  type RocketMoneyPreviewValidationError,
  type RocketMoneyRecurrenceProposal,
} from "@/lib/jarvis/finance/rocket-money-import-types";
import { createClient } from "@/lib/supabase/server";

export type SanitizedPreviewTransaction = {
  previewRowKey: number;
  transactionDate: string;
  merchant: string;
  description: string | null;
  rocketMoneyCategory: string | null;
  rocketMoneyAmount: number;
  jarvisAmount: number;
  transactionType: RocketMoneyPreviewTransaction["transactionType"];
  fundingSource: RocketMoneyPreviewTransaction["fundingSource"];
  costTreatment: RocketMoneyPreviewTransaction["costTreatment"];
  prepaidMonths: number | null;
  serviceThroughDate: string | null;
  classificationStatus: RocketMoneyPreviewTransaction["classificationStatus"];
  recurrenceProposal: RocketMoneyRecurrenceProposal | null;
  isDuplicate: boolean;
  notes: string | null;
};

export type ClassificationOverridePayload = {
  previewRowKey: number;
  fundingSource: RocketMoneyFundingSource;
  costTreatment: RocketMoneyCostTreatment;
  prepaidMonths: number | null;
  serviceThroughDate: string | null;
  classificationStatus: RocketMoneyClassificationStatus;
  recurrenceFrequency: FinanceFrequency | null;
  notes: string | null;
};

export type RocketMoneyImportActionSuccess = {
  success: true;
  importedTransactionCount: number;
  recurringItemCount: number;
  ownerFundedSpendingTotal: number;
  monthlyRecurringAmount: number;
  annualRecurringAmount: number;
  estimatedAnnualRecurringRunRate: number;
};

export type RocketMoneyImportActionResult =
  | RocketMoneyImportActionSuccess
  | { success: false; error: string };

export type SanitizedRocketMoneyPreview = {
  transactions: SanitizedPreviewTransaction[];
  errors: RocketMoneyPreviewValidationError[];
  totals: RocketMoneyImportTotals;
};

export type RocketMoneyPreviewActionResult =
  | { success: true; preview: SanitizedRocketMoneyPreview }
  | { success: false; error: string };

const CSV_FIELD_NAME = "csvFile";
const OVERRIDES_FIELD_NAME = "classificationOverrides";
const CONFIRMATION_FIELD_NAME = "confirmed";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const FUNDING_SOURCES = new Set<RocketMoneyFundingSource>([
  "owner_funded",
  "business_account",
  "unknown",
]);

const COST_TREATMENTS = new Set<RocketMoneyCostTreatment>([
  "one_time",
  "monthly_recurring",
  "annual_recurring",
  "prepaid",
  "unknown",
]);

const CLASSIFICATION_STATUSES = new Set<RocketMoneyClassificationStatus>([
  "user_confirmed",
  "inferred",
  "needs_review",
]);

const RECURRENCE_FREQUENCIES = new Set<FinanceFrequency>(["monthly", "annual"]);

const CSV_CONTENT_TYPES = new Set([
  "",
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "text/plain",
]);

function isCsvFile(file: File): boolean {
  const lowerName = file.name.trim().toLowerCase();
  if (lowerName.endsWith(".csv")) {
    return true;
  }

  const contentType = file.type.trim().toLowerCase();
  return CSV_CONTENT_TYPES.has(contentType);
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

function sanitizeTransaction(
  transaction: RocketMoneyPreviewTransaction,
): SanitizedPreviewTransaction {
  return {
    previewRowKey: transaction.sourceRowIndex,
    transactionDate: transaction.transactionDate,
    merchant: transaction.merchant,
    description: transaction.description,
    rocketMoneyCategory: transaction.rocketMoneyCategory,
    rocketMoneyAmount: transaction.rocketMoneyAmount,
    jarvisAmount: transaction.jarvisAmount,
    transactionType: transaction.transactionType,
    fundingSource: transaction.fundingSource,
    costTreatment: transaction.costTreatment,
    prepaidMonths: transaction.prepaidMonths,
    serviceThroughDate: transaction.serviceThroughDate,
    classificationStatus: transaction.classificationStatus,
    recurrenceProposal: transaction.recurrenceProposal,
    isDuplicate: transaction.isDuplicate,
    notes: transaction.notes,
  };
}

function sanitizePreview(
  preview: ReturnType<typeof buildRocketMoneyBusinessPreview>,
): SanitizedRocketMoneyPreview {
  return {
    transactions: preview.transactions.map(sanitizeTransaction),
    errors: preview.errors,
    totals: preview.totals,
  };
}

async function requireAuthenticatedUserId(): Promise<{
  userId: string;
  supabase: Awaited<ReturnType<typeof createClient>>;
} | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return null;
  }

  const userId =
    typeof data.claims.sub === "string" ? data.claims.sub : null;

  if (!userId) {
    return null;
  }

  return { userId, supabase };
}

async function readCsvFileFromFormData(
  formData: FormData,
): Promise<{ buffer: Buffer } | { error: string }> {
  const fileValue = formData.get(CSV_FIELD_NAME);

  if (!(fileValue instanceof File)) {
    return { error: "Select a Rocket Money CSV file to continue." };
  }

  if (fileValue.size === 0) {
    return { error: "The selected CSV file is empty." };
  }

  if (!isCsvFile(fileValue)) {
    return { error: "Upload a .csv file exported from Rocket Money." };
  }

  if (fileValue.size > ROCKET_MONEY_MAX_FILE_BYTES) {
    return { error: "CSV file must be 2 MB or smaller." };
  }

  let csvBuffer: Buffer;

  try {
    csvBuffer = Buffer.from(await fileValue.arrayBuffer());
  } catch {
    return { error: "Could not read the uploaded file." };
  }

  if (csvBuffer.byteLength > ROCKET_MONEY_MAX_FILE_BYTES) {
    return { error: "CSV file must be 2 MB or smaller." };
  }

  return { buffer: csvBuffer };
}

function parseClassificationOverrides(
  rawValue: FormDataEntryValue | null,
): { overrides: ClassificationOverridePayload[] } | { error: string } {
  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    return { error: "Classification data is missing." };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawValue);
  } catch {
    return { error: "Classification data is invalid." };
  }

  if (!Array.isArray(parsed)) {
    return { error: "Classification data is invalid." };
  }

  const overrides: ClassificationOverridePayload[] = [];
  const seenKeys = new Set<number>();

  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") {
      return { error: "Classification data is invalid." };
    }

    const record = entry as Record<string, unknown>;
    const previewRowKey = record.previewRowKey;

    if (
      typeof previewRowKey !== "number" ||
      !Number.isInteger(previewRowKey) ||
      previewRowKey < 0
    ) {
      return { error: "Classification data is invalid." };
    }

    if (seenKeys.has(previewRowKey)) {
      return { error: "Classification data is invalid." };
    }

    seenKeys.add(previewRowKey);

    const fundingSource = record.fundingSource;
    const costTreatment = record.costTreatment;
    const classificationStatus = record.classificationStatus;

    if (
      typeof fundingSource !== "string" ||
      !FUNDING_SOURCES.has(fundingSource as RocketMoneyFundingSource) ||
      typeof costTreatment !== "string" ||
      !COST_TREATMENTS.has(costTreatment as RocketMoneyCostTreatment) ||
      typeof classificationStatus !== "string" ||
      !CLASSIFICATION_STATUSES.has(
        classificationStatus as RocketMoneyClassificationStatus,
      )
    ) {
      return { error: "Classification data is invalid." };
    }

    let prepaidMonths: number | null = null;
    if (record.prepaidMonths !== null && record.prepaidMonths !== undefined) {
      if (
        typeof record.prepaidMonths !== "number" ||
        !Number.isInteger(record.prepaidMonths)
      ) {
        return { error: "Classification data is invalid." };
      }

      prepaidMonths = record.prepaidMonths;
    }

    let serviceThroughDate: string | null = null;
    if (
      record.serviceThroughDate !== null &&
      record.serviceThroughDate !== undefined
    ) {
      if (typeof record.serviceThroughDate !== "string") {
        return { error: "Classification data is invalid." };
      }

      serviceThroughDate = record.serviceThroughDate;
    }

    let recurrenceFrequency: FinanceFrequency | null = null;
    if (
      record.recurrenceFrequency !== null &&
      record.recurrenceFrequency !== undefined
    ) {
      if (
        typeof record.recurrenceFrequency !== "string" ||
        !RECURRENCE_FREQUENCIES.has(record.recurrenceFrequency as FinanceFrequency)
      ) {
        return { error: "Classification data is invalid." };
      }

      recurrenceFrequency = record.recurrenceFrequency as FinanceFrequency;
    }

    let notes: string | null = null;
    if (record.notes !== null && record.notes !== undefined) {
      if (typeof record.notes !== "string") {
        return { error: "Classification data is invalid." };
      }

      notes = record.notes.trim().length > 0 ? record.notes.trim() : null;

      if (notes !== null && notes.length > 1000) {
        return { error: "Classification data is invalid." };
      }
    }

    overrides.push({
      previewRowKey,
      fundingSource: fundingSource as RocketMoneyFundingSource,
      costTreatment: costTreatment as RocketMoneyCostTreatment,
      prepaidMonths,
      serviceThroughDate,
      classificationStatus:
        classificationStatus as RocketMoneyClassificationStatus,
      recurrenceFrequency,
      notes,
    });
  }

  return { overrides };
}

function buildServerRecurrenceProposal(
  transaction: RocketMoneyPreviewTransaction,
  costTreatment: RocketMoneyCostTreatment,
  recurrenceFrequency: FinanceFrequency | null,
): RocketMoneyRecurrenceProposal | null | "invalid" {
  if (transaction.transactionType === "refund") {
    return recurrenceFrequency === null ? null : "invalid";
  }

  if (costTreatment === "monthly_recurring") {
    if (recurrenceFrequency !== "monthly") {
      return "invalid";
    }

    return {
      name: transaction.merchant,
      recurringType: "subscription",
      frequency: "monthly",
      expectedAmount: Math.abs(transaction.jarvisAmount),
    };
  }

  if (costTreatment === "annual_recurring") {
    if (recurrenceFrequency !== "annual") {
      return "invalid";
    }

    return {
      name: transaction.merchant,
      recurringType: "subscription",
      frequency: "annual",
      expectedAmount: Math.abs(transaction.jarvisAmount),
    };
  }

  if (recurrenceFrequency !== null) {
    return "invalid";
  }

  return null;
}

function applyClassificationOverride(
  transaction: RocketMoneyPreviewTransaction,
  override: ClassificationOverridePayload,
): RocketMoneyConfirmedImportRow | { error: string } {
  if (
    override.fundingSource === "unknown" ||
    override.costTreatment === "unknown" ||
    override.classificationStatus === "needs_review"
  ) {
    return { error: "Resolve all classification issues before importing." };
  }

  if (
    override.serviceThroughDate !== null &&
    !isValidIsoDate(override.serviceThroughDate)
  ) {
    return { error: "Resolve all classification issues before importing." };
  }

  if (override.costTreatment === "prepaid") {
    if (override.prepaidMonths === null || override.prepaidMonths <= 0) {
      return { error: "Resolve all classification issues before importing." };
    }
  }

  const recurrenceProposal = buildServerRecurrenceProposal(
    transaction,
    override.costTreatment,
    override.recurrenceFrequency,
  );

  if (recurrenceProposal === "invalid") {
    return { error: "Resolve recurrence settings before importing." };
  }

  return {
    sourceRowIndex: transaction.sourceRowIndex,
    sourceFingerprint: transaction.sourceFingerprint,
    transactionDate: transaction.transactionDate,
    originalDate: transaction.originalDate,
    merchant: transaction.merchant,
    description: transaction.description,
    rocketMoneyCategory: transaction.rocketMoneyCategory,
    jarvisAmount: transaction.jarvisAmount,
    transactionType: transaction.transactionType,
    personalOrBusiness: transaction.personalOrBusiness,
    businessContext: transaction.businessContext,
    fundingSource: override.fundingSource,
    costTreatment: override.costTreatment,
    prepaidMonths:
      override.costTreatment === "prepaid" ? override.prepaidMonths : null,
    serviceThroughDate: override.serviceThroughDate,
    classificationStatus: override.classificationStatus,
    notes: override.notes,
    recurrenceProposal,
  };
}

function buildConfirmedImportRows(
  transactions: RocketMoneyPreviewTransaction[],
  overrides: ClassificationOverridePayload[],
): { rows: RocketMoneyConfirmedImportRow[] } | { error: string } {
  if (transactions.some((transaction) => transaction.isDuplicate)) {
    return { error: "Remove duplicate rows before importing." };
  }

  const overrideByKey = new Map<number, ClassificationOverridePayload>();
  for (const override of overrides) {
    overrideByKey.set(override.previewRowKey, override);
  }

  const expectedKeys = new Set(
    transactions.map((transaction) => transaction.sourceRowIndex),
  );

  if (overrideByKey.size !== expectedKeys.size) {
    return { error: "Classification data does not match the uploaded file." };
  }

  for (const key of expectedKeys) {
    if (!overrideByKey.has(key)) {
      return { error: "Classification data does not match the uploaded file." };
    }
  }

  for (const key of overrideByKey.keys()) {
    if (!expectedKeys.has(key)) {
      return { error: "Classification data does not match the uploaded file." };
    }
  }

  const rows: RocketMoneyConfirmedImportRow[] = [];

  for (const transaction of transactions) {
    const override = overrideByKey.get(transaction.sourceRowIndex);
    if (!override) {
      return { error: "Classification data does not match the uploaded file." };
    }

    const confirmedRow = applyClassificationOverride(transaction, override);
    if ("error" in confirmedRow) {
      return confirmedRow;
    }

    rows.push(confirmedRow);
  }

  return { rows };
}

function mapImportFailureCode(code: RocketMoneyImportErrorCode): string {
  switch (code) {
    case "unauthenticated":
      return "You must be signed in to import expenses.";
    case "batch_already_exists":
    case "fingerprint_conflict":
      return "These expenses appear to have already been imported.";
    case "preview_errors_present":
      return "Fix file issues before importing.";
    case "needs_review_present":
      return "Resolve all classification issues before importing.";
    case "duplicate_rows_in_file":
      return "Remove duplicate rows before importing.";
    case "no_importable_rows":
      return "No importable expenses were found.";
    case "invalid_content_hash":
    case "invalid_fingerprint":
    case "invalid_input":
    case "invalid_classification":
    case "recurrence_conflict":
      return "Could not verify the import request.";
    case "category_not_found":
    case "foundation_error":
      return "Finance setup is incomplete. Try again after opening Finance.";
    case "import_failed":
    default:
      return "Could not import expenses. Try again.";
  }
}

export async function previewRocketMoneyBusinessCsv(
  formData: FormData,
): Promise<RocketMoneyPreviewActionResult> {
  const auth = await requireAuthenticatedUserId();

  if (!auth) {
    return {
      success: false,
      error: "You must be signed in to preview expenses.",
    };
  }

  const fileResult = await readCsvFileFromFormData(formData);
  if ("error" in fileResult) {
    return { success: false, error: fileResult.error };
  }

  try {
    const parseResult = parseRocketMoneyBusinessCsv(fileResult.buffer);
    const preview = buildRocketMoneyBusinessPreview(parseResult);

    return {
      success: true,
      preview: sanitizePreview(preview),
    };
  } catch {
    return {
      success: false,
      error: "Could not preview the uploaded file.",
    };
  }
}

export async function importRocketMoneyBusinessCsv(
  formData: FormData,
): Promise<RocketMoneyImportActionResult> {
  const auth = await requireAuthenticatedUserId();

  if (!auth) {
    return {
      success: false,
      error: "You must be signed in to import expenses.",
    };
  }

  const confirmation = formData.get(CONFIRMATION_FIELD_NAME);
  if (confirmation !== "true") {
    return {
      success: false,
      error: "Confirm the import before continuing.",
    };
  }

  const overrideResult = parseClassificationOverrides(
    formData.get(OVERRIDES_FIELD_NAME),
  );
  if ("error" in overrideResult) {
    return { success: false, error: overrideResult.error };
  }

  const fileResult = await readCsvFileFromFormData(formData);
  if ("error" in fileResult) {
    return { success: false, error: fileResult.error };
  }

  let preview;

  try {
    const parseResult = parseRocketMoneyBusinessCsv(fileResult.buffer);
    preview = buildRocketMoneyBusinessPreview(parseResult);
  } catch {
    return {
      success: false,
      error: "Could not verify the uploaded file.",
    };
  }

  if (preview.errors.length > 0) {
    return {
      success: false,
      error: "Fix file issues before importing.",
    };
  }

  if (preview.transactions.length === 0) {
    return {
      success: false,
      error: "No importable expenses were found.",
    };
  }

  const confirmedRows = buildConfirmedImportRows(
    preview.transactions,
    overrideResult.overrides,
  );
  if ("error" in confirmedRows) {
    return { success: false, error: confirmedRows.error };
  }

  let importResult;

  try {
    importResult = await importRocketMoneyBusinessExpenses(
      auth.supabase,
      auth.userId,
      {
        contentHash: preview.contentHash,
        rows: confirmedRows.rows,
        previewErrors: [],
      },
    );
  } catch {
    return {
      success: false,
      error: "Could not import expenses. Try again.",
    };
  }

  if (!importResult.success) {
    return {
      success: false,
      error: mapImportFailureCode(importResult.code),
    };
  }

  return {
    success: true,
    importedTransactionCount: importResult.importedTransactionCount,
    recurringItemCount: importResult.recurringItemCount,
    ownerFundedSpendingTotal: importResult.ownerFundedSpendingTotal,
    monthlyRecurringAmount: importResult.monthlyRecurringAmount,
    annualRecurringAmount: importResult.annualRecurringAmount,
    estimatedAnnualRecurringRunRate:
      importResult.estimatedAnnualRecurringRunRate,
  };
}
