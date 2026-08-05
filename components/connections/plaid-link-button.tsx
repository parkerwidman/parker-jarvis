"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { useRouter } from "next/navigation";

type PlaidLinkButtonProps = {
  disabled?: boolean;
};

export function PlaidLinkButton({ disabled = false }: PlaidLinkButtonProps) {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [shouldOpen, setShouldOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const onSuccess = useCallback(
    async (publicToken: string) => {
      setPending(true);
      setActionError(null);

      try {
        const response = await fetch("/api/integrations/plaid/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicToken }),
        });

        const payload = (await response.json()) as {
          ok?: boolean;
          error?: string;
        };

        if (!response.ok || !payload.ok) {
          setActionError(
            "Could not connect the Sandbox bank. Please try again.",
          );
          return;
        }

        setLinkToken(null);
        setShouldOpen(false);
        router.refresh();
      } catch {
        setActionError("Could not connect the Sandbox bank. Please try again.");
      } finally {
        setPending(false);
      }
    },
    [router],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (public_token) => {
      if (public_token) {
        void onSuccess(public_token);
      }
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

  async function handleConnect() {
    if (pending || disabled) {
      return;
    }

    setPending(true);
    setActionError(null);

    try {
      const response = await fetch("/api/integrations/plaid/link-token", {
        method: "POST",
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        linkToken?: string;
        error?: string;
      };

      if (!response.ok || !payload.ok || !payload.linkToken) {
        setActionError("Could not start Plaid Link. Please try again.");
        setPending(false);
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
        onClick={handleConnect}
        disabled={pending || disabled}
        aria-busy={pending}
      >
        {pending ? "Connecting…" : "Connect Sandbox bank"}
      </button>

      {actionError ? (
        <p className="jv-connection-meta jv-connection-meta--error">{actionError}</p>
      ) : null}
    </div>
  );
}
