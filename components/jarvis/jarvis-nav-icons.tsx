import type { ReactNode } from "react";

export type JarvisNavIconName =
  | "command"
  | "melusi"
  | "finance"
  | "fitness"
  | "goals"
  | "tasks"
  | "brief"
  | "plan"
  | "approvals"
  | "microsoft"
  | "assistant";

const ICONS: Record<JarvisNavIconName, ReactNode> = {
  command: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  melusi: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 6.5h6M5 9h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  finance: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 5.5h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1.5 1.5 0 0 1-1.5-1.5v-5a1.5 1.5 0 0 1 1.5-1.5z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M2 6.5V5.5a2 2 0 0 1 2-2h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="11.5" cy="9.5" r="1" fill="currentColor" />
    </svg>
  ),
  fitness: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 8.5c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M2.5 8.5h11M8 8.5V12"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="8" cy="8.5" r="1" fill="currentColor" />
    </svg>
  ),
  goals: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="0.75" fill="currentColor" />
    </svg>
  ),
  tasks: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 8l2 2 4-4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  brief: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 4.5h10M3 8h10M3 11.5h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  plan: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 5v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
  approvals: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 8l1.5 1.5 3.5-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  microsoft: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="5.5" height="5.5" fill="currentColor" opacity="0.9" />
      <rect x="8.5" y="2" width="5.5" height="5.5" fill="currentColor" opacity="0.7" />
      <rect x="2" y="8.5" width="5.5" height="5.5" fill="currentColor" opacity="0.7" />
      <rect x="8.5" y="8.5" width="5.5" height="5.5" fill="currentColor" opacity="0.5" />
    </svg>
  ),
  assistant: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="1.25" fill="currentColor" />
      <path d="M8 2.5v1.5M8 12v1.5M2.5 8h1.5M12 8h1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  ),
};

export function JarvisNavIcon({ name }: { name: JarvisNavIconName }) {
  return <span className="cc2-nav-icon">{ICONS[name]}</span>;
}

export function JarvisBrandIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <path
        d="M17 4.5 26.5 10.25v13.5L17 29.5 7.5 23.75v-13.5L17 4.5Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <circle cx="17" cy="17" r="5.25" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="17" cy="17" r="2" fill="currentColor" />
    </svg>
  );
}
