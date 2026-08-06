import Link from "next/link";
import { CommandCenterPanel } from "@/components/jarvis/command-center/command-center-panel";
import { JarvisAlert, JarvisEmptyState } from "@/components/jarvis/jarvis-ui";
import type {
  FinanceAlert,
  FinanceAlertKind,
  FinanceAccountType,
  FinancePersonalOrBusiness,
  FinanceTransactionStatus,
  FinanceTransactionType,
} from "@/lib/jarvis/finance/finance-types";
import type { FinanceCommandCenterData } from "@/lib/jarvis/finance/load-finance-command-center";

type FinanceCommandCenterProps = {
  data: FinanceCommandCenterData | null;
  loadError: string | null;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const ACCOUNT_TYPE_LABELS: Record<FinanceAccountType, string> = {
  checking: "Checking",
  savings: "Savings",
  cash: "Cash",
  credit_card: "Credit card",
  investment: "Investment",
  loan: "Loan",
  other: "Other",
};

const ALERT_SEVERITY: Record<
  FinanceAlertKind,
  "urgent" | "warning" | "informational"
> = {
  cash_below_target: "urgent",
  monthly_spending_above_limit: "urgent",
  recurring_due_soon: "warning",
  stale_balance: "warning",
  large_transaction: "warning",
  possible_duplicate: "informational",
  uncategorized_transaction: "informational",
};

const ALERT_SEVERITY_LABELS: Record<"urgent" | "warning" | "informational", string> = {
  urgent: "Urgent",
  warning: "Attention",
  informational: "Info",
};

function formatCurrency(value: number | null): string {
  if (value === null) {
    return "Unavailable";
  }

  return currencyFormatter.format(value);
}

function formatDebt(value: number | null): string {
  if (value === null) {
    return "Unavailable";
  }

  return currencyFormatter.format(Math.abs(value));
}

function formatDate(dateStr: string, timeZone: string): string {
  return new Date(`${dateStr}T12:00:00.000Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

function formatDateTime(isoString: string | null, timeZone: string): string {
  if (!isoString) {
    return "No successful sync yet";
  }

  return new Date(isoString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

function netCashFlowTone(
  value: number | null,
): "positive" | "negative" | "neutral" | "unavailable" {
  if (value === null) {
    return "unavailable";
  }

  if (value > 0) {
    return "positive";
  }

  if (value < 0) {
    return "negative";
  }

  return "neutral";
}

function formatTransactionAmount(
  amount: number,
  transactionType: FinanceTransactionType,
): { text: string; tone: "income" | "expense" | "refund" | "neutral" } {
  switch (transactionType) {
    case "income":
      return {
        text: currencyFormatter.format(Math.abs(amount)),
        tone: "income",
      };
    case "expense":
      return {
        text: currencyFormatter.format(-Math.abs(amount)),
        tone: "expense",
      };
    case "refund":
      return {
        text: `+${currencyFormatter.format(Math.abs(amount))}`,
        tone: "refund",
      };
    case "transfer":
      return {
        text: currencyFormatter.format(amount),
        tone: "neutral",
      };
    case "adjustment":
      return {
        text: currencyFormatter.format(amount),
        tone: "neutral",
      };
  }
}

function transactionTypeLabel(type: FinanceTransactionType): string {
  switch (type) {
    case "income":
      return "Income";
    case "expense":
      return "Expense";
    case "refund":
      return "Refund";
    case "transfer":
      return "Transfer";
    case "adjustment":
      return "Adjustment";
  }
}

function statusLabel(status: FinanceTransactionStatus): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "posted":
      return "Posted";
    case "void":
      return "Void";
  }
}

function personalOrBusinessLabel(value: FinancePersonalOrBusiness): string {
  switch (value) {
    case "personal":
      return "Personal";
    case "business":
      return "Business";
    case "unclassified":
      return "Unclassified";
  }
}

function FinanceHeader({
  currentMonthLabel,
  excludeBusinessFromPersonal,
}: {
  currentMonthLabel: string;
  excludeBusinessFromPersonal: boolean;
}) {
  return (
    <header className="finance-dash-header">
      <div className="finance-dash-header-main">
        <h1 className="finance-dash-title">
          Finance <span>Command Center</span>
        </h1>
        <p className="finance-dash-month">{currentMonthLabel}</p>
        <p className="finance-dash-descriptor">
          Read-only view synced from connected institutions.
          {excludeBusinessFromPersonal
            ? " Monthly totals exclude business transactions."
            : null}
        </p>
      </div>
      <Link href="/connections/plaid" className="finance-dash-manage-link">
        Manage connections
      </Link>
    </header>
  );
}

function FinanceSnapshotHero({
  data,
}: {
  data: FinanceCommandCenterData;
}) {
  const netTone = netCashFlowTone(data.currentMonthNetCashFlow);

  return (
    <section className="finance-snapshot" aria-label="Financial snapshot">
      <div className="finance-snapshot-hero">
        <div className="finance-snapshot-hero-cell">
          <span className="finance-snapshot-label">Total cash</span>
          <strong
            className={`finance-snapshot-value finance-snapshot-value--hero${data.totalCash === null ? " finance-snapshot-value--unavailable" : ""}`}
          >
            {formatCurrency(data.totalCash)}
          </strong>
          <span className="finance-snapshot-hint">Across checking, savings, and cash</span>
        </div>
        <div className="finance-snapshot-hero-cell">
          <span className="finance-snapshot-label">Available cash</span>
          <strong
            className={`finance-snapshot-value finance-snapshot-value--hero${data.availableCash === null ? " finance-snapshot-value--unavailable" : ""}`}
          >
            {formatCurrency(data.availableCash)}
          </strong>
          <span className="finance-snapshot-hint">Spendable after holds and limits</span>
        </div>
        <div
          className={`finance-snapshot-hero-cell finance-snapshot-hero-cell--flow finance-snapshot-hero-cell--${netTone}`}
        >
          <span className="finance-snapshot-label">Net cash flow</span>
          <strong
            className={`finance-snapshot-value finance-snapshot-value--flow finance-snapshot-value--${netTone}`}
          >
            {data.currentMonthNetCashFlow === null
              ? "Unavailable"
              : currencyFormatter.format(data.currentMonthNetCashFlow)}
          </strong>
          <span className="finance-snapshot-hint">Income minus spending this month</span>
        </div>
      </div>

      <div className="finance-snapshot-strip">
        <div className="finance-snapshot-cell">
          <span className="finance-snapshot-label">Income this month</span>
          <strong
            className={`finance-snapshot-value${data.currentMonthIncome === null ? " finance-snapshot-value--unavailable" : " finance-snapshot-value--income"}`}
          >
            {data.currentMonthIncome === null
              ? "Unavailable"
              : formatCurrency(data.currentMonthIncome)}
          </strong>
        </div>
        <div className="finance-snapshot-cell">
          <span className="finance-snapshot-label">Spending this month</span>
          <strong
            className={`finance-snapshot-value${data.currentMonthSpending === null ? " finance-snapshot-value--unavailable" : " finance-snapshot-value--spending"}`}
          >
            {data.currentMonthSpending === null
              ? "Unavailable"
              : formatCurrency(data.currentMonthSpending)}
          </strong>
        </div>
        <div className="finance-snapshot-cell">
          <span className="finance-snapshot-label">Credit card balance</span>
          <strong
            className={`finance-snapshot-value${data.creditCardBalance === null ? " finance-snapshot-value--unavailable" : data.creditCardBalance > 0 ? " finance-snapshot-value--debt" : ""}`}
          >
            {formatDebt(data.creditCardBalance)}
          </strong>
        </div>
        <div className="finance-snapshot-cell">
          <span className="finance-snapshot-label">Total debt</span>
          <strong
            className={`finance-snapshot-value${data.totalDebt === null ? " finance-snapshot-value--unavailable" : data.totalDebt > 0 ? " finance-snapshot-value--debt" : ""}`}
          >
            {formatDebt(data.totalDebt)}
          </strong>
        </div>
      </div>
    </section>
  );
}

function FinanceConnectionHealth({
  data,
}: {
  data: FinanceCommandCenterData;
}) {
  const needsAttention = data.anyConnectionNeedsAttention;
  const hasConnections = data.connectedPlaidConnectionCount > 0;

  return (
    <section
      className={`finance-connection-health${needsAttention ? " finance-connection-health--attention" : ""}`}
      aria-label="Connection health"
    >
      <div className="finance-connection-health-cell">
        <span className="finance-snapshot-label">Institutions</span>
        <strong className="finance-snapshot-value">
          {data.connectedPlaidConnectionCount}
        </strong>
      </div>
      <div className="finance-connection-health-cell">
        <span className="finance-snapshot-label">Linked accounts</span>
        <strong className="finance-snapshot-value">
          {data.linkedPlaidAccountCount}
        </strong>
      </div>
      <div className="finance-connection-health-cell">
        <span className="finance-snapshot-label">Latest sync</span>
        <strong className="finance-snapshot-value finance-snapshot-value--sync">
          {formatDateTime(data.latestSuccessfulPlaidSyncAt, data.timezone)}
        </strong>
      </div>
      <div className="finance-connection-health-cell">
        <span className="finance-snapshot-label">Status</span>
        <strong
          className={`finance-connection-status${needsAttention ? " finance-connection-status--attention" : hasConnections ? " finance-connection-status--healthy" : " finance-connection-status--neutral"}`}
        >
          {needsAttention
            ? "Needs attention"
            : hasConnections
              ? "Connected"
              : "No connections"}
        </strong>
      </div>
    </section>
  );
}

function FinanceAlertsSection({ alerts }: { alerts: FinanceAlert[] }) {
  if (alerts.length === 0) {
    return (
      <CommandCenterPanel title="Alerts">
        <p className="cc-empty cc-empty--calm">
          No financial alerts right now. Your accounts look steady.
        </p>
      </CommandCenterPanel>
    );
  }

  return (
    <CommandCenterPanel title="Alerts">
      <ul className="cc-dash-attention finance-alerts">
        {alerts.map((alert, index) => {
          const severity = ALERT_SEVERITY[alert.kind];

          return (
            <li
              key={`${alert.kind}-${index}`}
              className={`cc-dash-attention-item cc-dash-attention-item--${severity}`}
            >
              <span className="cc-dash-attention-severity">
                {ALERT_SEVERITY_LABELS[severity]}
              </span>
              <span className="cc-dash-attention-message finance-alert-title">
                {alert.title}
              </span>
              <p className="finance-alert-explanation">{alert.explanation}</p>
            </li>
          );
        })}
      </ul>
    </CommandCenterPanel>
  );
}

function FinanceCategorySpendingSection({
  categories,
}: {
  categories: FinanceCommandCenterData["topSpendingCategories"];
}) {
  if (categories.length === 0) {
    return (
      <CommandCenterPanel title="Spending by category">
        <JarvisEmptyState
          title="No category spending yet"
          description="Posted expenses for this month will appear here once transactions are synced."
        />
      </CommandCenterPanel>
    );
  }

  const maxAmount = categories[0]?.amount ?? 1;

  return (
    <CommandCenterPanel title="Spending by category">
      <ul className="finance-category-list">
        {categories.map((category) => (
          <li key={category.categoryId ?? "uncategorized"} className="finance-category-row">
            <div className="finance-category-row-header">
              <span className="finance-category-name">{category.name}</span>
              <span className="finance-category-amount">
                {formatCurrency(category.amount)}
                <em>{category.sharePercent}%</em>
              </span>
            </div>
            <div className="finance-category-bar" aria-hidden="true">
              <span
                className="finance-category-bar-fill"
                style={{ width: `${Math.max(4, (category.amount / maxAmount) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="finance-category-footnote">
        Top categories for the current calendar month.
      </p>
    </CommandCenterPanel>
  );
}

function FinanceAccountsSection({
  accounts,
  timeZone,
}: {
  accounts: FinanceCommandCenterData["accounts"];
  timeZone: string;
}) {
  if (accounts.length === 0) {
    return (
      <CommandCenterPanel
        title="Accounts"
        href="/connections/plaid"
        hrefLabel="Connect accounts"
      >
        <JarvisEmptyState
          title="No connected accounts"
          description="Link your institutions through Plaid to see balances and transactions here."
        />
      </CommandCenterPanel>
    );
  }

  return (
    <CommandCenterPanel title="Accounts">
      <div className="finance-table-wrap">
        <table className="finance-table">
          <thead>
            <tr>
              <th scope="col">Institution</th>
              <th scope="col">Account</th>
              <th scope="col">Type</th>
              <th scope="col" className="finance-table-num">
                Balance
              </th>
              <th scope="col" className="finance-table-num">
                Available
              </th>
              <th scope="col">Freshness</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <td>{account.institutionName ?? "—"}</td>
                <td>
                  {account.name}
                  {account.lastFour ? (
                    <span className="finance-account-last-four"> ···{account.lastFour}</span>
                  ) : null}
                </td>
                <td>{ACCOUNT_TYPE_LABELS[account.accountType]}</td>
                <td className="finance-table-num">
                  {formatCurrency(account.currentBalance)}
                </td>
                <td className="finance-table-num">
                  {account.availableBalance === null
                    ? "—"
                    : formatCurrency(account.availableBalance)}
                </td>
                <td>
                  {account.balanceIsStale ? (
                    <span className="finance-stale-badge">Stale</span>
                  ) : (
                    <span className="finance-fresh-badge">Current</span>
                  )}
                  <span className="finance-balance-as-of">
                    {formatDate(account.balanceAsOf, timeZone)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CommandCenterPanel>
  );
}

function FinanceTransactionsSection({
  transactions,
  pendingCount,
  timeZone,
}: {
  transactions: FinanceCommandCenterData["recentTransactions"];
  pendingCount: number;
  timeZone: string;
}) {
  return (
    <CommandCenterPanel title="Recent transactions">
      {pendingCount > 0 ? (
        <p className="finance-pending-note">
          {pendingCount} pending transaction{pendingCount === 1 ? "" : "s"} not yet posted.
        </p>
      ) : null}

      {transactions.length === 0 ? (
        <JarvisEmptyState
          title="No recent transactions"
          description="Synced transactions from the last few weeks will show up here."
        />
      ) : (
        <div className="finance-table-wrap">
          <table className="finance-table finance-table--transactions">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Description</th>
                <th scope="col">Account</th>
                <th scope="col">Category</th>
                <th scope="col">Status</th>
                <th scope="col">Class</th>
                <th scope="col" className="finance-table-num">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => {
                const amount = formatTransactionAmount(
                  transaction.amount,
                  transaction.transactionType,
                );

                return (
                  <tr key={transaction.id}>
                    <td>{formatDate(transaction.transactionDate, timeZone)}</td>
                    <td>
                      <span className="finance-transaction-merchant">
                        {transaction.merchantOrDescription}
                      </span>
                      <span className="finance-transaction-type">
                        {transactionTypeLabel(transaction.transactionType)}
                      </span>
                    </td>
                    <td>{transaction.accountName ?? "—"}</td>
                    <td>{transaction.categoryName ?? "Uncategorized"}</td>
                    <td>
                      <span
                        className={`finance-status-badge finance-status-badge--${transaction.status}`}
                      >
                        {statusLabel(transaction.status)}
                      </span>
                    </td>
                    <td>{personalOrBusinessLabel(transaction.personalOrBusiness)}</td>
                    <td
                      className={`finance-table-num finance-amount finance-amount--${amount.tone}`}
                    >
                      {amount.text}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </CommandCenterPanel>
  );
}

export function FinanceCommandCenter({ data, loadError }: FinanceCommandCenterProps) {
  if (loadError) {
    return (
      <div className="finance-dash-layout">
        <FinanceHeader
          currentMonthLabel="Finance overview"
          excludeBusinessFromPersonal={false}
        />
        <JarvisAlert variant="error">
          Could not load your finance dashboard. {loadError}
        </JarvisAlert>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="finance-dash-layout">
      <FinanceHeader
        currentMonthLabel={data.currentMonthLabel}
        excludeBusinessFromPersonal={data.excludeBusinessFromPersonal}
      />

      <FinanceSnapshotHero data={data} />
      <FinanceConnectionHealth data={data} />

      <div className="finance-dash-grid">
        <FinanceAlertsSection alerts={data.alerts} />
        <FinanceCategorySpendingSection categories={data.topSpendingCategories} />
      </div>

      <FinanceAccountsSection accounts={data.accounts} timeZone={data.timezone} />
      <FinanceTransactionsSection
        transactions={data.recentTransactions}
        pendingCount={data.pendingTransactionCount}
        timeZone={data.timezone}
      />
    </div>
  );
}
