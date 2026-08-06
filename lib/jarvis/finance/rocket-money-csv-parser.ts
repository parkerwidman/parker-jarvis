import "server-only";

import { createHash } from "node:crypto";

import type { FinanceTransactionType } from "./finance-types";
import {
  ROCKET_MONEY_MAX_DATA_ROWS,
  ROCKET_MONEY_MAX_FILE_BYTES,
  ROCKET_MONEY_REQUIRED_HEADERS,
  type RocketMoneyBusinessClassification,
  type RocketMoneyClassificationStatus,
  type RocketMoneyCostTreatment,
  type RocketMoneyCsvParseResult,
  type RocketMoneyFundingSource,
  type RocketMoneyImportTotals,
  type RocketMoneyParsedSourceRow,
  type RocketMoneyPreviewResult,
  type RocketMoneyPreviewTransaction,
  type RocketMoneyPreviewValidationError,
  type RocketMoneyRecurrenceProposal,
  type RocketMoneyRequiredHeader,
} from "./rocket-money-import-types";

type CsvInput = string | Buffer | Uint8Array;

type HeaderIndexMap = Record<RocketMoneyRequiredHeader, number>;

type ValidatedRowValues = {
  transactionDate: string;
  originalDate: string | null;
  rocketMoneyAmount: number;
  jarvisAmount: number;
  transactionType: FinanceTransactionType;
  merchant: string;
  description: string | null;
  rocketMoneyCategory: string | null;
  notes: string | null;
  classification: RocketMoneyBusinessClassification;
  recurrenceProposal: RocketMoneyRecurrenceProposal | null;
};

type MerchantRule = {
  canonical: string;
  matches: (upper: string) => boolean;
};

const MERCHANT_RULES: readonly MerchantRule[] = [
  {
    canonical: "Anthropic",
    matches: (upper) => upper.includes("ANTHROPIC") || upper.includes("CLAUDE"),
  },
  {
    canonical: "Microsoft",
    matches: (upper) => upper.includes("MICROSOFT") || upper.includes("MSBILL"),
  },
  {
    canonical: "Namecheap",
    matches: (upper) => upper.includes("NAMECHEAP") || upper.includes("NAME-CHEAP"),
  },
  {
    canonical: "Illinois Secretary of State",
    matches: (upper) => upper.includes("ILLINOIS SECRETARY"),
  },
  {
    canonical: "Netlify",
    matches: (upper) => upper.includes("NETLIFY"),
  },
  {
    canonical: "Cursor",
    matches: (upper) => upper.includes("CURSOR"),
  },
  {
    canonical: "OpenAI",
    matches: (upper) => upper.includes("OPENAI"),
  },
];

function fileError(code: string, message: string): RocketMoneyPreviewValidationError {
  return { rowNumber: null, code, message };
}

function rowError(
  rowNumber: number,
  code: string,
  message: string,
): RocketMoneyPreviewValidationError {
  return { rowNumber, code, message };
}

function decodeCsvInput(input: CsvInput): string {
  if (typeof input === "string") {
    return input;
  }

  if (input.byteLength > ROCKET_MONEY_MAX_FILE_BYTES) {
    throw new RangeError("rocket_money_csv_too_large");
  }

  return Buffer.from(input).toString("utf8");
}

function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
          continue;
        }

        inQuotes = false;
        continue;
      }

      field += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\r") {
      if (text[index + 1] === "\n") {
        index += 1;
      }

      row.push(field);
      records.push(row);
      row = [];
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field);
      records.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new Error("rocket_money_csv_malformed");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }

  return records;
}

function normalizeHeaderName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function buildHeaderIndexMap(headerRow: string[]): HeaderIndexMap | null {
  const normalizedHeaders = headerRow.map(normalizeHeaderName);
  const indexByHeader = new Map<string, number>();

  for (let index = 0; index < normalizedHeaders.length; index += 1) {
    const header = normalizedHeaders[index];
    if (header.length === 0) {
      continue;
    }

    if (!indexByHeader.has(header)) {
      indexByHeader.set(header, index);
    }
  }

  const map = {} as HeaderIndexMap;
  for (const requiredHeader of ROCKET_MONEY_REQUIRED_HEADERS) {
    const columnIndex = indexByHeader.get(requiredHeader);
    if (columnIndex === undefined) {
      return null;
    }

    map[requiredHeader] = columnIndex;
  }

  return map;
}

function readIndexedField(row: string[], index: number): string {
  if (index < 0 || index >= row.length) {
    return "";
  }

  return row[index]?.trim() ?? "";
}

function parseRocketMoneyDate(rawValue: string): string | null {
  const value = rawValue.trim();
  if (value.length === 0) {
    return null;
  }

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    return isValidDateParts(year, month, day)
      ? `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
      : null;
  }

  const slashMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);
    if (!isValidDateParts(year, month, day)) {
      return null;
    }

    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseAmountToCents(rawValue: string): number | null {
  const cleaned = rawValue.trim().replace(/[$,\s]/g, "");
  if (cleaned.length === 0) {
    return null;
  }

  if (!/^-?\d+(?:\.\d{1,2})?$/.test(cleaned)) {
    return null;
  }

  const negative = cleaned.startsWith("-");
  const unsigned = negative ? cleaned.slice(1) : cleaned;
  const [wholePart, fractionalPart = ""] = unsigned.split(".");
  const dollars = Number(wholePart);
  const cents = Number(fractionalPart.padEnd(2, "0").slice(0, 2));

  if (!Number.isInteger(dollars) || !Number.isInteger(cents)) {
    return null;
  }

  const totalCents = dollars * 100 + cents;
  if (totalCents === 0) {
    return null;
  }

  return negative ? -totalCents : totalCents;
}

function centsToAmount(cents: number): number {
  return cents / 100;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function cleanMerchantCandidate(value: string): string {
  const cleaned = normalizeWhitespace(value)
    .replace(/[^\w\s.&'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.slice(0, 200);
}

function resolveCanonicalMerchant(candidate: string): string {
  const cleaned = cleanMerchantCandidate(candidate);
  if (cleaned.length === 0) {
    return "";
  }

  const upper = cleaned.toUpperCase();
  for (const rule of MERCHANT_RULES) {
    if (rule.matches(upper)) {
      return rule.canonical;
    }
  }

  return cleaned;
}

function resolvePreviewMerchant(row: RocketMoneyParsedSourceRow): string {
  const customName = cleanMerchantCandidate(row.customName);
  if (customName.length > 0) {
    return resolveCanonicalMerchant(customName);
  }

  const name = cleanMerchantCandidate(row.name);
  if (name.length > 0) {
    return resolveCanonicalMerchant(name);
  }

  const description = cleanMerchantCandidate(row.description);
  if (description.length > 0) {
    return resolveCanonicalMerchant(description);
  }

  return "";
}

function normalizeDescription(value: string): string | null {
  const cleaned = normalizeWhitespace(value).slice(0, 500);
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeOptionalNotes(value: string): string | null {
  const cleaned = normalizeWhitespace(value).slice(0, 1000);
  return cleaned.length > 0 ? cleaned : null;
}

function resolveTransactionType(jarvisAmount: number): FinanceTransactionType {
  if (jarvisAmount < 0) {
    return "expense";
  }

  return "refund";
}

function buildClassification(
  merchant: string,
  jarvisAmount: number,
): {
  classification: RocketMoneyBusinessClassification;
  recurrenceProposal: RocketMoneyRecurrenceProposal | null;
} {
  const expenseAmount = Math.abs(jarvisAmount);

  switch (merchant) {
    case "Anthropic":
      return {
        classification: {
          businessContext: "melusi",
          fundingSource: "owner_funded",
          costTreatment: "monthly_recurring",
          prepaidMonths: null,
          serviceThroughDate: null,
          classificationStatus: "user_confirmed",
        },
        recurrenceProposal: {
          name: merchant,
          recurringType: "subscription",
          frequency: "monthly",
          expectedAmount: expenseAmount,
        },
      };
    case "Microsoft":
      return {
        classification: {
          businessContext: "melusi",
          fundingSource: "owner_funded",
          costTreatment: "annual_recurring",
          prepaidMonths: null,
          serviceThroughDate: null,
          classificationStatus: "user_confirmed",
        },
        recurrenceProposal: {
          name: merchant,
          recurringType: "subscription",
          frequency: "annual",
          expectedAmount: expenseAmount,
        },
      };
    case "Namecheap":
      return {
        classification: {
          businessContext: "melusi",
          fundingSource: "owner_funded",
          costTreatment: "prepaid",
          prepaidMonths: 24,
          serviceThroughDate: null,
          classificationStatus: "user_confirmed",
        },
        recurrenceProposal: null,
      };
    case "Illinois Secretary of State":
      return {
        classification: {
          businessContext: "melusi",
          fundingSource: "owner_funded",
          costTreatment: "one_time",
          prepaidMonths: null,
          serviceThroughDate: null,
          classificationStatus: "user_confirmed",
        },
        recurrenceProposal: null,
      };
    case "Netlify":
      return {
        classification: {
          businessContext: "melusi",
          fundingSource: "owner_funded",
          costTreatment: "monthly_recurring",
          prepaidMonths: null,
          serviceThroughDate: null,
          classificationStatus: "user_confirmed",
        },
        recurrenceProposal: {
          name: merchant,
          recurringType: "subscription",
          frequency: "monthly",
          expectedAmount: expenseAmount,
        },
      };
    case "Cursor":
      return {
        classification: {
          businessContext: "melusi",
          fundingSource: "owner_funded",
          costTreatment: "monthly_recurring",
          prepaidMonths: null,
          serviceThroughDate: null,
          classificationStatus: "user_confirmed",
        },
        recurrenceProposal: {
          name: merchant,
          recurringType: "subscription",
          frequency: "monthly",
          expectedAmount: expenseAmount,
        },
      };
    case "OpenAI":
      return {
        classification: {
          businessContext: "melusi",
          fundingSource: "owner_funded",
          costTreatment: "monthly_recurring",
          prepaidMonths: null,
          serviceThroughDate: null,
          classificationStatus: "user_confirmed",
        },
        recurrenceProposal: {
          name: merchant,
          recurringType: "subscription",
          frequency: "monthly",
          expectedAmount: expenseAmount,
        },
      };
    default:
      return {
        classification: {
          businessContext: "melusi",
          fundingSource: "unknown",
          costTreatment: "unknown",
          prepaidMonths: null,
          serviceThroughDate: null,
          classificationStatus: "needs_review",
        },
        recurrenceProposal: null,
      };
  }
}

export function generateRocketMoneySourceFingerprint(input: {
  transactionDate: string;
  merchant: string;
  amountCents: number;
  description: string | null;
}): string {
  const normalizedDescription = normalizeDescription(input.description ?? "") ?? "";
  const canonical = [
    input.transactionDate,
    input.merchant,
    String(Math.abs(input.amountCents)),
    normalizedDescription,
  ].join("|");

  const digest = createHash("sha256").update(canonical, "utf8").digest("hex");
  return `rm:${digest}`;
}

export function generateRocketMoneyContentHash(sourceFingerprints: string[]): string {
  const sorted = [...sourceFingerprints].sort();
  return createHash("sha256").update(sorted.join("\n"), "utf8").digest("hex");
}

function validateParsedRow(
  row: RocketMoneyParsedSourceRow,
): { values: ValidatedRowValues } | { error: RocketMoneyPreviewValidationError } {
  const rowNumber = row.sourceRowIndex + 1;
  const transactionDate = parseRocketMoneyDate(row.date);

  if (!transactionDate) {
    return {
      error: rowError(rowNumber, "invalid_date", `Row ${rowNumber}: invalid date.`),
    };
  }

  const originalDateRaw = row.originalDate.trim();
  const originalDate =
    originalDateRaw.length > 0 ? parseRocketMoneyDate(originalDateRaw) : null;

  if (originalDateRaw.length > 0 && !originalDate) {
    return {
      error: rowError(
        rowNumber,
        "invalid_original_date",
        `Row ${rowNumber}: invalid original date.`,
      ),
    };
  }

  const amountCents = parseAmountToCents(row.amount);
  if (amountCents === null) {
    return {
      error: rowError(rowNumber, "invalid_amount", `Row ${rowNumber}: invalid amount.`),
    };
  }

  const rocketMoneyAmount = centsToAmount(amountCents);
  const jarvisAmount = centsToAmount(-amountCents);

  if (!Number.isFinite(jarvisAmount) || jarvisAmount === 0) {
    return {
      error: rowError(rowNumber, "invalid_amount", `Row ${rowNumber}: invalid amount.`),
    };
  }

  const merchant = resolvePreviewMerchant(row);
  if (merchant.length === 0) {
    return {
      error: rowError(
        rowNumber,
        "missing_merchant",
        `Row ${rowNumber}: missing merchant.`,
      ),
    };
  }

  const { classification, recurrenceProposal } = buildClassification(
    merchant,
    jarvisAmount,
  );

  return {
    values: {
      transactionDate,
      originalDate,
      rocketMoneyAmount,
      jarvisAmount,
      transactionType: resolveTransactionType(jarvisAmount),
      merchant,
      description: normalizeDescription(row.description),
      rocketMoneyCategory: normalizeWhitespace(row.category) || null,
      notes: normalizeOptionalNotes(row.note),
      classification,
      recurrenceProposal,
    },
  };
}

function buildPreviewTotals(
  transactions: RocketMoneyPreviewTransaction[],
  errors: RocketMoneyPreviewValidationError[],
): RocketMoneyImportTotals {
  const totals: RocketMoneyImportTotals = {
    ownerFundedSpending: 0,
    oneTimeSpending: 0,
    prepaidSpending: 0,
    monthlyRecurringAmount: 0,
    annualRecurringAmount: 0,
    estimatedAnnualRecurringRunRate: 0,
    refundTotal: 0,
    validRowCount: 0,
    duplicateRowCount: 0,
    errorRowCount: errors.length,
    needsReviewCount: 0,
  };

  for (const transaction of transactions) {
    if (transaction.isDuplicate) {
      totals.duplicateRowCount += 1;
      continue;
    }

    totals.validRowCount += 1;

    if (transaction.classificationStatus === "needs_review") {
      totals.needsReviewCount += 1;
    }

    if (transaction.transactionType === "refund") {
      totals.refundTotal += transaction.jarvisAmount;
      continue;
    }

    const spendingAmount = Math.abs(transaction.jarvisAmount);

    if (transaction.fundingSource === "owner_funded") {
      totals.ownerFundedSpending += spendingAmount;
    }

    switch (transaction.costTreatment as RocketMoneyCostTreatment) {
      case "one_time":
        totals.oneTimeSpending += spendingAmount;
        break;
      case "prepaid":
        totals.prepaidSpending += spendingAmount;
        break;
      case "monthly_recurring":
        totals.monthlyRecurringAmount += spendingAmount;
        break;
      case "annual_recurring":
        totals.annualRecurringAmount += spendingAmount;
        break;
      default:
        break;
    }
  }

  totals.estimatedAnnualRecurringRunRate =
    totals.monthlyRecurringAmount * 12 + totals.annualRecurringAmount;

  return totals;
}

export function parseRocketMoneyBusinessCsv(input: CsvInput): RocketMoneyCsvParseResult {
  const decoded = decodeCsvInput(input);
  const byteLength = Buffer.byteLength(decoded, "utf8");

  if (byteLength === 0) {
    return {
      rows: [],
      errors: [fileError("empty_file", "CSV file is empty.")],
    };
  }

  if (byteLength > ROCKET_MONEY_MAX_FILE_BYTES) {
    return {
      rows: [],
      errors: [
        fileError(
          "file_too_large",
          `CSV file exceeds the ${ROCKET_MONEY_MAX_FILE_BYTES} byte limit.`,
        ),
      ],
    };
  }

  const normalizedText = stripUtf8Bom(decoded);

  let records: string[][];
  try {
    records = parseCsvRecords(normalizedText);
  } catch {
    return {
      rows: [],
      errors: [fileError("malformed_csv", "CSV file is malformed.")],
    };
  }

  if (records.length === 0) {
    return {
      rows: [],
      errors: [fileError("empty_file", "CSV file is empty.")],
    };
  }

  const headerMap = buildHeaderIndexMap(records[0] ?? []);
  if (!headerMap) {
    const missingHeaders = ROCKET_MONEY_REQUIRED_HEADERS.filter((header) => {
      const normalizedHeaders = (records[0] ?? []).map(normalizeHeaderName);
      return !normalizedHeaders.includes(header);
    });

    return {
      rows: [],
      errors: missingHeaders.map((header) =>
        fileError("missing_header", `Missing required header: ${header}.`),
      ),
    };
  }

  const dataRows = records.slice(1).filter((row) => row.some((cell) => cell.trim().length > 0));

  if (dataRows.length === 0) {
    return {
      rows: [],
      errors: [fileError("empty_file", "CSV file contains no data rows.")],
    };
  }

  if (dataRows.length > ROCKET_MONEY_MAX_DATA_ROWS) {
    return {
      rows: [],
      errors: [
        fileError(
          "too_many_rows",
          `CSV file exceeds the ${ROCKET_MONEY_MAX_DATA_ROWS} row limit.`,
        ),
      ],
    };
  }

  const rows: RocketMoneyParsedSourceRow[] = dataRows.map((row, index) => ({
    sourceRowIndex: index,
    date: readIndexedField(row, headerMap.Date),
    originalDate: readIndexedField(row, headerMap["Original Date"]),
    name: readIndexedField(row, headerMap.Name),
    customName: readIndexedField(row, headerMap["Custom Name"]),
    amount: readIndexedField(row, headerMap.Amount),
    description: readIndexedField(row, headerMap.Description),
    category: readIndexedField(row, headerMap.Category),
    note: readIndexedField(row, headerMap.Note),
    ignoredFrom: readIndexedField(row, headerMap["Ignored From"]),
    taxDeductible: readIndexedField(row, headerMap["Tax Deductible"]),
    transactionTags: readIndexedField(row, headerMap["Transaction Tags"]),
  }));

  return { rows, errors: [] };
}

export function buildRocketMoneyBusinessPreview(
  parseResult: RocketMoneyCsvParseResult,
): RocketMoneyPreviewResult {
  if (parseResult.errors.length > 0) {
    return {
      contentHash: generateRocketMoneyContentHash([]),
      transactions: [],
      errors: parseResult.errors,
      totals: buildPreviewTotals([], parseResult.errors),
    };
  }

  const transactions: RocketMoneyPreviewTransaction[] = [];
  const errors: RocketMoneyPreviewValidationError[] = [];
  const fingerprintCounts = new Map<string, number>();

  for (const row of parseResult.rows) {
    const validated = validateParsedRow(row);
    if ("error" in validated) {
      errors.push(validated.error);
      continue;
    }

    const values = validated.values;
    const amountCents = parseAmountToCents(row.amount);
    if (amountCents === null) {
      errors.push(
        rowError(
          row.sourceRowIndex + 1,
          "invalid_amount",
          `Row ${row.sourceRowIndex + 1}: invalid amount.`,
        ),
      );
      continue;
    }

    const sourceFingerprint = generateRocketMoneySourceFingerprint({
      transactionDate: values.transactionDate,
      merchant: values.merchant,
      amountCents,
      description: values.description,
    });

    const seenCount = fingerprintCounts.get(sourceFingerprint) ?? 0;
    fingerprintCounts.set(sourceFingerprint, seenCount + 1);

    transactions.push({
      sourceRowIndex: row.sourceRowIndex,
      sourceFingerprint,
      transactionDate: values.transactionDate,
      originalDate: values.originalDate,
      merchant: values.merchant,
      description: values.description,
      rocketMoneyCategory: values.rocketMoneyCategory,
      rocketMoneyAmount: values.rocketMoneyAmount,
      jarvisAmount: values.jarvisAmount,
      transactionType: values.transactionType,
      personalOrBusiness: "business",
      businessContext: values.classification.businessContext,
      fundingSource: values.classification.fundingSource,
      costTreatment: values.classification.costTreatment,
      prepaidMonths: values.classification.prepaidMonths,
      serviceThroughDate: values.classification.serviceThroughDate,
      classificationStatus: values.classification.classificationStatus,
      recurrenceProposal: values.recurrenceProposal,
      isDuplicate: seenCount > 0,
      notes: values.notes,
    });
  }

  const contentHash = generateRocketMoneyContentHash(
    transactions.map((transaction) => transaction.sourceFingerprint),
  );

  return {
    contentHash,
    transactions,
    errors,
    totals: buildPreviewTotals(transactions, errors),
  };
}

