"use client";

import Link from "next/link";

import {
  buildCommandCenterInsight,
  buildCommandCenterInsightInput,
  buildJarvisStatusLabel,
} from "@/lib/jarvis/dashboard/command-center-insight";
import type { CommandCenterData } from "@/lib/jarvis/dashboard/load-command-center";

type CommandCenterStatusRailProps = {
  data: CommandCenterData;
  openTaskCount: number;
  todayEventCount: number;
};

const STATUS_RING_DOTS = [
  { cx: "168", cy: "90" },
  { cx: "145.1543", cy: "145.1543" },
  { cx: "90", cy: "168" },
  { cx: "34.8457", cy: "145.1543" },
  { cx: "12", cy: "90" },
  { cx: "34.8457", cy: "34.8457" },
  { cx: "90", cy: "12" },
  { cx: "145.1543", cy: "34.8457" },
] as const;

const QUICK_ACTIONS = [
  { href: "#cc2-priority-hero", label: "Start Focus Session", icon: "focus" },
  { href: "/briefings", label: "Morning Brief", icon: "brief" },
  { href: "/plans", label: "Daily Plan", icon: "plan" },
  { href: "/approvals", label: "Approvals", icon: "approvals" },
] as const;

function QuickActionIcon({ name }: { name: (typeof QUICK_ACTIONS)[number]["icon"] }) {
  switch (name) {
    case "focus":
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 2.5v2M8 11.5v2M2.5 8h2M11.5 8h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="8" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case "brief":
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M8 4.5V8l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "plan":
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="3" y="2.5" width="10" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "approvals":
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 8.5l2.5 2.5L12 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="2.5" y="3" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
  }
}

function StatusPulseIcon() {
  return (
    <svg width="12" height="8" viewBox="0 0 14 10" fill="none" aria-hidden="true">
      <path
        d="M0 5h2l1.5-3.5L6 9l2-6 1.5 2H14"
        stroke="url(#cc2-status-pulse-gradient)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="cc2-status-pulse-gradient" x1="0" y1="0" x2="14" y2="0">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="50%" stopColor="#4DA3FF" />
          <stop offset="100%" stopColor="#7C6CFF" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function mapRingHeadline(headline: string): string {
  if (headline === "Systems Ready") {
    return "Optimal";
  }

  return headline;
}

function StatusRing({ headline }: { headline: string }) {
  return (
    <div className="cc2-status-ring" aria-hidden="true">
      <svg className="cc2-status-ring-svg" viewBox="0 0 180 180">
        <defs>
          <linearGradient id="cc2-status-ring-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22D3EE" />
            <stop offset="38%" stopColor="#4DA3FF" />
            <stop offset="72%" stopColor="#7C6CFF" />
            <stop offset="100%" stopColor="#C084FC" />
          </linearGradient>
        </defs>
        <circle
          cx="90"
          cy="90"
          r="78"
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
          strokeDasharray="2 7"
        />
        {STATUS_RING_DOTS.map((dot, index) => (
          <circle key={index} cx={dot.cx} cy={dot.cy} r="1" fill="rgba(125,185,255,0.28)" />
        ))}
        <circle
          cx="90"
          cy="90"
          r="68"
          fill="rgba(5,7,10,0.92)"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth="1"
        />
        <circle
          cx="90"
          cy="90"
          r="68"
          fill="none"
          stroke="url(#cc2-status-ring-gradient)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray="360 68"
          transform="rotate(-110 90 90)"
        />
      </svg>
      <div className="cc2-status-ring-label">
        <span className="cc2-status-ring-eyebrow">All Systems</span>
        <span className="cc2-status-ring-headline">{mapRingHeadline(headline)}</span>
        <StatusPulseIcon />
      </div>
    </div>
  );
}

export function CommandCenterStatusRail({
  data,
  openTaskCount,
  todayEventCount,
}: CommandCenterStatusRailProps) {
  const needsReconnect =
    data.outlook.needsReconnect || data.inbox.needsReconnect;
  const status = buildJarvisStatusLabel({
    overdueTasks: data.counts.overdueTasks,
    pendingApprovals: data.counts.pendingApprovals,
    needsReconnect,
  });
  const insight = buildCommandCenterInsight(
    buildCommandCenterInsightInput(data, openTaskCount, todayEventCount),
  );

  return (
    <aside className="cc2-dashboard-rail" aria-label="Jarvis status and quick actions">
      <section className="cc2-rail-card cc2-rail-card--status" aria-label="Jarvis status">
        <StatusRing headline={status.headline} />
        <p className="cc2-status-detail">{status.detail}</p>
      </section>

      <section className="cc2-rail-card cc2-rail-card--actions" aria-label="Quick actions">
        <p className="cc2-rail-eyebrow">Quick Actions</p>
        <ul className="cc2-quick-actions">
          {QUICK_ACTIONS.map((action) => (
            <li key={action.href}>
              <Link href={action.href} className="cc2-quick-action">
                <span className="cc2-quick-action-icon">
                  <QuickActionIcon name={action.icon} />
                </span>
                <span className="cc2-quick-action-label">{action.label}</span>
                <span className="cc2-quick-action-chevron" aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="cc2-rail-card cc2-rail-card--insight" aria-label="AI insight">
        <div className="cc2-insight-head">
          <span className="cc2-insight-icon" aria-hidden="true">✦</span>
          <p className="cc2-rail-eyebrow">AI Insight</p>
        </div>
        <p className="cc2-insight-copy">{insight}</p>
        <div className="cc2-insight-orb" aria-hidden="true">
          <svg className="cc2-insight-orb-svg" viewBox="0 0 80 80" fill="none">
            <circle cx="40" cy="40" r="28" stroke="rgba(125,185,255,0.14)" strokeWidth="1" strokeDasharray="2 5" />
            <circle cx="40" cy="40" r="20" stroke="rgba(124,108,255,0.22)" strokeWidth="1" />
            <circle cx="52" cy="48" r="6" fill="rgba(124,108,255,0.35)" />
            <circle cx="52" cy="48" r="3" fill="rgba(167,139,250,0.55)" />
          </svg>
        </div>
      </section>
    </aside>
  );
}
