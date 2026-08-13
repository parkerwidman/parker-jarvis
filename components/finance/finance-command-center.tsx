import { FinanceAccountsTable } from "@/components/finance/finance-accounts-table";
import { FinanceAlertsPanel } from "@/components/finance/finance-alerts-panel";
import { FinanceCategoryPanel } from "@/components/finance/finance-category-panel";
import { FinanceConnectionStrip } from "@/components/finance/finance-connection-strip";
import {
  formatFinanceCurrency,
  formatFinanceDebt,
  netCashFlowTone,
} from "@/components/finance/finance-formatters";
import { FinanceHeader } from "@/components/finance/finance-header";
import { FinanceHeroMetricCard } from "@/components/finance/finance-hero-metric-card";
import {
  FinanceAvailableCashIcon,
  FinanceCashFlowIcon,
  FinanceCreditCardIcon,
  FinanceDebtIcon,
  FinanceIncomeIcon,
  FinanceSpendingIcon,
  FinanceWalletIcon,
} from "@/components/finance/finance-icons";
import { FinanceSecondaryMetricCard } from "@/components/finance/finance-secondary-metric-card";
import { JarvisAlert } from "@/components/jarvis/jarvis-ui";
import type { FinanceCommandCenterData } from "@/lib/jarvis/finance/load-finance-command-center";

type FinanceCommandCenterProps = {
  data: FinanceCommandCenterData | null;
  loadError: string | null;
  pendingPlaidReviewCount?: number;
};

function FinancePrimaryMetrics({ data }: { data: FinanceCommandCenterData }) {
  const netTone = netCashFlowTone(data.currentMonthNetCashFlow);

  return (
    <section className="finance-hero-grid" aria-label="Primary financial metrics">
      <FinanceHeroMetricCard
        label="Total cash"
        value={formatFinanceCurrency(data.totalCash)}
        hint="Across checking, savings, and cash"
        icon={<FinanceWalletIcon />}
        tone={data.totalCash === null ? "unavailable" : "cyan"}
      />
      <FinanceHeroMetricCard
        label="Available cash"
        value={formatFinanceCurrency(data.availableCash)}
        hint="Spendable after holds and limits"
        icon={<FinanceAvailableCashIcon />}
        tone={data.availableCash === null ? "unavailable" : "cyan"}
      />
      <FinanceHeroMetricCard
        label="Net cash flow"
        value={
          data.currentMonthNetCashFlow === null
            ? "Unavailable"
            : formatFinanceCurrency(data.currentMonthNetCashFlow)
        }
        hint="Income minus spending this month"
        icon={<FinanceCashFlowIcon />}
        tone={netTone === "unavailable" ? "unavailable" : netTone}
      />
    </section>
  );
}

function FinanceSecondaryMetrics({ data }: { data: FinanceCommandCenterData }) {
  return (
    <section className="finance-secondary-grid" aria-label="Secondary financial metrics">
      <FinanceSecondaryMetricCard
        label="Income this month"
        value={
          data.currentMonthIncome === null
            ? "Unavailable"
            : formatFinanceCurrency(data.currentMonthIncome)
        }
        icon={<FinanceIncomeIcon />}
        accent={
          data.currentMonthIncome === null ? "neutral" : "income"
        }
      />
      <FinanceSecondaryMetricCard
        label="Spending this month"
        value={
          data.currentMonthSpending === null
            ? "Unavailable"
            : formatFinanceCurrency(data.currentMonthSpending)
        }
        icon={<FinanceSpendingIcon />}
        accent={
          data.currentMonthSpending === null ? "neutral" : "spending"
        }
      />
      <FinanceSecondaryMetricCard
        label="Credit card balance"
        value={formatFinanceDebt(data.creditCardBalance)}
        icon={<FinanceCreditCardIcon />}
        accent={
          data.creditCardBalance === null || data.creditCardBalance <= 0
            ? "neutral"
            : "debt"
        }
      />
      <FinanceSecondaryMetricCard
        label="Total debt"
        value={formatFinanceDebt(data.totalDebt)}
        icon={<FinanceDebtIcon />}
        accent={
          data.totalDebt === null || data.totalDebt <= 0 ? "neutral" : "debt"
        }
      />
    </section>
  );
}

export function FinanceCommandCenter({
  data,
  loadError,
  pendingPlaidReviewCount = 0,
}: FinanceCommandCenterProps) {
  if (loadError) {
    return (
      <div className="finance-dash-layout">
        <FinanceHeader
          currentMonthLabel="Finance overview"
          excludeBusinessFromPersonal={false}
          pendingPlaidReviewCount={pendingPlaidReviewCount}
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
        pendingPlaidReviewCount={pendingPlaidReviewCount}
      />

      <FinancePrimaryMetrics data={data} />
      <FinanceSecondaryMetrics data={data} />

      <FinanceConnectionStrip
        institutionCount={data.connectedPlaidConnectionCount}
        linkedAccountCount={data.linkedPlaidAccountCount}
        latestSyncAt={data.latestSuccessfulPlaidSyncAt}
        status={data.connectionStatus}
        timeZone={data.timezone}
      />

      <div className="finance-content-grid">
        <FinanceAlertsPanel alerts={data.alerts} />
        <FinanceCategoryPanel categories={data.topSpendingCategories} />
      </div>

      <FinanceAccountsTable accounts={data.accounts} timeZone={data.timezone} />
    </div>
  );
}
