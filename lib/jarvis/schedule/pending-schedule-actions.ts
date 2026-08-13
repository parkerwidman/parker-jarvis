import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  PENDING_SCHEDULE_ACTION_TTL_MINUTES,
  PENDING_SCHEDULE_ACTION_VERSION,
  type PendingScheduleActionPayload,
  type PendingScheduleActionRecord,
  type PendingScheduleCancelResult,
  type PendingScheduleConfirmResult,
  type PendingScheduleProposalResult,
} from "@/lib/jarvis/schedule/pending-schedule-action-types";
import { executeScheduleMutationPlan } from "@/lib/jarvis/schedule/schedule-mutation-plan";
import type {
  PendingScheduleActionStatus,
  PendingScheduleActionType,
} from "@/lib/jarvis/schedule/schedule-types";

const PENDING_ACTION_SELECT =
  "id, user_id, action_type, status, summary, payload, agent_key, thread_id, expires_at, confirmed_at, executed_at, result, safe_error_message, created_at, updated_at";

type PendingActionRow = {
  id: string;
  user_id: string;
  action_type: PendingScheduleActionType;
  status: PendingScheduleActionStatus;
  summary: string;
  payload: PendingScheduleActionPayload;
  agent_key: "main" | "melusi";
  thread_id: string | null;
  expires_at: string;
  confirmed_at: string | null;
  executed_at: string | null;
  result: Record<string, unknown> | null;
  safe_error_message: string | null;
  created_at: string;
  updated_at: string;
};

function mapPendingActionRow(row: PendingActionRow): PendingScheduleActionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    actionType: row.action_type,
    status: row.status,
    summary: row.summary,
    payload: row.payload,
    agentKey: row.agent_key,
    threadId: row.thread_id,
    expiresAt: row.expires_at,
    confirmedAt: row.confirmed_at,
    executedAt: row.executed_at,
    result: row.result,
    safeErrorMessage: row.safe_error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function computeExpiresAt(from = new Date()): string {
  return new Date(
    from.getTime() + PENDING_SCHEDULE_ACTION_TTL_MINUTES * 60 * 1000,
  ).toISOString();
}

function isExpired(expiresAt: string, now = new Date()): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}

async function markPendingActionStatus(
  supabase: SupabaseClient,
  userId: string,
  pendingActionId: string,
  status: PendingScheduleActionStatus,
  fields: Record<string, unknown> = {},
): Promise<void> {
  await supabase
    .from("jarvis_pending_schedule_actions")
    .update({
      status,
      ...fields,
    })
    .eq("id", pendingActionId)
    .eq("user_id", userId);
}

async function loadPendingActionById(
  supabase: SupabaseClient,
  userId: string,
  pendingActionId: string,
): Promise<PendingScheduleActionRecord | null> {
  const { data, error } = await supabase
    .from("jarvis_pending_schedule_actions")
    .select(PENDING_ACTION_SELECT)
    .eq("id", pendingActionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapPendingActionRow(data as PendingActionRow);
}

export async function expireStalePendingScheduleActions(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const nowIso = new Date().toISOString();

  await supabase
    .from("jarvis_pending_schedule_actions")
    .update({ status: "expired" })
    .eq("user_id", userId)
    .eq("agent_key", "main")
    .eq("status", "pending")
    .lte("expires_at", nowIso);
}

export async function cancelActiveMainPendingScheduleActions(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  await supabase
    .from("jarvis_pending_schedule_actions")
    .update({ status: "cancelled" })
    .eq("user_id", userId)
    .eq("agent_key", "main")
    .eq("status", "pending");
}

export async function loadActiveMainPendingScheduleAction(
  supabase: SupabaseClient,
  userId: string,
): Promise<PendingScheduleActionRecord | null> {
  await expireStalePendingScheduleActions(supabase, userId);

  const { data, error } = await supabase
    .from("jarvis_pending_schedule_actions")
    .select(PENDING_ACTION_SELECT)
    .eq("user_id", userId)
    .eq("agent_key", "main")
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapPendingActionRow(data as PendingActionRow);
}

export async function createPendingScheduleAction(
  supabase: SupabaseClient,
  userId: string,
  input: {
    actionType: PendingScheduleActionType;
    summary: string;
    payload: PendingScheduleActionPayload;
  },
): Promise<PendingScheduleProposalResult> {
  if (input.payload.version !== PENDING_SCHEDULE_ACTION_VERSION) {
    return { success: false, error: "invalid_payload" };
  }

  await cancelActiveMainPendingScheduleActions(supabase, userId);

  const expiresAt = computeExpiresAt();
  const { data, error } = await supabase
    .from("jarvis_pending_schedule_actions")
    .insert({
      user_id: userId,
      action_type: input.actionType,
      status: "pending",
      summary: input.summary.trim(),
      payload: input.payload,
      agent_key: "main",
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { success: false, error: "proposal_failed" };
  }

  return {
    success: true,
    pendingActionId: data.id as string,
    actionType: input.actionType,
    summary: input.summary.trim(),
    expiresAt,
    requiresConfirmation: true,
  };
}

export async function cancelPendingScheduleAction(
  supabase: SupabaseClient,
  userId: string,
  pendingActionId: string,
): Promise<PendingScheduleCancelResult> {
  const action = await loadPendingActionById(supabase, userId, pendingActionId);

  if (!action) {
    return { success: false, error: "pending_action_not_found" };
  }

  if (action.status === "cancelled") {
    return { success: true, pendingActionId, status: "cancelled" };
  }

  if (action.status === "executed") {
    return { success: false, error: "already_executed" };
  }

  if (action.status === "expired" || isExpired(action.expiresAt)) {
    await markPendingActionStatus(supabase, userId, pendingActionId, "expired");
    return { success: false, error: "expired" };
  }

  if (action.status !== "pending") {
    return { success: false, error: "not_cancellable" };
  }

  await markPendingActionStatus(supabase, userId, pendingActionId, "cancelled");

  return { success: true, pendingActionId, status: "cancelled" };
}

async function executePendingActionLocally(
  supabase: SupabaseClient,
  userId: string,
  action: PendingScheduleActionRecord,
): Promise<PendingScheduleConfirmResult> {
  const claimNow = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("jarvis_pending_schedule_actions")
    .update({
      status: "confirmed",
      confirmed_at: claimNow,
    })
    .eq("id", action.id)
    .eq("user_id", userId)
    .eq("status", "pending")
    .gt("expires_at", claimNow)
    .select(PENDING_ACTION_SELECT)
    .maybeSingle();

  if (claimError) {
    return { success: false, error: "confirmation_failed", errorCode: "claim_failed" };
  }

  if (!claimed) {
    const latest = await loadPendingActionById(supabase, userId, action.id);

    if (latest?.status === "executed") {
      return {
        success: true,
        pendingActionId: action.id,
        status: "executed",
        summary: latest.summary,
        alreadyExecuted: true,
      };
    }

    if (!latest || latest.status === "expired" || isExpired(latest.expiresAt)) {
      if (latest) {
        await markPendingActionStatus(supabase, userId, action.id, "expired");
      }
      return { success: false, error: "expired", errorCode: "expired" };
    }

    return { success: false, error: "not_pending", errorCode: "not_pending" };
  }

  const execution = await executeScheduleMutationPlan(
    supabase,
    action.payload.execution,
  );

  if (!execution.ok) {
    await markPendingActionStatus(supabase, userId, action.id, "failed", {
      safe_error_message: execution.error,
      result: {
        success: false,
        summary: action.summary,
      },
    });

    return {
      success: false,
      error: execution.error,
      errorCode: "execution_failed",
    };
  }

  const executedAt = new Date().toISOString();
  await markPendingActionStatus(supabase, userId, action.id, "executed", {
    executed_at: executedAt,
    result: {
      success: true,
      summary: action.summary,
    },
    safe_error_message: null,
  });

  return {
    success: true,
    pendingActionId: action.id,
    status: "executed",
    summary: action.summary,
    alreadyExecuted: false,
  };
}

export async function confirmPendingScheduleAction(
  supabase: SupabaseClient,
  userId: string,
  pendingActionId: string,
): Promise<PendingScheduleConfirmResult> {
  const action = await loadPendingActionById(supabase, userId, pendingActionId);

  if (!action) {
    return { success: false, error: "pending_action_not_found" };
  }

  if (action.status === "executed") {
    return {
      success: true,
      pendingActionId,
      status: "executed",
      summary: action.summary,
      alreadyExecuted: true,
    };
  }

  if (action.status === "cancelled") {
    return { success: false, error: "cancelled", errorCode: "cancelled" };
  }

  if (action.status === "failed") {
    return {
      success: false,
      error: action.safeErrorMessage ?? "execution_failed",
      errorCode: "failed",
    };
  }

  if (action.status === "expired" || isExpired(action.expiresAt)) {
    await markPendingActionStatus(supabase, userId, pendingActionId, "expired");
    return { success: false, error: "expired", errorCode: "expired" };
  }

  if (action.status !== "pending") {
    return { success: false, error: "not_pending", errorCode: "not_pending" };
  }

  const { data, error } = await supabase.rpc(
    "jarvis_schedule_execute_pending_action",
    {
      p_pending_action_id: pendingActionId,
    },
  );

  if (error) {
    if (error.message.includes("Could not find the function")) {
      return executePendingActionLocally(supabase, userId, action);
    }

    return { success: false, error: "confirmation_failed", errorCode: "rpc_error" };
  }

  const result = (data ?? {}) as {
    success?: boolean;
    code?: string;
    summary?: string;
    already_executed?: boolean;
    safe_error_message?: string;
  };

  if (result.success) {
    return {
      success: true,
      pendingActionId,
      status: "executed",
      summary: result.summary ?? action.summary,
      alreadyExecuted: result.already_executed === true,
    };
  }

  switch (result.code) {
    case "already_executed":
      return {
        success: true,
        pendingActionId,
        status: "executed",
        summary: result.summary ?? action.summary,
        alreadyExecuted: true,
      };
    case "expired":
      return { success: false, error: "expired", errorCode: "expired" };
    case "cancelled":
      return { success: false, error: "cancelled", errorCode: "cancelled" };
    case "failed":
      return {
        success: false,
        error: result.safe_error_message ?? "execution_failed",
        errorCode: "failed",
      };
    case "pending_action_not_found":
      return { success: false, error: "pending_action_not_found" };
    default:
      return {
        success: false,
        error: result.safe_error_message ?? "execution_failed",
        errorCode: result.code ?? "execution_failed",
      };
  }
}
