import type { ReactNode } from "react";

type IconProps = {
  className?: string;
};

function MelusiIconBase({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function MelusiTasksIcon({ className }: IconProps) {
  return (
    <MelusiIconBase className={className}>
      <rect
        x="3"
        y="2.5"
        width="10"
        height="11"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.1"
      />
      <path
        d="M5.5 6h5M5.5 8.5h5M5.5 11h3"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </MelusiIconBase>
  );
}

export function MelusiProjectsIcon({ className }: IconProps) {
  return (
    <MelusiIconBase className={className}>
      <path
        d="M3 5.5l5-2.5 5 2.5v6.5a1 1 0 01-1 1H4a1 1 0 01-1-1V5.5z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M8 3v10" stroke="currentColor" strokeWidth="1.1" />
    </MelusiIconBase>
  );
}

export function MelusiClipboardIcon({ className }: IconProps) {
  return (
    <MelusiIconBase className={className}>
      <rect
        x="4"
        y="3.5"
        width="8"
        height="10"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.1"
      />
      <path
        d="M6 3.5h4a1 1 0 011 1v1H5v-1a1 1 0 011-1z"
        stroke="currentColor"
        strokeWidth="1.1"
      />
    </MelusiIconBase>
  );
}

export function MelusiActiveProjectsKpiIcon({ className }: IconProps) {
  return (
    <MelusiIconBase className={className}>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.1" />
      <path
        d="M8 5v3l2 1.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </MelusiIconBase>
  );
}

export function MelusiOpenTasksKpiIcon({ className }: IconProps) {
  return (
    <MelusiIconBase className={className}>
      <path
        d="M4 4.5h8M4 8h8M4 11.5h5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      <rect
        x="2.5"
        y="2.5"
        width="11"
        height="11"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.1"
      />
    </MelusiIconBase>
  );
}

export function MelusiSocialKpiIcon({ className }: IconProps) {
  return (
    <MelusiIconBase className={className}>
      <circle cx="5" cy="8" r="2" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="11" cy="5.5" r="1.75" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="11" cy="10.5" r="1.75" stroke="currentColor" strokeWidth="1.1" />
      <path
        d="M6.8 7.2l2.4-1M6.8 8.8l2.4 1"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </MelusiIconBase>
  );
}

export function MelusiUpdateKpiIcon({ className }: IconProps) {
  return (
    <MelusiIconBase className={className}>
      <path
        d="M8 3v5l2.5 1.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.1" />
    </MelusiIconBase>
  );
}

export function MelusiTargetIcon({ className }: IconProps) {
  return (
    <MelusiIconBase className={className}>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.1" />
      <circle cx="8" cy="8" r="0.75" fill="currentColor" />
    </MelusiIconBase>
  );
}

export function MelusiTargetGraphic({ className }: IconProps) {
  return (
    <svg
      width="88"
      height="88"
      viewBox="0 0 88 88"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id="melusi-target-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#4DA3FF" />
        </linearGradient>
        <radialGradient id="melusi-target-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="44" cy="44" r="40" fill="url(#melusi-target-glow)" />
      <circle cx="44" cy="44" r="36" stroke="rgba(34,211,238,0.14)" strokeWidth="0.75" />
      <circle cx="44" cy="44" r="28" stroke="rgba(34,211,238,0.22)" strokeWidth="0.75" />
      <circle
        cx="44"
        cy="44"
        r="20"
        stroke="url(#melusi-target-gradient)"
        strokeWidth="2"
        strokeDasharray="95 24"
        transform="rotate(-35 44 44)"
      />
      <circle cx="44" cy="44" r="12" fill="rgba(5,7,10,0.92)" stroke="rgba(34,211,238,0.35)" strokeWidth="0.75" />
      <circle cx="44" cy="44" r="4" fill="#22D3EE" />
      <path
        d="M58 18l8 8-4 2 6 10-4 2-8-12 4-2-6-8 4-2z"
        fill="#4DA3FF"
        fillOpacity="0.85"
      />
      <path d="M58 18l10 2-2 4" stroke="#A5F3FC" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export function MelusiProjectTileIcon({
  kind,
  className,
}: IconProps & { kind: "video" | "web" | "generic" }) {
  switch (kind) {
    case "video":
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true" className={className}>
          <rect x="3" y="6" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M15 9.5l4-2v7l-4-2v-3z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    case "web":
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true" className={className}>
          <circle cx="11" cy="11" r="7.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M3.5 11h15M11 3.5c2 2.2 2 12.8 0 15M11 3.5c-2 2.2-2 12.8 0 15" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      );
    case "generic":
      return (
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true" className={className}>
          <path d="M5 8l6-3 6 3v7l-6 3-6-3V8z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M11 5v13" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      );
  }
}

export function MelusiTasksEmptyVisual({ className }: IconProps) {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true" className={className}>
      <circle cx="28" cy="28" r="26" stroke="rgba(34,211,238,0.16)" strokeWidth="1" strokeDasharray="2 5" />
      <circle cx="28" cy="28" r="20" stroke="rgba(34,211,238,0.24)" strokeWidth="1" />
      <circle cx="28" cy="28" r="14" fill="rgba(34,211,238,0.06)" />
      <rect x="18" y="16" width="20" height="24" rx="2" stroke="#22D3EE" strokeWidth="1.3" />
      <path d="M22 16h12a1.5 1.5 0 011.5 1.5V19H20.5V17.5A1.5 1.5 0 0122 16z" stroke="#22D3EE" strokeWidth="1.2" />
      <path d="M22 24h12M22 28h8" stroke="#67E8F9" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function MelusiKpiRingIcon({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`melusi-kpi-icon-ring${className ? ` ${className}` : ""}`}>
      {children}
    </span>
  );
}

export function MelusiPipelineIcon({ className }: IconProps) {
  return (
    <MelusiIconBase className={className}>
      <path d="M3 12h10M3 8h7M3 4h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
    </MelusiIconBase>
  );
}

export function MelusiHeartbeatIcon({ className }: IconProps) {
  return (
    <svg
      width="14"
      height="10"
      viewBox="0 0 14 10"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M0 5h2l1.5-3.5L6 9l2-6 1.5 2H14"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MelusiChevronIcon({ className }: IconProps) {
  return (
    <MelusiIconBase className={className}>
      <path
        d="M6 4l3 4-3 4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </MelusiIconBase>
  );
}

export function MelusiWarningIcon({ className }: IconProps) {
  return (
    <MelusiIconBase className={className}>
      <path
        d="M8 3.5l5 8.5H3L8 3.5z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M8 7v2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="8" cy="10.25" r="0.5" fill="currentColor" />
    </MelusiIconBase>
  );
}

export function MelusiQuickActionIcon({
  name,
  className,
}: IconProps & {
  name: "create" | "brief" | "plan" | "approvals";
}) {
  switch (name) {
    case "create":
      return (
        <MelusiIconBase className={className}>
          <path
            d="M8 3.5v9M3.5 8h9"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </MelusiIconBase>
      );
    case "brief":
      return (
        <MelusiIconBase className={className}>
          <circle cx="8" cy="8" r="3.5" fill="currentColor" fillOpacity="0.9" />
          <path
            d="M8 2.5v1.5M8 12v1.5M2.5 8h1.5M12 8h1.5M4.2 4.2l1 1M10.8 10.8l1 1M11.8 4.2l-1 1M4.2 11.8l1 1"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </MelusiIconBase>
      );
    case "plan":
      return (
        <MelusiIconBase className={className}>
          <rect x="3" y="2.5" width="10" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
          <path d="M5.5 6h5M5.5 8.5h5M8 2.5V5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </MelusiIconBase>
      );
    case "approvals":
      return (
        <MelusiIconBase className={className}>
          <path
            d="M8 2.5l4.5 2v4.5c0 2.2-2 3.8-4.5 4.5C5.5 12.3 3.5 10.7 3.5 8.5V4.5L8 2.5z"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
          <path d="M6.2 8.2l1.2 1.2 2.6-2.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </MelusiIconBase>
      );
  }
}
