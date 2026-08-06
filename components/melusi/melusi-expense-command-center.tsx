import Link from "next/link";
import { CommandCenterPanel } from "@/components/jarvis/command-center/command-center-panel";
import { JarvisAlert, JarvisEmptyState } from "@/components/jarvis/jarvis-ui";
import { getLocalDateString } from "@/lib/jarvis/dashboard/command-center-utils";
import { daysBetweenDates } from "@/lib/jarvis/finance/finance-calculations";
import type { FinanceFrequency } from "@/lib/jarvis/finance/finance-types";
import type {
  MelusiExpenseHistoryItem,
  MelusiExpenseImportHistoryItem,
  MelusiExpensesCommandCenterData,
  MelusiUpcomingRecurringCharge,
} from "@/lib/jarvis/finance/load-melusi-expenses";
import type {
  RocketMoneyClassificationStatus,
  RocketMoneyCostTreatment,
  RocketMoneyFundingSource,
} from "@/lib/jarvis/finance/rocket-money-import-types";

type MelusiExpenseCommandCenterProps = {
  data: MelusiExpensesCommandCenterData | null;
  loadError: string | null;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const FUNDING_SOURCE_LABELS: Record<RocketMoneyFundingSource, string> = {
  owner_funded: "Owner funded",
  business_account: "Business account",
  unknown: "Unknown",
};

const COST_TREATMENT_LABELS: Record<RocketMoneyCostTreatment, string> = {
  one_time: "One-time",
  prepaid: "Prepaid",
  monthly_recurring: "Monthly recurring",
  annual_recurring: "Annual recurring",
  unknown: "Unknown",
};

const CLASSIFICATION_STATUS_LABELS: Record<
  RocketMoneyClassificationStatus,
  string
> = {
  user_confirmed: "Confirmed",
  inferred: "Inferred",
  needs_review: "Needs review",
};

const FREQUENCY_LABELS: Record<FinanceFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

const TRANSACTION_SOURCE_LABELS: Record<
  MelusiExpenseHistoryItem["source"],
  string
> = {
  rocket_money_csv: "Rocket Money import",
  manual: "Manual entry",
  plaid: "Bank sync",
};

const IMPORT_SOURCE_LABELS: Record<
  MelusiExpenseImportHistoryItem["source"],
  string
> = {
  rocket_money_csv: "Rocket Money CSV",
};

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatDate(dateStr: string, timeZone: string): string {
  return new Date(`${dateStr}T12:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

function formatDateTime(isoString: string, timeZone: string): string {
  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

function descriptionIsUseful(
  merchant: string | null,
  description: string | null,
): description is string {
  if (!description || !merchant) {
    return false;
  }

  const normalizedMerchant = merchant.trim().toLowerCase();
  const normalizedDescription = description.trim().toLowerCase();

  return (
    normalizedDescription.length > 0 &&
    normalizedDescription !== normalizedMerchant
  );
}

function formatSignedAmount(item: MelusiExpenseHistoryItem): {
  text: string;
  tone: "expense" | "refund";
} {
  if (item.isRefund) {
    return {
      text: `+${formatCurrency(Math.abs(item.amount))}`,
      tone: "refund",
    };
  }

  return {
    text: formatCurrency(-Math.abs(item.amount)),
    tone: "expense",
  };
}

function dueStateLabel(
  nextExpectedDate: string,
  reminderDays: number,
  asOfDate: string,
): { label: string; tone: "calm" | "soon" | "overdue" } | null {
  const daysUntilDue = daysBetweenDates(asOfDate, nextExpectedDate);

  if (daysUntilDue < 0) {
    return { label: "Overdue", tone: "overdue" };
  }

  if (daysUntilDue <= reminderDays) {
    return {
      label: daysUntilDue === 0 ? "Due today" : `Due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}`,
      tone: "soon",
    };
  }

  return null;
}

function SnapshotMetric({
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

function ExpenseCommandCenterHeader() {
  return (
    <header className="melusi-header melusi-subpage-header melusi-expenses-cc-header">
      <div className="melusi-header-copy">
        <Link href="/melusi" className="jv-back-link">
          ← Melusi Command Center
        </Link>
        <h1 className="melusi-title">Melusi Expenses</h1>
        <p className="melusi-subtitle">
          Track owner-funded Melusi business costs, startup spending, prepaid
          services, and recurring overhead from imported records.
        </p>
        <p className="melusi-expenses-cc-disclaimer">
          Owner-funded spending shown here is operational tracking—not formal
          legal equity, tax basis, or accounting treatment.
        </p>
      </div>
    </header>
  );
}

function PrimarySnapshot({ data }: { data: MelusiExpensesCommandCenterData }) {
  return (
    <section className="melusi-expenses-cc-snapshot" aria-label="Owner-funded snapshot">
      <div className="melusi-expenses-cc-hero">
        <div className="melusi-expenses-cc-hero-cell">
          <span className="melusi-expenses-cc-label">Net owner-funded spending</span>
          <strong className="melusi-expenses-cc-hero-value">
            {formatCurrency(data.netOwnerFundedSpending)}
          </strong>
          <span className="melusi-expenses-cc-hint">
            Personal funds used for Melusi after refunds
          </span>
        </div>
      </div>

      <div className="melusi-expenses-spending-grid">
        <SnapshotMetric
          label="Gross owner-funded expenses"
          value={formatCurrency(data.grossOwnerFundedExpenses)}
        />
        <SnapshotMetric
          label="Refunds received"
          value={formatCurrency(data.ownerFundedRefunds)}
        />
        <SnapshotMetric
          label="Avg. monthly recurring overhead"
          value={formatCurrency(data.estimatedAverageMonthlyOverhead)}
          emphasis
        />
        <SnapshotMetric
          label="Estimated annual recurring run rate"
          value={formatCurrency(data.estimatedAnnualRecurringRunRate)}
          emphasis
        />
        <SnapshotMetric
          label="Current monthly recurring"
          value={formatCurrency(data.currentMonthlyRecurringAmount)}
        />
        <SnapshotMetric
          label="Current annual recurring"
          value={formatCurrency(data.currentAnnualRecurringAmount)}
        />
      </div>
    </section>
  );
}

function CostBreakdown({ data }: { data: MelusiExpensesCommandCenterData }) {
  return (
    <CommandCenterPanel title="Cost breakdown">
      <div className="melusi-expenses-spending-grid">
        <SnapshotMetric
          label="One-time costs"
          value={formatCurrency(data.oneTimeSpending)}
        />
        <SnapshotMetric
          label="Prepaid costs"
          value={formatCurrency(data.prepaidSpending)}
        />
        <SnapshotMetric
          label="Historical monthly recurring"
          value={formatCurrency(data.historicalMonthlyRecurringSpending)}
        />
        <SnapshotMetric
          label="Historical annual recurring"
          value={formatCurrency(data.historicalAnnualRecurringSpending)}
        />
        <SnapshotMetric
          label="Unknown / unclassified"
          value={formatCurrency(data.unknownSpending)}
        />
        <SnapshotMetric
          label="Expense records"
          value={String(data.totalExpenseRecordCount)}
        />
        <SnapshotMetric
          label="Needs review"
          value={String(data.needsReviewCount)}
        />
        <SnapshotMetric
          label="Active recurring items"
          value={String(data.recurringItemCount)}
        />
      </div>
    </CommandCenterPanel>
  );
}

function UpcomingChargeRow({
  charge,
  timeZone,
  asOfDate,
}: {
  charge: MelusiUpcomingRecurringCharge;
  timeZone: string;
  asOfDate: string;
}) {
  const dueState = dueStateLabel(
    charge.nextExpectedDate,
    charge.reminderDays,
    asOfDate,
  );

  return (
    <tr>
      <td>{charge.name}</td>
      <td className="finance-table-num">{formatCurrency(charge.expectedAmount)}</td>
      <td>{FREQUENCY_LABELS[charge.frequency]}</td>
      <td>{formatDate(charge.nextExpectedDate, timeZone)}</td>
      <td>{charge.autopay ? "Autopay on" : "Manual"}</td>
      <td>
        {dueState ? (
          <span
            className={`melusi-expenses-cc-due-badge melusi-expenses-cc-due-badge--${dueState.tone}`}
          >
            {dueState.label}
          </span>
        ) : (
          <span className="melusi-expenses-muted">On schedule</span>
        )}
        {charge.reminderDays > 0 ? (
          <span className="melusi-expenses-cc-reminder">
            Reminder {charge.reminderDays} day{charge.reminderDays === 1 ? "" : "s"} before
          </span>
        ) : null}
      </td>
    </tr>
  );
}

function UpcomingChargeCard({
  charge,
  timeZone,
  asOfDate,
}: {
  charge: MelusiUpcomingRecurringCharge;
  timeZone: string;
  asOfDate: string;
}) {
  const dueState = dueStateLabel(
    charge.nextExpectedDate,
    charge.reminderDays,
    asOfDate,
  );

  return (
    <article className="melusi-expenses-mobile-card">
      <div className="melusi-expenses-mobile-card-header">
        <div>
          <h3>{charge.name}</h3>
          <p>{formatDate(charge.nextExpectedDate, timeZone)}</p>
        </div>
        <strong>{formatCurrency(charge.expectedAmount)}</strong>
      </div>
      <dl className="melusi-expenses-mobile-meta">
        <div>
          <dt>Frequency</dt>
          <dd>{FREQUENCY_LABELS[charge.frequency]}</dd>
        </div>
        <div>
          <dt>Autopay</dt>
          <dd>{charge.autopay ? "On" : "Manual"}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            {dueState ? dueState.label : "On schedule"}
            {charge.reminderDays > 0
              ? ` · ${charge.reminderDays}-day reminder`
              : ""}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function UpcomingChargesSection({
  data,
  asOfDate,
}: {
  data: MelusiExpensesCommandCenterData;
  asOfDate: string;
}) {
  const { upcomingRecurringCharges, timezone } = data;

  if (upcomingRecurringCharges.length === 0) {
    return (
      <CommandCenterPanel title="Upcoming charges">
        <p className="cc-empty cc-empty--calm">
          No upcoming recurring charges on file. Import expenses with recurring
          classifications to track expected subscription dates.
        </p>
      </CommandCenterPanel>
    );
  }

  return (
    <CommandCenterPanel title="Upcoming charges">
      <div className="melusi-expenses-cc-table-wrap finance-table-wrap">
        <table className="finance-table melusi-expenses-cc-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col" className="finance-table-num">
                Expected amount
              </th>
              <th scope="col">Frequency</th>
              <th scope="col">Next expected</th>
              <th scope="col">Autopay</th>
              <th scope="col">Due status</th>
            </tr>
          </thead>
          <tbody>
            {upcomingRecurringCharges.map((charge) => (
              <UpcomingChargeRow
                key={charge.recurringItemId}
                charge={charge}
                timeZone={timezone}
                asOfDate={asOfDate}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="melusi-expenses-cc-mobile-cards">
        {upcomingRecurringCharges.map((charge) => (
          <UpcomingChargeCard
            key={charge.recurringItemId}
            charge={charge}
            timeZone={timezone}
            asOfDate={asOfDate}
          />
        ))}
      </div>
    </CommandCenterPanel>
  );
}

function ExpenseHistoryRow({
  item,
  timeZone,
}: {
  item: MelusiExpenseHistoryItem;
  timeZone: string;
}) {
  const amount = formatSignedAmount(item);
  const showDescription = descriptionIsUseful(item.merchant, item.description);

  return (
    <tr>
      <td>{formatDate(item.transactionDate, timeZone)}</td>
      <td>{item.merchant ?? "—"}</td>
      <td className="melusi-expenses-description">
        {showDescription ? item.description : "—"}
      </td>
      <td className={`finance-table-num finance-amount finance-amount--${amount.tone}`}>
        {amount.text}
      </td>
      <td>{item.isRefund ? "Refund" : "Expense"}</td>
      <td>{FUNDING_SOURCE_LABELS[item.fundingSource]}</td>
      <td>{COST_TREATMENT_LABELS[item.costTreatment]}</td>
      <td>{CLASSIFICATION_STATUS_LABELS[item.classificationStatus]}</td>
      <td>
        {item.prepaidMonths !== null
          ? `${item.prepaidMonths} mo.`
          : item.serviceThroughDate
            ? formatDate(item.serviceThroughDate, timeZone)
            : "—"}
      </td>
      <td>{item.recurringItemId ? "Linked recurring" : "—"}</td>
      <td>{item.notes ?? "—"}</td>
      <td>{TRANSACTION_SOURCE_LABELS[item.source]}</td>
    </tr>
  );
}

function ExpenseHistoryCard({
  item,
  timeZone,
}: {
  item: MelusiExpenseHistoryItem;
  timeZone: string;
}) {
  const amount = formatSignedAmount(item);
  const showDescription = descriptionIsUseful(item.merchant, item.description);

  return (
    <article className="melusi-expenses-mobile-card">
      <div className="melusi-expenses-mobile-card-header">
        <div>
          <h3>{item.merchant ?? "Unknown merchant"}</h3>
          <p>{formatDate(item.transactionDate, timeZone)}</p>
        </div>
        <span className={`finance-amount finance-amount--${amount.tone}`}>
          {amount.text}
        </span>
      </div>

      {showDescription ? (
        <p className="melusi-expenses-mobile-description">{item.description}</p>
      ) : null}

      <dl className="melusi-expenses-mobile-meta">
        <div>
          <dt>Type</dt>
          <dd>{item.isRefund ? "Refund" : "Expense"}</dd>
        </div>
        <div>
          <dt>Funding</dt>
          <dd>{FUNDING_SOURCE_LABELS[item.fundingSource]}</dd>
        </div>
        <div>
          <dt>Cost treatment</dt>
          <dd>{COST_TREATMENT_LABELS[item.costTreatment]}</dd>
        </div>
        <div>
          <dt>Classification</dt>
          <dd>{CLASSIFICATION_STATUS_LABELS[item.classificationStatus]}</dd>
        </div>
        <div>
          <dt>Prepaid / service</dt>
          <dd>
            {item.prepaidMonths !== null
              ? `${item.prepaidMonths} months`
              : item.serviceThroughDate
                ? formatDate(item.serviceThroughDate, timeZone)
                : "—"}
          </dd>
        </div>
        <div>
          <dt>Recurring</dt>
          <dd>{item.recurringItemId ? "Linked recurring" : "—"}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{TRANSACTION_SOURCE_LABELS[item.source]}</dd>
        </div>
        {item.notes ? (
          <div>
            <dt>Notes</dt>
            <dd>{item.notes}</dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}

function ExpenseHistorySection({ data }: { data: MelusiExpensesCommandCenterData }) {
  const { importedExpenseHistory, timezone } = data;

  if (importedExpenseHistory.length === 0) {
    return (
      <CommandCenterPanel title="Expense history">
        <JarvisEmptyState
          title="No imported expenses yet"
          description="Upload a Rocket Money business CSV below to add Melusi expense records."
        />
      </CommandCenterPanel>
    );
  }

  return (
    <CommandCenterPanel title="Expense history">
      <div className="melusi-expenses-cc-table-wrap finance-table-wrap">
        <table className="finance-table melusi-expenses-cc-table melusi-expenses-cc-table--history">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Merchant</th>
              <th scope="col">Description</th>
              <th scope="col" className="finance-table-num">
                Amount
              </th>
              <th scope="col">Type</th>
              <th scope="col">Funding</th>
              <th scope="col">Cost treatment</th>
              <th scope="col">Classification</th>
              <th scope="col">Prepaid / service</th>
              <th scope="col">Recurring</th>
              <th scope="col">Notes</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {importedExpenseHistory.map((item) => (
              <ExpenseHistoryRow
                key={item.transactionId}
                item={item}
                timeZone={timezone}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="melusi-expenses-cc-mobile-cards">
        {importedExpenseHistory.map((item) => (
          <ExpenseHistoryCard
            key={item.transactionId}
            item={item}
            timeZone={timezone}
          />
        ))}
      </div>
    </CommandCenterPanel>
  );
}

function ImportHistorySection({ data }: { data: MelusiExpensesCommandCenterData }) {
  const { safeImportHistory, timezone } = data;

  if (safeImportHistory.length === 0) {
    return (
      <CommandCenterPanel title="Import history">
        <p className="cc-empty cc-empty--calm">
          No completed imports yet. Your first CSV import will appear here.
        </p>
      </CommandCenterPanel>
    );
  }

  return (
    <CommandCenterPanel title="Import history">
      <div className="melusi-expenses-cc-table-wrap finance-table-wrap">
        <table className="finance-table melusi-expenses-cc-table">
          <thead>
            <tr>
              <th scope="col">Completed</th>
              <th scope="col" className="finance-table-num">
                Imported
              </th>
              <th scope="col" className="finance-table-num">
                Skipped
              </th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {safeImportHistory.map((batch, index) => (
              <tr key={`import-${index}`}>
                <td>{formatDateTime(batch.completedAt, timezone)}</td>
                <td className="finance-table-num">{batch.importedCount}</td>
                <td className="finance-table-num">{batch.skippedCount}</td>
                <td>{IMPORT_SOURCE_LABELS[batch.source]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="melusi-expenses-cc-mobile-cards">
        {safeImportHistory.map((batch, index) => (
          <article key={`import-mobile-${index}`} className="melusi-expenses-mobile-card">
            <div className="melusi-expenses-mobile-card-header">
              <div>
                <h3>{IMPORT_SOURCE_LABELS[batch.source]}</h3>
                <p>{formatDateTime(batch.completedAt, timezone)}</p>
              </div>
            </div>
            <dl className="melusi-expenses-mobile-meta">
              <div>
                <dt>Imported</dt>
                <dd>{batch.importedCount}</dd>
              </div>
              <div>
                <dt>Skipped</dt>
                <dd>{batch.skippedCount}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </CommandCenterPanel>
  );
}

export function MelusiExpenseCommandCenter({
  data,
  loadError,
}: MelusiExpenseCommandCenterProps) {
  if (loadError) {
    return (
      <div className="melusi-expenses-cc">
        <ExpenseCommandCenterHeader />
        <JarvisAlert variant="error">{loadError}</JarvisAlert>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="melusi-expenses-cc">
        <ExpenseCommandCenterHeader />
        <JarvisAlert variant="error">
          Could not load Melusi expense records. Try refreshing the page.
        </JarvisAlert>
      </div>
    );
  }

  const asOfDate = getLocalDateString(data.timezone);

  return (
    <div className="melusi-expenses-cc">
      <ExpenseCommandCenterHeader />
      <PrimarySnapshot data={data} />
      <CostBreakdown data={data} />
      <UpcomingChargesSection data={data} asOfDate={asOfDate} />
      <ExpenseHistorySection data={data} />
      <ImportHistorySection data={data} />
    </div>
  );
}
