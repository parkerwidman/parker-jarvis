"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type PlaidSyncButtonProps = {
  connectionId?: string;
  syncAll?: boolean;
  disabled?: boolean;
  label?: string;
};

type SyncResult = {
  connectionId: string;
  status: "success" | "reconnect_required" | "error";
  accountsCreated: number;
  accountsUpdated: number;
  transactionsAdded: number;
  transactionsModified: number;
  transactionsRemoved: number;
  unclassifiedCount: number;
};

export function PlaidSyncButton({
  connectionId,
  syncAll = false,
  disabled = false,
  label,
}: PlaidSyncButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<string | null>(null);

  async function handleSync() {
    if (pending || disabled) {
      return;
    }

    setPending(true);
    setActionError(null);
    setLastSummary(null);

    try {
      const response = await fetch("/api/integrations/plaid/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          syncAll ? { syncAll: true } : { connectionId },
        ),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        results?: SyncResult[];
        error?: string;
      };

      if (!response.ok || !payload.ok || !payload.results) {
        setActionError("Sync could not be completed.");
        return;
      }

      const summaries = payload.results.map((result) => {
        if (result.status === "reconnect_required") {
          return "Reconnection required.";
        }

        if (result.status === "error") {
          return "Sync failed.";
        }

        return `Accounts +${result.accountsCreated}/${result.accountsUpdated}, transactions +${result.transactionsAdded}/${result.transactionsModified}/${result.transactionsRemoved}, unclassified ${result.unclassifiedCount}.`;
      });

      setLastSummary(summaries.join(" "));
      router.refresh();
    } catch {
      setActionError("Sync could not be completed.");
    } finally {
      setPending(false);
    }
  }

  const buttonLabel = label ?? (syncAll ? "Sync all" : "Sync now");

  return (
    <div className="jv-connection-actions">
      <button
        type="button"
        className="jv-btn jv-btn--primary"
        onClick={handleSync}
        disabled={pending || disabled}
        aria-busy={pending}
      >
        {pending ? "Syncing…" : buttonLabel}
      </button>

      {actionError ? (
        <p className="jv-connection-meta jv-connection-meta--error">{actionError}</p>
      ) : null}

      {lastSummary ? (
        <p className="jv-connection-meta">{lastSummary}</p>
      ) : null}
    </div>
  );
}
