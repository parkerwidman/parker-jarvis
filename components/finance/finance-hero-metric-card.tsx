import type { ReactNode } from "react";

type FinanceHeroMetricCardProps = {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
  tone?: "cyan" | "positive" | "negative" | "neutral" | "unavailable";
};

export function FinanceHeroMetricCard({
  label,
  value,
  hint,
  icon,
  tone = "cyan",
}: FinanceHeroMetricCardProps) {
  return (
    <article
      className={`finance-hero-card finance-hero-card--${tone}`}
      aria-label={label}
    >
      <span className="finance-hero-card-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="finance-hero-card-label">{label}</span>
      <strong className="finance-hero-card-value">{value}</strong>
      <span className="finance-hero-card-hint">{hint}</span>
    </article>
  );
}
