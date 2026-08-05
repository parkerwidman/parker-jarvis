"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type PlaidDisconnectButtonProps = {
  disabled?: boolean;
};

export function PlaidDisconnectButton({
  disabled = false,
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
      });
      const payload = (await response.json()) as { ok?: boolean };

      if (!response.ok || !payload.ok) {
        setActionError("Could not disconnect the Sandbox bank.");
        return;
      }

      router.refresh();
    } catch {
      setActionError("Could not disconnect the Sandbox bank.");
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
