"use client";

import {
  previewRocketMoneyBusinessCsv,
  type RocketMoneyPreviewActionResult,
  type SanitizedPreviewTransaction,
  type SanitizedRocketMoneyPreview,
} from "@/app/melusi/expenses/actions";
import {
  JarvisAlert,
  JarvisCard,
  JarvisField,
  jarvisInputProps,
} from "@/components/jarvis/jarvis-ui";
import { ROCKET_MONEY_MAX_FILE_BYTES } from "@/lib/jarvis/finance/rocket-money-import-types";
import type {
  RocketMoneyClassificationStatus,
  RocketMoneyCostTreatment,
  RocketMoneyFundingSource,
  RocketMoneyImportTotals,
  RocketMoneyRecurrenceProposal,
} from "@/lib/jarvis/finance/rocket-money-import-types";
import type { FinanceFrequency } from "@/lib/jarvis/finance/finance-types";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";

const CSV_FIELD_NAME = "csvFile";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const FUNDING_SOURCE_OPTIONS: {
  value: RocketMoneyFundingSource;
  label: string;
}[] = [
  { value: "owner_funded", label: "Owner funded" },
  { value: "business_account", label: "Business account" },
  { value: "unknown", label: "Unknown" },
];

const COST_TREATMENT_OPTIONS: {
  value: RocketMoneyCostTreatment;
  label: string;
}[] = [
  { value: "one_time", label: "One-time" },
  { value: "monthly_recurring", label: "Monthly recurring" },
  { value: "annual_recurring", label: "Annual recurring" },
  { value: "prepaid", label: "Prepaid" },
  { value: "unknown", label: "Unknown" },
];

const CLASSIFICATION_STATUS_OPTIONS: {
  value: RocketMoneyClassificationStatus;
  label: string;
}[] = [
  { value: "user_confirmed", label: "Confirmed" },
  { value: "inferred", label: "Inferred" },
  { value: "needs_review", label: "Needs review" },
];

const RECURRENCE_FREQUENCY_OPTIONS: { value: FinanceFrequency; label: string }[] =
  [
    { value: "monthly", label: "Monthly" },
    { value: "annual", label: "Annual" },
  ];

type EditablePreviewRow = SanitizedPreviewTransaction & {
  clientId: number;
};

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function recurrenceLabel(
  proposal: RocketMoneyRecurrenceProposal | null,
): string {
  if (!proposal) {
    return "None";
  }

  const frequency =
    RECURRENCE_FREQUENCY_OPTIONS.find(
      (option) => option.value === proposal.frequency,
    )?.label ?? proposal.frequency;

  return `${frequency} · ${formatCurrency(proposal.expectedAmount)}`;
}

function descriptionIsUseful(
  merchant: string,
  description: string | null,
): description is string {
  if (!description) {
    return false;
  }

  const normalizedMerchant = merchant.trim().toLowerCase();
  const normalizedDescription = description.trim().toLowerCase();

  return (
    normalizedDescription.length > 0 &&
    normalizedDescription !== normalizedMerchant
  );
}

function clonePreviewRows(
  transactions: SanitizedPreviewTransaction[],
): EditablePreviewRow[] {
  return transactions.map((transaction, index) => ({
    ...transaction,
    clientId: index,
    recurrenceProposal: transaction.recurrenceProposal
      ? { ...transaction.recurrenceProposal }
      : null,
  }));
}

function buildRecurrenceProposal(
  row: EditablePreviewRow,
  frequency: FinanceFrequency,
): RocketMoneyRecurrenceProposal {
  return {
    name: row.merchant,
    recurringType: "subscription",
    frequency,
    expectedAmount: Math.abs(row.jarvisAmount),
  };
}

function applyCostTreatmentChange(
  row: EditablePreviewRow,
  costTreatment: RocketMoneyCostTreatment,
): EditablePreviewRow {
  const isRefund = row.transactionType === "refund";
  let recurrenceProposal: RocketMoneyRecurrenceProposal | null = null;
  let prepaidMonths = row.prepaidMonths;

  if (!isRefund) {
    if (costTreatment === "monthly_recurring") {
      recurrenceProposal = buildRecurrenceProposal(row, "monthly");
    } else if (costTreatment === "annual_recurring") {
      recurrenceProposal = buildRecurrenceProposal(row, "annual");
    }
  }

  if (costTreatment === "prepaid") {
    recurrenceProposal = null;
    prepaidMonths = prepaidMonths && prepaidMonths > 0 ? prepaidMonths : 12;
  } else {
    prepaidMonths = null;
  }

  if (
    costTreatment === "one_time" ||
    costTreatment === "unknown" ||
    isRefund
  ) {
    recurrenceProposal = null;
  }

  return {
    ...row,
    costTreatment,
    recurrenceProposal,
    prepaidMonths,
  };
}

function applyRecurrenceFrequencyChange(
  row: EditablePreviewRow,
  frequency: FinanceFrequency | "",
): EditablePreviewRow {
  if (!frequency) {
    return {
      ...row,
      recurrenceProposal: null,
    };
  }

  return {
    ...row,
    recurrenceProposal: buildRecurrenceProposal(row, frequency),
  };
}

function getRowValidationIssues(row: EditablePreviewRow): string[] {
  const issues: string[] = [];
  const isRefund = row.transactionType === "refund";

  if (row.costTreatment === "monthly_recurring") {
    if (
      !row.recurrenceProposal ||
      row.recurrenceProposal.frequency !== "monthly"
    ) {
      issues.push("Monthly recurring requires monthly recurrence.");
    }
  }

  if (row.costTreatment === "annual_recurring") {
    if (
      !row.recurrenceProposal ||
      row.recurrenceProposal.frequency !== "annual"
    ) {
      issues.push("Annual recurring requires annual recurrence.");
    }
  }

  if (row.costTreatment === "one_time" || row.costTreatment === "prepaid") {
    if (row.recurrenceProposal) {
      issues.push("One-time and prepaid costs cannot have recurrence.");
    }
  }

  if (row.costTreatment === "prepaid") {
    if (row.prepaidMonths === null || row.prepaidMonths <= 0) {
      issues.push("Prepaid costs require positive prepaid months.");
    }
  }

  if (isRefund && row.recurrenceProposal) {
    issues.push("Refunds cannot be recurring.");
  }

  if (
    isRefund &&
    (row.costTreatment === "monthly_recurring" ||
      row.costTreatment === "annual_recurring")
  ) {
    issues.push("Refunds cannot be recurring.");
  }

  if (
    row.fundingSource === "unknown" ||
    row.costTreatment === "unknown" ||
    row.classificationStatus === "needs_review"
  ) {
    issues.push("Classification still needs review.");
  }

  return issues;
}

function computePreviewTotals(
  rows: EditablePreviewRow[],
  fileErrors: SanitizedRocketMoneyPreview["errors"],
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
    errorRowCount: fileErrors.length,
    needsReviewCount: 0,
  };

  for (const row of rows) {
    if (row.isDuplicate) {
      totals.duplicateRowCount += 1;
      continue;
    }

    totals.validRowCount += 1;

    const issues = getRowValidationIssues(row);
    if (
      row.classificationStatus === "needs_review" ||
      row.fundingSource === "unknown" ||
      row.costTreatment === "unknown" ||
      issues.length > 0
    ) {
      totals.needsReviewCount += 1;
    }

    if (row.transactionType === "refund") {
      totals.refundTotal += row.jarvisAmount;
      continue;
    }

    const spendingAmount = Math.abs(row.jarvisAmount);

    if (row.fundingSource === "owner_funded") {
      totals.ownerFundedSpending += spendingAmount;
    }

    switch (row.costTreatment) {
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

function SummaryMetric({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`melusi-expenses-metric${emphasis ? " melusi-expenses-metric--emphasis" : ""}`}
    >
      <span className="melusi-expenses-metric-label">{label}</span>
      <span className="melusi-expenses-metric-value">{value}</span>
    </div>
  );
}

function PreviewSummary({
  totals,
  errorCount,
}: {
  totals: RocketMoneyImportTotals;
  errorCount: number;
}) {
  return (
    <JarvisCard title="Preview summary" className="melusi-expenses-summary-card">
      <div className="melusi-expenses-summary-grid">
        <SummaryMetric label="Valid rows" value={String(totals.validRowCount)} />
        <SummaryMetric
          label="Duplicates"
          value={String(totals.duplicateRowCount)}
        />
        <SummaryMetric label="Errors" value={String(errorCount)} />
        <SummaryMetric
          label="Needs review"
          value={String(totals.needsReviewCount)}
        />
      </div>

      <div className="melusi-expenses-spending-grid">
        <SummaryMetric
          label="Owner-funded spending"
          value={formatCurrency(totals.ownerFundedSpending)}
          emphasis
        />
        <SummaryMetric
          label="Monthly recurring"
          value={formatCurrency(totals.monthlyRecurringAmount)}
          emphasis
        />
        <SummaryMetric
          label="Estimated annual recurring run rate"
          value={formatCurrency(totals.estimatedAnnualRecurringRunRate)}
          emphasis
        />
        <SummaryMetric
          label="One-time spending"
          value={formatCurrency(totals.oneTimeSpending)}
        />
        <SummaryMetric
          label="Prepaid spending"
          value={formatCurrency(totals.prepaidSpending)}
        />
        <SummaryMetric
          label="Annual recurring"
          value={formatCurrency(totals.annualRecurringAmount)}
        />
      </div>
    </JarvisCard>
  );
}

function RowStateBadge({ row }: { row: EditablePreviewRow }) {
  const issues = getRowValidationIssues(row);

  if (row.isDuplicate) {
    return (
      <span className="melusi-expenses-badge melusi-expenses-badge--duplicate">
        Duplicate
      </span>
    );
  }

  if (issues.length > 0) {
    return (
      <span className="melusi-expenses-badge melusi-expenses-badge--review">
        Needs review
      </span>
    );
  }

  return (
    <span className="melusi-expenses-badge melusi-expenses-badge--valid">
      Ready
    </span>
  );
}

function PreviewTransactionTable({
  rows,
  onRowChange,
}: {
  rows: EditablePreviewRow[];
  onRowChange: (clientId: number, nextRow: EditablePreviewRow) => void;
}) {
  return (
    <JarvisCard title="Transactions" className="melusi-expenses-table-card">
      <p className="melusi-expenses-preview-edit-note">
        Preview edits below adjust local totals only. Nothing is saved until
        import is enabled in a later step.
      </p>

      <div className="finance-table-wrap melusi-expenses-table-wrap">
        <table className="finance-table finance-table--transactions melusi-expenses-table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Merchant</th>
              <th scope="col">Description</th>
              <th scope="col">Category</th>
              <th scope="col" className="finance-table-num">
                RM amount
              </th>
              <th scope="col" className="finance-table-num">
                Jarvis amount
              </th>
              <th scope="col">Funding</th>
              <th scope="col">Cost type</th>
              <th scope="col">Recurrence</th>
              <th scope="col">Status</th>
              <th scope="col">Prepaid mo.</th>
              <th scope="col">Service through</th>
              <th scope="col">Notes</th>
              <th scope="col">Row state</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const issues = getRowValidationIssues(row);
              const showDescription = descriptionIsUseful(
                row.merchant,
                row.description,
              );
              const recurrenceEnabled =
                row.transactionType !== "refund" &&
                (row.costTreatment === "monthly_recurring" ||
                  row.costTreatment === "annual_recurring");
              const prepaidEnabled = row.costTreatment === "prepaid";
              const amountTone =
                row.transactionType === "refund" ? "refund" : "expense";

              return (
                <tr
                  key={row.clientId}
                  className={
                    issues.length > 0 || row.isDuplicate
                      ? "melusi-expenses-row--flagged"
                      : undefined
                  }
                >
                  <td>{formatDate(row.transactionDate)}</td>
                  <td>{row.merchant}</td>
                  <td className="melusi-expenses-description">
                    {showDescription ? row.description : "—"}
                  </td>
                  <td>{row.rocketMoneyCategory ?? "—"}</td>
                  <td className="finance-table-num">
                    {formatCurrency(row.rocketMoneyAmount)}
                  </td>
                  <td
                    className={`finance-table-num finance-amount finance-amount--${amountTone}`}
                  >
                    {formatCurrency(row.jarvisAmount)}
                  </td>
                  <td>
                    <select
                      className="melusi-expenses-inline-select"
                      value={row.fundingSource}
                      aria-label={`Funding source for ${row.merchant}`}
                      onChange={(event) =>
                        onRowChange(row.clientId, {
                          ...row,
                          fundingSource: event.target
                            .value as RocketMoneyFundingSource,
                        })
                      }
                    >
                      {FUNDING_SOURCE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="melusi-expenses-inline-select"
                      value={row.costTreatment}
                      aria-label={`Cost treatment for ${row.merchant}`}
                      onChange={(event) =>
                        onRowChange(
                          row.clientId,
                          applyCostTreatmentChange(
                            row,
                            event.target.value as RocketMoneyCostTreatment,
                          ),
                        )
                      }
                    >
                      {COST_TREATMENT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {recurrenceEnabled ? (
                      <select
                        className="melusi-expenses-inline-select"
                        value={row.recurrenceProposal?.frequency ?? ""}
                        aria-label={`Recurrence for ${row.merchant}`}
                        onChange={(event) =>
                          onRowChange(
                            row.clientId,
                            applyRecurrenceFrequencyChange(
                              row,
                              event.target.value as FinanceFrequency | "",
                            ),
                          )
                        }
                      >
                        {RECURRENCE_FREQUENCY_OPTIONS.filter((option) => {
                          if (row.costTreatment === "monthly_recurring") {
                            return option.value === "monthly";
                          }

                          if (row.costTreatment === "annual_recurring") {
                            return option.value === "annual";
                          }

                          return true;
                        }).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="melusi-expenses-muted">
                        {recurrenceLabel(row.recurrenceProposal)}
                      </span>
                    )}
                  </td>
                  <td>
                    <select
                      className="melusi-expenses-inline-select"
                      value={row.classificationStatus}
                      aria-label={`Classification status for ${row.merchant}`}
                      onChange={(event) =>
                        onRowChange(row.clientId, {
                          ...row,
                          classificationStatus: event.target
                            .value as RocketMoneyClassificationStatus,
                        })
                      }
                    >
                      {CLASSIFICATION_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {prepaidEnabled ? (
                      <input
                        className="melusi-expenses-inline-input"
                        type="number"
                        min={1}
                        step={1}
                        aria-label={`Prepaid months for ${row.merchant}`}
                        value={row.prepaidMonths ?? ""}
                        onChange={(event) => {
                          const parsed = Number(event.target.value);
                          onRowChange(row.clientId, {
                            ...row,
                            prepaidMonths: Number.isFinite(parsed)
                              ? parsed
                              : null,
                          });
                        }}
                      />
                    ) : (
                      <span className="melusi-expenses-muted">—</span>
                    )}
                  </td>
                  <td>
                    <input
                      className="melusi-expenses-inline-input"
                      type="date"
                      aria-label={`Service through date for ${row.merchant}`}
                      value={row.serviceThroughDate ?? ""}
                      onChange={(event) =>
                        onRowChange(row.clientId, {
                          ...row,
                          serviceThroughDate: event.target.value || null,
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="melusi-expenses-inline-input melusi-expenses-inline-input--notes"
                      type="text"
                      aria-label={`Notes for ${row.merchant}`}
                      value={row.notes ?? ""}
                      placeholder="Preview only"
                      onChange={(event) =>
                        onRowChange(row.clientId, {
                          ...row,
                          notes: event.target.value || null,
                        })
                      }
                    />
                  </td>
                  <td>
                    <RowStateBadge row={row} />
                    {issues.length > 0 ? (
                      <ul className="melusi-expenses-row-issues">
                        {issues.map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="melusi-expenses-mobile-cards">
        {rows.map((row) => {
          const issues = getRowValidationIssues(row);
          const showDescription = descriptionIsUseful(
            row.merchant,
            row.description,
          );
          const recurrenceEnabled =
            row.transactionType !== "refund" &&
            (row.costTreatment === "monthly_recurring" ||
              row.costTreatment === "annual_recurring");
          const prepaidEnabled = row.costTreatment === "prepaid";

          return (
            <article
              key={row.clientId}
              className={`melusi-expenses-mobile-card${
                issues.length > 0 || row.isDuplicate
                  ? " melusi-expenses-mobile-card--flagged"
                  : ""
              }`}
            >
              <div className="melusi-expenses-mobile-card-header">
                <div>
                  <h3>{row.merchant}</h3>
                  <p>{formatDate(row.transactionDate)}</p>
                </div>
                <RowStateBadge row={row} />
              </div>

              {showDescription ? (
                <p className="melusi-expenses-mobile-description">
                  {row.description}
                </p>
              ) : null}

              <dl className="melusi-expenses-mobile-meta">
                <div>
                  <dt>Category</dt>
                  <dd>{row.rocketMoneyCategory ?? "—"}</dd>
                </div>
                <div>
                  <dt>Rocket Money amount</dt>
                  <dd>{formatCurrency(row.rocketMoneyAmount)}</dd>
                </div>
                <div>
                  <dt>Jarvis amount</dt>
                  <dd>{formatCurrency(row.jarvisAmount)}</dd>
                </div>
              </dl>

              <div className="melusi-expenses-mobile-fields">
                <JarvisField label="Funding source">
                  <select
                    {...jarvisInputProps("melusi-expenses-select")}
                    value={row.fundingSource}
                    onChange={(event) =>
                      onRowChange(row.clientId, {
                        ...row,
                        fundingSource: event.target
                          .value as RocketMoneyFundingSource,
                      })
                    }
                  >
                    {FUNDING_SOURCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </JarvisField>

                <JarvisField label="Cost treatment">
                  <select
                    {...jarvisInputProps("melusi-expenses-select")}
                    value={row.costTreatment}
                    onChange={(event) =>
                      onRowChange(
                        row.clientId,
                        applyCostTreatmentChange(
                          row,
                          event.target.value as RocketMoneyCostTreatment,
                        ),
                      )
                    }
                  >
                    {COST_TREATMENT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </JarvisField>

                {prepaidEnabled ? (
                  <JarvisField label="Prepaid months">
                    <input
                      {...jarvisInputProps()}
                      type="number"
                      min={1}
                      step={1}
                      value={row.prepaidMonths ?? ""}
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        onRowChange(row.clientId, {
                          ...row,
                          prepaidMonths: Number.isFinite(parsed)
                            ? parsed
                            : null,
                        });
                      }}
                    />
                  </JarvisField>
                ) : null}

                <JarvisField label="Service through date">
                  <input
                    {...jarvisInputProps()}
                    type="date"
                    value={row.serviceThroughDate ?? ""}
                    onChange={(event) =>
                      onRowChange(row.clientId, {
                        ...row,
                        serviceThroughDate: event.target.value || null,
                      })
                    }
                  />
                </JarvisField>

                <JarvisField label="Classification status">
                  <select
                    {...jarvisInputProps("melusi-expenses-select")}
                    value={row.classificationStatus}
                    onChange={(event) =>
                      onRowChange(row.clientId, {
                        ...row,
                        classificationStatus: event.target
                          .value as RocketMoneyClassificationStatus,
                      })
                    }
                  >
                    {CLASSIFICATION_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </JarvisField>

                {recurrenceEnabled ? (
                  <JarvisField label="Recurrence frequency">
                    <select
                      {...jarvisInputProps("melusi-expenses-select")}
                      value={row.recurrenceProposal?.frequency ?? ""}
                      onChange={(event) =>
                        onRowChange(
                          row.clientId,
                          applyRecurrenceFrequencyChange(
                            row,
                            event.target.value as FinanceFrequency | "",
                          ),
                        )
                      }
                    >
                      {RECURRENCE_FREQUENCY_OPTIONS.filter((option) => {
                        if (row.costTreatment === "monthly_recurring") {
                          return option.value === "monthly";
                        }

                        if (row.costTreatment === "annual_recurring") {
                          return option.value === "annual";
                        }

                        return true;
                      }).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </JarvisField>
                ) : (
                  <div className="melusi-expenses-mobile-static">
                    <span className="jv-field-label">Recurrence</span>
                    <p>{recurrenceLabel(row.recurrenceProposal)}</p>
                  </div>
                )}

                <JarvisField label="Notes (preview only)">
                  <input
                    {...jarvisInputProps()}
                    type="text"
                    value={row.notes ?? ""}
                    onChange={(event) =>
                      onRowChange(row.clientId, {
                        ...row,
                        notes: event.target.value || null,
                      })
                    }
                  />
                </JarvisField>
              </div>

              {issues.length > 0 ? (
                <ul className="melusi-expenses-row-issues">
                  {issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          );
        })}
      </div>
    </JarvisCard>
  );
}

export function MelusiExpensesImport() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [previewErrors, setPreviewErrors] = useState<
    SanitizedRocketMoneyPreview["errors"]
  >([]);
  const [editableRows, setEditableRows] = useState<EditablePreviewRow[]>([]);
  const [hasPreview, setHasPreview] = useState(false);
  const [isPending, startTransition] = useTransition();

  const displayTotals = useMemo(
    () => computePreviewTotals(editableRows, previewErrors),
    [editableRows, previewErrors],
  );

  const selectedFileTooLarge =
    selectedFile !== null && selectedFile.size > ROCKET_MONEY_MAX_FILE_BYTES;

  function resetPreviewState() {
    setActionError(null);
    setPreviewErrors([]);
    setEditableRows([]);
    setHasPreview(false);
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setClientError(null);
    resetPreviewState();

    if (!file) {
      return;
    }

    if (!file.name.trim().toLowerCase().endsWith(".csv")) {
      setClientError("Choose a Rocket Money export saved as a .csv file.");
      return;
    }

    if (file.size > ROCKET_MONEY_MAX_FILE_BYTES) {
      setClientError("This file is over 2 MB. Choose a smaller export.");
    }
  }

  function handleClear() {
    setSelectedFile(null);
    setClientError(null);
    resetPreviewState();

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handlePreview() {
    setClientError(null);
    setActionError(null);

    if (!selectedFile) {
      setClientError("Select a CSV file before previewing.");
      return;
    }

    if (!selectedFile.name.trim().toLowerCase().endsWith(".csv")) {
      setClientError("Choose a Rocket Money export saved as a .csv file.");
      return;
    }

    if (selectedFile.size > ROCKET_MONEY_MAX_FILE_BYTES) {
      setClientError("This file is over 2 MB. Choose a smaller export.");
      return;
    }

    const formData = new FormData();
    formData.set(CSV_FIELD_NAME, selectedFile);

    startTransition(async () => {
      let result: RocketMoneyPreviewActionResult;

      try {
        result = await previewRocketMoneyBusinessCsv(formData);
      } catch {
        setActionError("Could not preview the uploaded file.");
        resetPreviewState();
        return;
      }

      if (!result.success) {
        setActionError(result.error);
        resetPreviewState();
        return;
      }

      setPreviewErrors(result.preview.errors);
      setEditableRows(clonePreviewRows(result.preview.transactions));
      setHasPreview(true);
    });
  }

  function handleRowChange(clientId: number, nextRow: EditablePreviewRow) {
    setEditableRows((currentRows) =>
      currentRows.map((row) => (row.clientId === clientId ? nextRow : row)),
    );
  }

  const showEmptyPreviewNotice =
    hasPreview &&
    editableRows.length === 0 &&
    previewErrors.length === 0 &&
    !actionError;

  return (
    <div className="melusi-expenses">
      <header className="melusi-header melusi-subpage-header">
        <div className="melusi-header-copy">
          <Link href="/melusi" className="jv-back-link">
            ← Melusi Command Center
          </Link>
          <h1 className="melusi-title">Melusi Expenses</h1>
          <p className="melusi-subtitle">
            Track owner-funded Melusi business costs from your private Rocket
            Money export. This step previews the file in memory before any import
            is available.
          </p>
        </div>
      </header>

      <JarvisCard title="Upload Rocket Money CSV" accent="cyan">
        <div className="melusi-expenses-upload">
          <JarvisField label="Private business expense CSV" htmlFor="melusi-csv-file">
            <input
              ref={fileInputRef}
              id="melusi-csv-file"
              name={CSV_FIELD_NAME}
              type="file"
              accept=".csv,text/csv"
              className="melusi-expenses-file-input"
              onChange={handleFileChange}
            />
          </JarvisField>

          <div className="melusi-expenses-file-meta">
            <p>
              <span className="melusi-expenses-meta-label">Selected file:</span>{" "}
              {selectedFile ? selectedFile.name : "None"}
            </p>
            <p>
              <span className="melusi-expenses-meta-label">File size:</span>{" "}
              {selectedFile ? formatFileSize(selectedFile.size) : "—"}
            </p>
          </div>

          {selectedFileTooLarge ? (
            <JarvisAlert variant="error">
              This file exceeds the 2 MB preview limit. Choose a smaller export.
            </JarvisAlert>
          ) : null}

          <div className="melusi-expenses-actions">
            <button
              type="button"
              className="jv-btn jv-btn--primary"
              onClick={handlePreview}
              disabled={!selectedFile || selectedFileTooLarge || isPending}
            >
              {isPending ? "Previewing…" : "Preview CSV"}
            </button>
            <button
              type="button"
              className="jv-btn jv-btn--secondary"
              onClick={handleClear}
              disabled={isPending && !hasPreview}
            >
              Clear
            </button>
          </div>
        </div>
      </JarvisCard>

      <JarvisCard title="Privacy notice" accent="blue">
        <ul className="melusi-expenses-privacy-list">
          <li>The CSV is parsed server-side in memory only.</li>
          <li>
            Account names, account numbers, and institutions are discarded during
            parsing.
          </li>
          <li>Nothing is imported into Jarvis during preview.</li>
          <li>The uploaded CSV is not stored anywhere.</li>
        </ul>
      </JarvisCard>

      {clientError ? (
        <JarvisAlert variant="error">{clientError}</JarvisAlert>
      ) : null}

      {actionError ? (
        <JarvisAlert variant="error">{actionError}</JarvisAlert>
      ) : null}

      {hasPreview && previewErrors.length > 0 ? (
        <JarvisCard title="File issues">
          <ul className="melusi-expenses-error-list">
            {previewErrors.map((error, index) => (
              <li key={`${error.code}-${error.rowNumber ?? "file"}-${index}`}>
                {error.message}
              </li>
            ))}
          </ul>
        </JarvisCard>
      ) : null}

      {showEmptyPreviewNotice ? (
        <JarvisAlert variant="info">
          No preview rows were returned. Check the file issues above if the CSV
          could not be parsed.
        </JarvisAlert>
      ) : null}

      {hasPreview && editableRows.length > 0 ? (
        <>
          <PreviewSummary
            totals={displayTotals}
            errorCount={previewErrors.length}
          />

          <PreviewTransactionTable
            rows={editableRows}
            onRowChange={handleRowChange}
          />

          <section className="melusi-expenses-import-next">
            <button type="button" className="jv-btn jv-btn--primary" disabled>
              Import expenses
            </button>
            <p>
              Import confirmation will be enabled in the next step after you
              review this preview.
            </p>
          </section>
        </>
      ) : null}

      {!hasPreview && !clientError && !actionError ? (
        <JarvisAlert variant="info">
          Select your private Rocket Money business CSV and choose Preview CSV to
          generate a sanitized summary.
        </JarvisAlert>
      ) : null}
    </div>
  );
}
