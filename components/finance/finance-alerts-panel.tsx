import { FinancePanel } from "@/components/finance/finance-panel";
import { FinanceAlertIcon, FinanceShieldCalmIcon } from "@/components/finance/finance-icons";
import type {
  FinanceAlert,
  FinanceAlertKind,
} from "@/lib/jarvis/finance/finance-types";

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

type FinanceAlertsPanelProps = {
  alerts: FinanceAlert[];
};

export function FinanceAlertsPanel({ alerts }: FinanceAlertsPanelProps) {
  return (
    <FinancePanel title="Alerts" icon={<FinanceAlertIcon />}>
      {alerts.length === 0 ? (
        <div className="finance-empty-state finance-empty-state--calm">
          <span className="finance-empty-state-icon" aria-hidden="true">
            <FinanceShieldCalmIcon />
          </span>
          <p className="finance-empty-state-title">
            No financial alerts right now.
          </p>
          <p className="finance-empty-state-copy">Your accounts look steady.</p>
        </div>
      ) : (
        <ul className="finance-alerts-list">
          {alerts.map((alert, index) => {
            const severity = ALERT_SEVERITY[alert.kind];

            return (
              <li
                key={`${alert.kind}-${index}`}
                className={`finance-alerts-item finance-alerts-item--${severity}`}
              >
                <span className="finance-alerts-severity">
                  {ALERT_SEVERITY_LABELS[severity]}
                </span>
                <span className="finance-alerts-title">{alert.title}</span>
                <p className="finance-alerts-explanation">{alert.explanation}</p>
              </li>
            );
          })}
        </ul>
      )}
    </FinancePanel>
  );
}
