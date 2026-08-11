"use client";

import { WhoopSyncButton } from "@/components/integrations/whoop-sync-button";

type FitnessSyncControlsProps = {
  syncInProgress: boolean;
  syncFreshnessLabel: string;
  lastSyncedLabel: string | null;
};

export function FitnessSyncControls({
  syncInProgress,
  syncFreshnessLabel,
  lastSyncedLabel,
}: FitnessSyncControlsProps) {
  return (
    <div className="flex flex-col items-start gap-3 sm:items-end">
      <WhoopSyncButton label="Sync WHOOP" showSummary={false} />
      <div className="text-sm text-[var(--navy-muted)]">
        {syncInProgress ? (
          <p className="text-[var(--foreground)]">Syncing WHOOP data...</p>
        ) : null}
        <p>
          Last synced:{" "}
          <span className="text-[var(--foreground)]">{syncFreshnessLabel}</span>
        </p>
        {lastSyncedLabel ? (
          <p className="text-xs">{lastSyncedLabel}</p>
        ) : null}
      </div>
    </div>
  );
}
