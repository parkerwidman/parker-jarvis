import "server-only";

import { createAutomationClient } from "@/lib/supabase/automation";
import { escapePostgrestQuotedFilterValue } from "@/lib/jarvis/integrations/whoop/whoop-sync-claim-filter";
import { WHOOP_WEBHOOK_STALE_PENDING_MS } from "@/lib/jarvis/integrations/whoop/whoop-webhook-config";
import { WHOOP_WEBHOOK_ERROR_CODES } from "@/lib/jarvis/integrations/whoop/whoop-webhook-errors";
import type {
  WhoopWebhookEventRecord,
  WhoopWebhookEventStatus,
} from "@/lib/jarvis/integrations/whoop/whoop-webhook-types";

const WEBHOOK_EVENT_SELECT =
  "id, trace_id, user_id, event_type, resource_id, received_at, updated_at, processed_at, status, error_code";

function getAutomationClient() {
  return createAutomationClient();
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export type AcquireWhoopWebhookEventResult =
  | { action: "process"; event: WhoopWebhookEventRecord }
  | { action: "noop"; reason: "already_processed" | "in_progress" };

export async function loadWhoopWebhookEventByTraceId(
  traceId: string,
): Promise<WhoopWebhookEventRecord | null> {
  const supabase = getAutomationClient();

  const { data, error } = await supabase
    .from("whoop_webhook_events")
    .select(WEBHOOK_EVENT_SELECT)
    .eq("trace_id", traceId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as WhoopWebhookEventRecord;
}

async function reclaimFailedWhoopWebhookEvent(
  traceId: string,
): Promise<WhoopWebhookEventRecord | null> {
  const supabase = getAutomationClient();

  const { data, error } = await supabase
    .from("whoop_webhook_events")
    .update({
      status: "pending",
      error_code: null,
      processed_at: null,
    })
    .eq("trace_id", traceId)
    .eq("status", "failed")
    .select(WEBHOOK_EVENT_SELECT)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as WhoopWebhookEventRecord;
}

/**
 * Stale-pending reclaim uses `updated_at` as the lease discriminator.
 * The row update fires set_updated_at, so only one concurrent reclaimer can
 * match `updated_at < staleBefore`; losers observe a fresh lease timestamp.
 * `received_at` remains the original provider delivery receipt time.
 */
async function reclaimStalePendingWhoopWebhookEvent(
  traceId: string,
  staleBeforeIso: string,
): Promise<WhoopWebhookEventRecord | null> {
  const supabase = getAutomationClient();

  const { data, error } = await supabase
    .from("whoop_webhook_events")
    .update({
      error_code: null,
      processed_at: null,
    })
    .eq("trace_id", traceId)
    .eq("status", "pending")
    .lt("updated_at", staleBeforeIso)
    .select(WEBHOOK_EVENT_SELECT)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as WhoopWebhookEventRecord;
}

function isFreshPendingEvent(
  event: WhoopWebhookEventRecord,
  now = Date.now(),
): boolean {
  const leaseAt = Date.parse(event.updated_at);

  if (Number.isNaN(leaseAt)) {
    return false;
  }

  return now - leaseAt < WHOOP_WEBHOOK_STALE_PENDING_MS;
}

/**
 * Hard serverless termination can leave webhook rows stuck in pending.
 * Stale-pending reclaim is the recovery path until F5B reconciliation sweeps.
 */
export async function acquireWhoopWebhookEvent(params: {
  traceId: string;
  userId: string | null;
  eventType: string;
  resourceId: string;
  now?: Date;
}): Promise<AcquireWhoopWebhookEventResult> {
  const supabase = getAutomationClient();
  const now = params.now ?? new Date();

  const { data: inserted, error: insertError } = await supabase
    .from("whoop_webhook_events")
    .insert({
      trace_id: params.traceId,
      user_id: params.userId,
      event_type: params.eventType,
      resource_id: params.resourceId,
      status: "pending",
    })
    .select(WEBHOOK_EVENT_SELECT)
    .maybeSingle();

  if (!insertError && inserted) {
    return { action: "process", event: inserted as WhoopWebhookEventRecord };
  }

  if (!isUniqueViolation(insertError)) {
    throw new Error(WHOOP_WEBHOOK_ERROR_CODES.databaseFailed);
  }

  const existing = await loadWhoopWebhookEventByTraceId(params.traceId);

  if (!existing) {
    throw new Error(WHOOP_WEBHOOK_ERROR_CODES.databaseFailed);
  }

  if (existing.status === "processed") {
    return { action: "noop", reason: "already_processed" };
  }

  if (existing.status === "failed") {
    const reclaimed = await reclaimFailedWhoopWebhookEvent(params.traceId);

    if (reclaimed) {
      return { action: "process", event: reclaimed };
    }

    return { action: "noop", reason: "in_progress" };
  }

  if (isFreshPendingEvent(existing, now.getTime())) {
    return { action: "noop", reason: "in_progress" };
  }

  const staleBeforeIso = new Date(
    now.getTime() - WHOOP_WEBHOOK_STALE_PENDING_MS,
  ).toISOString();
  const reclaimed = await reclaimStalePendingWhoopWebhookEvent(
    params.traceId,
    staleBeforeIso,
  );

  if (reclaimed) {
    return { action: "process", event: reclaimed };
  }

  return { action: "noop", reason: "in_progress" };
}

export async function markWhoopWebhookEventProcessed(params: {
  eventId: string;
  processedAt: string;
}): Promise<void> {
  const supabase = getAutomationClient();

  const { error } = await supabase
    .from("whoop_webhook_events")
    .update({
      status: "processed",
      processed_at: params.processedAt,
      error_code: null,
    })
    .eq("id", params.eventId);

  if (error) {
    throw new Error(WHOOP_WEBHOOK_ERROR_CODES.databaseFailed);
  }
}

export async function markWhoopWebhookEventFailed(params: {
  eventId: string;
  errorCode: string;
}): Promise<void> {
  const supabase = getAutomationClient();

  const { error } = await supabase
    .from("whoop_webhook_events")
    .update({
      status: "failed",
      processed_at: null,
      error_code: params.errorCode,
    })
    .eq("id", params.eventId);

  if (error) {
    throw new Error(WHOOP_WEBHOOK_ERROR_CODES.databaseFailed);
  }
}

export async function markWhoopWebhookEventTerminalProcessed(params: {
  eventId: string;
  processedAt: string;
  errorCode: string | null;
}): Promise<void> {
  const supabase = getAutomationClient();

  const { error } = await supabase
    .from("whoop_webhook_events")
    .update({
      status: "processed",
      processed_at: params.processedAt,
      error_code: params.errorCode,
    })
    .eq("id", params.eventId);

  if (error) {
    throw new Error(WHOOP_WEBHOOK_ERROR_CODES.databaseFailed);
  }
}

export async function touchWhoopConnectionLastWebhookAt(params: {
  connectionId: string;
  receivedAt: string;
}): Promise<void> {
  const supabase = getAutomationClient();

  await supabase
    .from("whoop_connections")
    .update({ last_webhook_at: params.receivedAt })
    .eq("id", params.connectionId);
}

export async function softDeleteWhoopWorkout(params: {
  userId: string;
  whoopWorkoutId: string;
  deletedAt: string;
}): Promise<void> {
  const supabase = getAutomationClient();

  const { error } = await supabase
    .from("whoop_workouts")
    .update({ deleted_at: params.deletedAt })
    .eq("user_id", params.userId)
    .eq("whoop_workout_id", params.whoopWorkoutId);

  if (error) {
    throw new Error(WHOOP_WEBHOOK_ERROR_CODES.databaseFailed);
  }
}

export async function softDeleteWhoopSleep(params: {
  userId: string;
  whoopSleepId: string;
  deletedAt: string;
}): Promise<void> {
  const supabase = getAutomationClient();

  const { error } = await supabase
    .from("whoop_sleeps")
    .update({ deleted_at: params.deletedAt })
    .eq("user_id", params.userId)
    .eq("whoop_sleep_id", params.whoopSleepId);

  if (error) {
    throw new Error(WHOOP_WEBHOOK_ERROR_CODES.databaseFailed);
  }
}

export async function softDeleteWhoopRecovery(params: {
  userId: string;
  whoopSleepId: string;
  deletedAt: string;
}): Promise<void> {
  const supabase = getAutomationClient();

  const { error } = await supabase
    .from("whoop_recoveries")
    .update({ deleted_at: params.deletedAt })
    .eq("user_id", params.userId)
    .eq("whoop_sleep_id", params.whoopSleepId);

  if (error) {
    throw new Error(WHOOP_WEBHOOK_ERROR_CODES.databaseFailed);
  }
}

export function isWhoopWebhookEventStatus(
  value: string,
): value is WhoopWebhookEventStatus {
  return value === "pending" || value === "processed" || value === "failed";
}

function buildWhoopWebhookReplayOrFilter(staleBeforeIso: string): string {
  const quotedStaleBefore = escapePostgrestQuotedFilterValue(staleBeforeIso);

  return `status.eq.failed,and(status.eq.pending,updated_at.lt.${quotedStaleBefore})`;
}

export async function listWhoopWebhookEventsForReplay(params: {
  userId: string;
  limit: number;
  now?: Date;
}): Promise<WhoopWebhookEventRecord[]> {
  const supabase = getAutomationClient();
  const now = params.now ?? new Date();
  const staleBeforeIso = new Date(
    now.getTime() - WHOOP_WEBHOOK_STALE_PENDING_MS,
  ).toISOString();

  const { data, error } = await supabase
    .from("whoop_webhook_events")
    .select(WEBHOOK_EVENT_SELECT)
    .eq("user_id", params.userId)
    .or(buildWhoopWebhookReplayOrFilter(staleBeforeIso))
    .order("received_at", { ascending: true })
    .limit(params.limit);

  if (error || !data) {
    return [];
  }

  return data as WhoopWebhookEventRecord[];
}
