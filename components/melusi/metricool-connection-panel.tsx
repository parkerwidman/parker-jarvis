"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type MetricoolConnectionActionsProps = {
  canVerify: boolean;
  canDisconnect: boolean;
  canReconnect: boolean;
  canRecover?: boolean;
  onRecover?: () => Promise<void>;
  recoverPending?: boolean;
};

export function MetricoolConnectionActions({
  canVerify,
  canDisconnect,
  canReconnect,
  canRecover = false,
  onRecover,
  recoverPending = false,
}: MetricoolConnectionActionsProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<
    "verify" | "disconnect" | "recover" | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleVerify() {
    setPendingAction("verify");
    setActionError(null);

    try {
      const response = await fetch("/api/integrations/metricool/verify", {
        method: "POST",
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !payload.ok) {
        setActionError("Could not verify the Metricool connection.");
        router.refresh();
        return;
      }

      router.refresh();
    } catch {
      setActionError("Could not verify the Metricool connection.");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDisconnect() {
    setPendingAction("disconnect");
    setActionError(null);

    try {
      const response = await fetch("/api/integrations/metricool/disconnect", {
        method: "POST",
      });
      const payload = (await response.json()) as { ok?: boolean };

      if (!response.ok || !payload.ok) {
        setActionError("Could not disconnect Metricool.");
        return;
      }

      router.refresh();
    } catch {
      setActionError("Could not disconnect Metricool.");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRecover() {
    if (!onRecover) {
      return;
    }

    setPendingAction("recover");
    setActionError(null);

    try {
      await onRecover();
    } catch {
      setActionError("Could not recover the saved Metricool connection.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="jv-connection-actions">
      {canRecover ? (
        <button
          type="button"
          className="jv-btn jv-btn--primary"
          onClick={handleRecover}
          disabled={pendingAction !== null || recoverPending}
        >
          {pendingAction === "recover" || recoverPending
            ? "Checking saved connection…"
            : "Check saved connection"}
        </button>
      ) : null}

      {canReconnect ? (
        <a
          href="/api/integrations/metricool/connect"
          className="jv-btn jv-btn--primary jv-btn--inline"
        >
          Reconnect Metricool
        </a>
      ) : null}

      {canVerify ? (
        <button
          type="button"
          className="jv-btn jv-btn--secondary"
          onClick={handleVerify}
          disabled={pendingAction !== null}
        >
          {pendingAction === "verify" ? "Verifying…" : "Verify connection"}
        </button>
      ) : null}

      {canDisconnect ? (
        <button
          type="button"
          className="jv-btn jv-btn--ghost"
          onClick={handleDisconnect}
          disabled={pendingAction !== null}
        >
          {pendingAction === "disconnect" ? "Disconnecting…" : "Disconnect"}
        </button>
      ) : null}

      {actionError ? (
        <p className="jv-connection-meta jv-connection-meta--error">{actionError}</p>
      ) : null}
    </div>
  );
}
