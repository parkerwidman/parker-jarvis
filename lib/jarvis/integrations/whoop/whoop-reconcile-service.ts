import "server-only";

import { loadWhoopRuntimeConnectionByUserId } from "@/lib/jarvis/integrations/whoop/whoop-connection-tools";
import { WHOOP_SYNC_ERROR_CODES } from "@/lib/jarvis/integrations/whoop/whoop-sync-errors";
import { reconcileWhoopFitnessData } from "@/lib/jarvis/integrations/whoop/whoop-sync-service";
import { sweepWhoopWebhookEvents } from "@/lib/jarvis/integrations/whoop/whoop-webhook-replay-service";
import type { WhoopWebhookConnectedConnection } from "@/lib/jarvis/integrations/whoop/whoop-webhook-types";

export type WhoopReconcileStatus =
  | "synced"
  | "no_connected_whoop"
  | "sync_already_running"
  | "reconnect_required"
  | "sync_failed";

export type WhoopReconcileResult = {
  ok: true;
  status: WhoopReconcileStatus;
  webhook_events_retried: number;
};

function logWhoopReconcile(event: string, status?: string): void {
  console.log("[whoop-reconcile cron]", event, status ?? "");
}

async function loadConnectedWhoopWebhookConnection(
  userId: string,
): Promise<WhoopWebhookConnectedConnection | null> {
  const runtime = await loadWhoopRuntimeConnectionByUserId(userId);

  if (
    !runtime ||
    runtime.connection.status !== "connected" ||
    typeof runtime.connection.whoop_user_id !== "number"
  ) {
    return null;
  }

  return {
    connectionId: runtime.connection.id,
    userId,
    whoopUserId: runtime.connection.whoop_user_id,
  };
}

export async function runWhoopReconcile(userId: string): Promise<WhoopReconcileResult> {
  const connection = await loadConnectedWhoopWebhookConnection(userId);

  if (!connection) {
    logWhoopReconcile("no_connected_whoop");
    return {
      ok: true,
      status: "no_connected_whoop",
      webhook_events_retried: 0,
    };
  }

  const sweep = await sweepWhoopWebhookEvents({ connection });
  const webhookEventsRetried = sweep.processed;

  const syncResult = await reconcileWhoopFitnessData(userId);

  if (!syncResult.ok) {
    if (syncResult.error === WHOOP_SYNC_ERROR_CODES.inProgress) {
      logWhoopReconcile("sync_already_running");
      return {
        ok: true,
        status: "sync_already_running",
        webhook_events_retried: webhookEventsRetried,
      };
    }

    if (syncResult.error === WHOOP_SYNC_ERROR_CODES.reconnectRequired) {
      logWhoopReconcile("reconnect_required");
      return {
        ok: true,
        status: "reconnect_required",
        webhook_events_retried: webhookEventsRetried,
      };
    }

    logWhoopReconcile("sync_failed");
    return {
      ok: true,
      status: "sync_failed",
      webhook_events_retried: webhookEventsRetried,
    };
  }

  logWhoopReconcile("synced");
  return {
    ok: true,
    status: "synced",
    webhook_events_retried: webhookEventsRetried,
  };
}
