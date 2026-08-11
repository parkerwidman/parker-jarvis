"use client";

import { useState } from "react";

export function WhoopDisconnectButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDisconnect() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/integrations/whoop/disconnect", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        setError("WHOOP disconnect could not be completed.");
        setPending(false);
        return;
      }

      window.location.assign("/integrations/whoop?status=disconnected");
    } catch {
      setError("WHOOP disconnect could not be completed.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleDisconnect}
        disabled={pending}
        className="inline-flex items-center justify-center rounded-lg border border-[var(--navy-border)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Disconnecting..." : "Disconnect WHOOP"}
      </button>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  );
}
