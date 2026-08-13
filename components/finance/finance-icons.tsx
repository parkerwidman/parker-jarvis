import type { ReactNode } from "react";

type IconProps = {
  className?: string;
};

function FinanceIconBase({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function FinanceWalletIcon({ className }: IconProps) {
  return (
    <FinanceIconBase className={className}>
      <rect
        x="2.5"
        y="5"
        width="13"
        height="9.5"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M2.5 7.5h13M12 10.5h2.5v2H12v-2z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </FinanceIconBase>
  );
}

export function FinanceAvailableCashIcon({ className }: IconProps) {
  return (
    <FinanceIconBase className={className}>
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M9 5.5v7M7 7.5h3.5a1.5 1.5 0 010 3H7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </FinanceIconBase>
  );
}

export function FinanceCashFlowIcon({ className }: IconProps) {
  return (
    <FinanceIconBase className={className}>
      <path
        d="M2.5 9h2l1.5-3.5 2 5.5 1.5-2.5 1.5 2.5H15.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </FinanceIconBase>
  );
}

export function FinanceIncomeIcon({ className }: IconProps) {
  return (
    <FinanceIconBase className={className}>
      <path
        d="M9 13.5V4.5M5.5 8l3.5-3.5L12.5 8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </FinanceIconBase>
  );
}

export function FinanceSpendingIcon({ className }: IconProps) {
  return (
    <FinanceIconBase className={className}>
      <path
        d="M9 4.5v9M12.5 10l-3.5 3.5L5.5 10"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </FinanceIconBase>
  );
}

export function FinanceCreditCardIcon({ className }: IconProps) {
  return (
    <FinanceIconBase className={className}>
      <rect
        x="2"
        y="4.5"
        width="14"
        height="9"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M2 7.5h14" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M5 11h3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </FinanceIconBase>
  );
}

export function FinanceDebtIcon({ className }: IconProps) {
  return (
    <FinanceIconBase className={className}>
      <path
        d="M9 3.5l6.5 11H2.5L9 3.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M9 7.5v3M9 12.5h.01"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </FinanceIconBase>
  );
}

export function FinanceInstitutionIcon({ className }: IconProps) {
  return (
    <FinanceIconBase className={className}>
      <path
        d="M3 7.5h12M4.5 7.5V14M7.5 7.5V14M10.5 7.5V14M13.5 7.5V14M2.5 14.5h13"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 3.5L14 7.5H4L9 3.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </FinanceIconBase>
  );
}

export function FinanceLinkedAccountsIcon({ className }: IconProps) {
  return (
    <FinanceIconBase className={className}>
      <circle cx="4.5" cy="9" r="2" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="13.5" cy="5" r="2" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="13.5" cy="13" r="2" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M6.3 8.2l5.1-2M6.3 9.8l5.1 2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </FinanceIconBase>
  );
}

export function FinanceSyncIcon({ className }: IconProps) {
  return (
    <FinanceIconBase className={className}>
      <path
        d="M13.5 6.5A5 5 0 104.5 11.5M4.5 11.5V8.5M4.5 11.5H7.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </FinanceIconBase>
  );
}

export function FinanceStatusIcon({ className }: IconProps) {
  return (
    <FinanceIconBase className={className}>
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M6 9l2 2 4-4.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </FinanceIconBase>
  );
}

export function FinanceAlertIcon({ className }: IconProps) {
  return (
    <FinanceIconBase className={className}>
      <path
        d="M9 3.5l6.5 11H2.5L9 3.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M9 7.5v3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="9" cy="12.5" r="0.75" fill="currentColor" />
    </FinanceIconBase>
  );
}

export function FinanceCategoryIcon({ className }: IconProps) {
  return (
    <FinanceIconBase className={className}>
      <path
        d="M9 3.5a5.5 5.5 0 110 11 5.5 5.5 0 010-11z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M9 9V5.5M9 9l3 2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </FinanceIconBase>
  );
}

export function FinanceAccountsIcon({ className }: IconProps) {
  return (
    <FinanceIconBase className={className}>
      <path
        d="M3.5 6.5h11v8h-11v-8z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 6.5V5a2.5 2.5 0 015 0v1.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path d="M3.5 9.5h11" stroke="currentColor" strokeWidth="1.2" />
    </FinanceIconBase>
  );
}

export function FinanceSettingsIcon({ className }: IconProps) {
  return (
    <FinanceIconBase className={className}>
      <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M9 2.5v1.5M9 14v1.5M14.5 9H16M2 9h1.5M12.7 5.3l1-1M4.3 12.7l1-1M12.7 12.7l1 1M4.3 5.3l1 1"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </FinanceIconBase>
  );
}

export function FinanceShieldCalmIcon({ className }: IconProps) {
  return (
    <FinanceIconBase className={className}>
      <path
        d="M9 3l5.5 2v4.5c0 3-2.5 5-5.5 6-3-1-5.5-3-5.5-6V5L9 3z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M6.5 9l1.75 1.75L11.5 7.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </FinanceIconBase>
  );
}
