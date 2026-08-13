import Link from "next/link";

type FinanceHeaderProps = {
  currentMonthLabel: string;
  excludeBusinessFromPersonal: boolean;
  pendingPlaidReviewCount?: number;
};

export function FinanceHeader({
  currentMonthLabel,
  excludeBusinessFromPersonal,
  pendingPlaidReviewCount = 0,
}: FinanceHeaderProps) {
  return (
    <header className="finance-header">
      <div className="finance-header-title-row">
        <h1 className="finance-header-title">
          Finance <span>Command Center</span>
        </h1>
        <span className="finance-header-signal" aria-hidden="true">
          <span className="finance-header-signal-line" />
        </span>
      </div>
      <p className="finance-header-month">{currentMonthLabel}</p>
      <p className="finance-header-descriptor">
        Read-only view synced from connected institutions.
        {excludeBusinessFromPersonal
          ? " Monthly totals exclude transactions classified as business."
          : null}
      </p>
      <div className="finance-header-actions">
        <Link href="/finance/plaid-review" className="finance-header-action">
          Review Plaid matches
          {pendingPlaidReviewCount > 0 ? (
            <span className="jv-section-count">{pendingPlaidReviewCount}</span>
          ) : null}
        </Link>
        <Link href="/connections/plaid" className="finance-header-action">
          Manage connections
        </Link>
      </div>
    </header>
  );
}
