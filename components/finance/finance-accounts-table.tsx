import {
  formatAccountDisplayName,
  formatFinanceCurrency,
  formatFinanceDate,
  FINANCE_ACCOUNT_TYPE_LABELS,
} from "@/components/finance/finance-formatters";
import { FinanceAccountsIcon } from "@/components/finance/finance-icons";
import { FinancePanel } from "@/components/finance/finance-panel";
import type { FinanceCommandCenterAccount } from "@/lib/jarvis/finance/load-finance-command-center";

type FinanceAccountsTableProps = {
  accounts: FinanceCommandCenterAccount[];
  timeZone: string;
};

export function FinanceAccountsTable({ accounts, timeZone }: FinanceAccountsTableProps) {
  if (accounts.length === 0) {
    return (
      <FinancePanel
        title="Accounts"
        icon={<FinanceAccountsIcon />}
        settingsHref="/connections/plaid"
        settingsLabel="Manage connections"
      >
        <div className="finance-empty-state">
          <p className="finance-empty-state-title">No connected accounts</p>
          <p className="finance-empty-state-copy">
            Link your institutions through Plaid to see balances and transactions here.
          </p>
        </div>
      </FinancePanel>
    );
  }

  return (
    <FinancePanel
      title="Accounts"
      icon={<FinanceAccountsIcon />}
      settingsHref="/connections/plaid"
      settingsLabel="Manage connections"
    >
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
                  {formatAccountDisplayName(account.name, account.lastFour)}
                </td>
                <td>{FINANCE_ACCOUNT_TYPE_LABELS[account.accountType]}</td>
                <td className="finance-table-num">
                  {formatFinanceCurrency(account.currentBalance)}
                </td>
                <td className="finance-table-num">
                  {account.availableBalance === null
                    ? "—"
                    : formatFinanceCurrency(account.availableBalance)}
                </td>
                <td>
                  {account.balanceIsStale ? (
                    <span className="finance-freshness-badge finance-freshness-badge--stale">
                      Stale
                    </span>
                  ) : (
                    <span className="finance-freshness-badge finance-freshness-badge--current">
                      Current
                    </span>
                  )}
                  <span className="finance-freshness-date">
                    {formatFinanceDate(account.balanceAsOf, timeZone)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </FinancePanel>
  );
}
