import type { ReactNode } from "react";

type FitnessMetricCardProps = {
  title: string;
  accent: "recovery" | "sleep" | "strain" | "workout" | "body";
  icon: ReactNode;
  children: ReactNode;
  className?: string;
};

export function FitnessMetricCard({
  title,
  accent,
  icon,
  children,
  className = "",
}: FitnessMetricCardProps) {
  return (
    <article
      className={`fit-card fit-card--${accent} ${className}`.trim()}
      aria-label={title}
    >
      <header className="fit-card-head">
        <span className="fit-card-icon" aria-hidden="true">
          {icon}
        </span>
        <h2 className="fit-card-title">{title}</h2>
      </header>
      <div className="fit-card-body">{children}</div>
    </article>
  );
}

export function FitnessMetricRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return (
    <div className="fit-metric-row">
      <span className="fit-metric-label">{label}</span>
      <span className="fit-metric-value">{value}</span>
    </div>
  );
}

function RecoveryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2 8h1.5l1-2.5 2 5 1.5-3 1 2H14"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SleepIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M12.5 10.5a5 5 0 01-7.2-6.8A5 5 0 1012.5 10.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StrainIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M9.5 2.5L5.5 9h3L6.5 13.5 11 7H8l1.5-4.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WorkoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 6.5h2v3h-2v-3zm9 0h2v3h-2v-3zM6 7h4v2H6V7z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BodyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M5.5 7.5c0-1.2 1.1-2 2.5-2s2.5.8 2.5 2M6 13l2-3 2 3M8 10.5V13"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export { RecoveryIcon, SleepIcon, StrainIcon, WorkoutIcon, BodyIcon };
