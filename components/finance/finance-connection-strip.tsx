import {
  formatFinanceDateTime,
} from "@/components/finance/finance-formatters";
import {
  FinanceInstitutionIcon,
  FinanceLinkedAccountsIcon,
  FinanceStatusIcon,
  FinanceSyncIcon,
} from "@/components/finance/finance-icons";
import type { FinanceConnectionStatusLabel } from "@/lib/jarvis/finance/load-finance-command-center";

type FinanceConnectionStripProps = {
  institutionCount: number;
  linkedAccountCount: number;
  latestSyncAt: string | null;
  status: FinanceConnectionStatusLabel;
  timeZone: string;
};

const STATUS_LABELS: Record<FinanceConnectionStatusLabel, string> = {
  connected: "Connected",
  syncing: "Syncing",
  needs_attention: "Needs attention",
  no_connections: "No connections",
};

export function FinanceConnectionStrip({
  institutionCount,
  linkedAccountCount,
  latestSyncAt,
  status,
  timeZone,
}: FinanceConnectionStripProps) {
  return (
    <section
      className={`finance-connection-strip finance-connection-strip--${status}`}
      aria-label="Connection health"
    >
      <div className="finance-connection-cell">
        <span className="finance-connection-cell-icon" aria-hidden="true">
          <FinanceInstitutionIcon />
        </span>
        <span className="finance-connection-cell-label">Institutions</span>
        <strong className="finance-connection-cell-value">{institutionCount}</strong>
      </div>
      <div className="finance-connection-cell">
        <span className="finance-connection-cell-icon" aria-hidden="true">
          <FinanceLinkedAccountsIcon />
        </span>
        <span className="finance-connection-cell-label">Linked accounts</span>
        <strong className="finance-connection-cell-value">{linkedAccountCount}</strong>
      </div>
      <div className="finance-connection-cell">
        <span className="finance-connection-cell-icon" aria-hidden="true">
          <FinanceSyncIcon />
        </span>
        <span className="finance-connection-cell-label">Latest sync</span>
        <strong className="finance-connection-cell-value finance-connection-cell-value--sync">
          {formatFinanceDateTime(latestSyncAt, timeZone)}
        </strong>
      </div>
      <div className="finance-connection-cell">
        <span className="finance-connection-cell-icon" aria-hidden="true">
          <FinanceStatusIcon />
        </span>
        <span className="finance-connection-cell-label">Status</span>
        <strong
          className={`finance-connection-cell-status finance-connection-cell-status--${status}`}
        >
          {STATUS_LABELS[status]}
        </strong>
      </div>
    </section>
  );
}
