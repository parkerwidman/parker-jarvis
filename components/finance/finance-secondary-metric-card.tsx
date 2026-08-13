import type { ReactNode } from "react";

type FinanceSecondaryMetricCardProps = {
  label: string;
  value: string;
  icon: ReactNode;
  accent: "income" | "spending" | "debt" | "neutral";
};

export function FinanceSecondaryMetricCard({
  label,
  value,
  icon,
  accent,
}: FinanceSecondaryMetricCardProps) {
  return (
    <article
      className={`finance-secondary-card finance-secondary-card--${accent}`}
      aria-label={label}
    >
      <span className="finance-secondary-card-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="finance-secondary-card-label">{label}</span>
      <strong className="finance-secondary-card-value">{value}</strong>
    </article>
  );
}
