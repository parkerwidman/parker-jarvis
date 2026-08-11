"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type WhoopSyncSummary = {
  cycles: number;
  recoveries: number;
  sleeps: number;
  workouts: number;
  bodyMeasurement: boolean;
  syncedAt: string;
};

export function WhoopSyncButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<WhoopSyncSummary | null>(null);

  async function handleSync() {
    setPending(true);
    setError(null);
    setSummary(null);

    try {
      const response = await fetch("/api/integrations/whoop/sync", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
        summary?: WhoopSyncSummary;
      };

      if (!response.ok || !payload.ok || !payload.summary) {
        setError(payload.message ?? "WHOOP sync could not be completed.");
        setPending(false);
        return;
      }

      setSummary(payload.summary);
      setPending(false);
      router.refresh();
    } catch {
      setError("WHOOP sync could not be completed.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleSync}
        disabled={pending}
        className="inline-flex items-center justify-center rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Syncing WHOOP data..." : "Sync WHOOP Data"}
      </button>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {summary ? (
        <p className="text-sm text-[var(--foreground)]">
          Synced {summary.cycles} cycles, {summary.recoveries} recoveries,{" "}
          {summary.sleeps} sleeps, and {summary.workouts} workouts.
        </p>
      ) : null}
    </div>
  );
}
