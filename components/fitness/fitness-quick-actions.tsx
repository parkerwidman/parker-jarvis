"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const QUICK_ACTIONS = [
  {
    kind: "sync" as const,
    label: "Sync WHOOP",
    icon: "sync",
  },
  {
    kind: "link" as const,
    href: "/plans",
    label: "Daily Plan",
    icon: "plan",
  },
  {
    kind: "link" as const,
    href: "/integrations/whoop",
    label: "Open WHOOP details",
    icon: "whoop",
  },
] as const;

function QuickActionIcon({ name }: { name: (typeof QUICK_ACTIONS)[number]["icon"] }) {
  switch (name) {
    case "sync":
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M8 2.5v2M8 11.5v2M2.5 8h2M11.5 8h2"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <circle cx="8" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case "plan":
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="3" y="2.5" width="10" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "whoop":
      return (
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="4.5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M8 5v3l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
  }
}

function SyncWhoopQuickAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSync() {
    setPending(true);

    try {
      const response = await fetch("/api/integrations/whoop/sync", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };

      if (!response.ok || !payload.ok) {
        setPending(false);
        return;
      }

      setPending(false);
      router.refresh();
    } catch {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      className="fit-quick-action"
      onClick={handleSync}
      disabled={pending}
      aria-label={pending ? "Syncing WHOOP data" : "Sync WHOOP"}
    >
      <span className="fit-quick-action-icon">
        <QuickActionIcon name="sync" />
      </span>
      <span className="fit-quick-action-label">
        {pending ? "Syncing WHOOP..." : "Sync WHOOP"}
      </span>
      <span className="fit-quick-action-chevron" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

export function FitnessQuickActions() {
  return (
    <section className="fit-rail-card fit-rail-card--actions" aria-label="Quick actions">
      <h2 className="fit-rail-eyebrow">Quick Actions</h2>
      <ul className="fit-quick-actions">
        {QUICK_ACTIONS.map((action) => (
          <li key={action.label}>
            {action.kind === "sync" ? (
              <SyncWhoopQuickAction />
            ) : (
              <Link href={action.href} className="fit-quick-action">
                <span className="fit-quick-action-icon">
                  <QuickActionIcon name={action.icon} />
                </span>
                <span className="fit-quick-action-label">{action.label}</span>
                <span className="fit-quick-action-chevron" aria-hidden="true">
                  ›
                </span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
