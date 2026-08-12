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
    <div className="fit-sync-controls">
      <div className="fit-sync-btn">
        <WhoopSyncButton label="Sync WHOOP" showSummary={false} />
      </div>
      <div className="fit-sync-meta">
        {syncInProgress ? (
          <p className="fit-sync-status">Syncing WHOOP data...</p>
        ) : null}
        <p>
          Last synced:{" "}
          <span className="fit-sync-value">{syncFreshnessLabel}</span>
        </p>
        {lastSyncedLabel ? (
          <p className="fit-sync-timestamp">{lastSyncedLabel}</p>
        ) : null}
      </div>
    </div>
  );
}
