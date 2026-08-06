"use server";

import {
  buildRocketMoneyBusinessPreview,
  parseRocketMoneyBusinessCsv,
} from "@/lib/jarvis/finance/rocket-money-csv-parser";
import {
  ROCKET_MONEY_MAX_FILE_BYTES,
  type RocketMoneyImportTotals,
  type RocketMoneyPreviewValidationError,
  type RocketMoneyPreviewTransaction,
  type RocketMoneyRecurrenceProposal,
} from "@/lib/jarvis/finance/rocket-money-import-types";
import { createClient } from "@/lib/supabase/server";

export type SanitizedPreviewTransaction = {
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

export type SanitizedRocketMoneyPreview = {
  transactions: SanitizedPreviewTransaction[];
  errors: RocketMoneyPreviewValidationError[];
  totals: RocketMoneyImportTotals;
};

export type RocketMoneyPreviewActionResult =
  | { success: true; preview: SanitizedRocketMoneyPreview }
  | { success: false; error: string };

const CSV_FIELD_NAME = "csvFile";

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

function sanitizeTransaction(
  transaction: RocketMoneyPreviewTransaction,
): SanitizedPreviewTransaction {
  return {
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

async function requireAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return null;
  }

  const userId =
    typeof data.claims.sub === "string" ? data.claims.sub : null;

  return userId;
}

export async function previewRocketMoneyBusinessCsv(
  formData: FormData,
): Promise<RocketMoneyPreviewActionResult> {
  const userId = await requireAuthenticatedUserId();

  if (!userId) {
    return {
      success: false,
      error: "You must be signed in to preview expenses.",
    };
  }

  const fileValue = formData.get(CSV_FIELD_NAME);

  if (!(fileValue instanceof File)) {
    return {
      success: false,
      error: "Select a Rocket Money CSV file to preview.",
    };
  }

  if (fileValue.size === 0) {
    return {
      success: false,
      error: "The selected CSV file is empty.",
    };
  }

  if (!isCsvFile(fileValue)) {
    return {
      success: false,
      error: "Upload a .csv file exported from Rocket Money.",
    };
  }

  if (fileValue.size > ROCKET_MONEY_MAX_FILE_BYTES) {
    return {
      success: false,
      error: "CSV file must be 2 MB or smaller.",
    };
  }

  let csvBuffer: Buffer;

  try {
    csvBuffer = Buffer.from(await fileValue.arrayBuffer());
  } catch {
    return {
      success: false,
      error: "Could not read the uploaded file.",
    };
  }

  if (csvBuffer.byteLength > ROCKET_MONEY_MAX_FILE_BYTES) {
    return {
      success: false,
      error: "CSV file must be 2 MB or smaller.",
    };
  }

  try {
    const parseResult = parseRocketMoneyBusinessCsv(csvBuffer);
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
