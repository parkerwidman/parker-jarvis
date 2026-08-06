"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type PlaidDisconnectButtonProps = {
  connectionId: string;
  disabled?: boolean;
  disconnectErrorMessage: string;
};

export function PlaidDisconnectButton({
  connectionId,
  disabled = false,
  disconnectErrorMessage,
}: PlaidDisconnectButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleDisconnect() {
    if (pending || disabled) {
      return;
    }

    setPending(true);
    setActionError(null);

    try {
      const response = await fetch("/api/integrations/plaid/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const payload = (await response.json()) as { ok?: boolean };

      if (!response.ok || !payload.ok) {
        setActionError(disconnectErrorMessage);
        return;
      }

      router.refresh();
    } catch {
      setActionError(disconnectErrorMessage);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="jv-connection-actions">
      <button
        type="button"
        className="jv-btn jv-btn--ghost"
        onClick={handleDisconnect}
        disabled={pending || disabled}
        aria-busy={pending}
      >
        {pending ? "Disconnecting…" : "Disconnect"}
      </button>

      {actionError ? (
        <p className="jv-connection-meta jv-connection-meta--error">{actionError}</p>
      ) : null}
    </div>
  );
}
