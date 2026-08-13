import type { ReactNode } from "react";
import Link from "next/link";

type FinancePanelProps = {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  settingsHref?: string;
  settingsLabel?: string;
  className?: string;
};

export function FinancePanel({
  title,
  icon,
  children,
  settingsHref,
  settingsLabel = "Manage accounts",
  className = "",
}: FinancePanelProps) {
  return (
    <section className={`finance-panel${className ? ` ${className}` : ""}`}>
      <div className="finance-panel-head">
        <div className="finance-panel-title-wrap">
          <span className="finance-panel-icon" aria-hidden="true">
            {icon}
          </span>
          <h2 className="finance-panel-title">{title}</h2>
        </div>
        {settingsHref ? (
          <Link
            href={settingsHref}
            className="finance-panel-settings"
            aria-label={settingsLabel}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.1" />
              <path
                d="M8 2v1.5M8 12.5V14M13 8h-1.5M4.5 8H3M11.2 4.8l-1 1M5.8 10.2l-1 1M11.2 11.2l1 1M5.8 5.8l1-1"
                stroke="currentColor"
                strokeWidth="1.1"
                strokeLinecap="round"
              />
            </svg>
          </Link>
        ) : null}
      </div>
      <div className="finance-panel-body">{children}</div>
    </section>
  );
}
