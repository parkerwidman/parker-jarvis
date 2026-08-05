"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { useRouter } from "next/navigation";

type PlaidReconnectButtonProps = {
  connectionId: string;
  disabled?: boolean;
};

export function PlaidReconnectButton({
  connectionId,
  disabled = false,
}: PlaidReconnectButtonProps) {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [shouldOpen, setShouldOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const completeUpdate = useCallback(async () => {
    setPending(true);
    setActionError(null);

    try {
      const response = await fetch("/api/integrations/plaid/update-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.ok) {
        setActionError("Could not verify this bank connection. Please try again.");
        return;
      }

      setLinkToken(null);
      setShouldOpen(false);
      router.refresh();
    } catch {
      setActionError("Could not verify this bank connection. Please try again.");
    } finally {
      setPending(false);
    }
  }, [connectionId, router]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: () => {
      void completeUpdate();
    },
    onExit: () => {
      setLinkToken(null);
      setShouldOpen(false);
      setPending(false);
    },
  });

  useEffect(() => {
    if (shouldOpen && linkToken && ready) {
      open();
      setShouldOpen(false);
    }
  }, [shouldOpen, linkToken, ready, open]);

  async function handleReconnect() {
    if (pending || disabled) {
      return;
    }

    setPending(true);
    setActionError(null);

    try {
      const response = await fetch("/api/integrations/plaid/update-link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        linkToken?: string;
        error?: string;
      };

      if (!response.ok || !payload.ok || !payload.linkToken) {
        if (payload.error === "token_not_repairable") {
          setActionError(
            "This bank connection can no longer be renewed through Plaid update mode.",
          );
        } else {
          setActionError("Could not start Plaid Link. Please try again.");
        }
        setPending(false);
        router.refresh();
        return;
      }

      setLinkToken(payload.linkToken);
      setShouldOpen(true);
      setPending(false);
    } catch {
      setActionError("Could not start Plaid Link. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="jv-connection-actions">
      <button
        type="button"
        className="jv-btn jv-btn--primary"
        onClick={handleReconnect}
        disabled={pending || disabled}
        aria-busy={pending}
      >
        {pending ? "Reconnecting…" : "Reconnect"}
      </button>

      {actionError ? (
        <p className="jv-connection-meta jv-connection-meta--error">{actionError}</p>
      ) : null}
    </div>
  );
}
