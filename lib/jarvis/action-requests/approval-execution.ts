import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  bindSupabaseToExecutionContext,
  executeRegisteredAction,
  getRegisteredExecutor,
  isFinanceOrPlaidWriteAction,
} from "./action-executor-registry";
import { isRegisteredActionType } from "./action-type-constants";

export type ApprovalExecutionErrorCode =
  | "unauthorized"
  | "invalid_action_payload"
  | "approval_not_pending"
  | "approval_expired"
  | "approval_execution_failed"
  | "action_unavailable";

export type ApprovalExecutionResult =
  | { success: true }
  | { success: false; errorCode: ApprovalExecutionErrorCode };

function logApprovalLifecycle(
  actionType: string,
  state: string,
  success: boolean,
  errorCode?: ApprovalExecutionErrorCode,
): void {
  console.log("[Jarvis approval diagnostic]", {
    actionType,
    state,
    success,
    errorCode: errorCode ?? null,
  });
}

export async function executeApprovedActionRequest(
  supabase: SupabaseClient,
  userId: string,
  actionRequestId: string,
): Promise<ApprovalExecutionResult> {
  const { data: actionRequest, error: readError } = await supabase
    .from("action_requests")
    .select("id, user_id, action_type, status, payload, expires_at")
    .eq("id", actionRequestId)
    .eq("user_id", userId)
    .maybeSingle();

  if (readError || !actionRequest) {
    logApprovalLifecycle("unknown", "load", false, "unauthorized");
    return { success: false, errorCode: "unauthorized" };
  }

  const actionType = actionRequest.action_type;

  if (
    !isRegisteredActionType(actionType) ||
    isFinanceOrPlaidWriteAction(actionType)
  ) {
    logApprovalLifecycle(actionType, "dispatch", false, "action_unavailable");
    return { success: false, errorCode: "action_unavailable" };
  }

  if (actionRequest.status !== "pending") {
    logApprovalLifecycle(actionType, actionRequest.status, false, "approval_not_pending");
    return { success: false, errorCode: "approval_not_pending" };
  }

  if (
    typeof actionRequest.expires_at === "string" &&
    new Date(actionRequest.expires_at).getTime() <= Date.now()
  ) {
    await supabase
      .from("action_requests")
      .update({ status: "expired" })
      .eq("id", actionRequestId)
      .eq("user_id", userId)
      .eq("status", "pending");

    logApprovalLifecycle(actionType, "expired", false, "approval_expired");
    return { success: false, errorCode: "approval_expired" };
  }

  const executor = getRegisteredExecutor(actionType);

  if (!executor) {
    logApprovalLifecycle(actionType, "dispatch", false, "action_unavailable");
    return { success: false, errorCode: "action_unavailable" };
  }

  const { data: executingRequest, error: executingError } = await supabase
    .from("action_requests")
    .update({ status: "executing" })
    .eq("id", actionRequestId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (executingError || !executingRequest) {
    logApprovalLifecycle(actionType, "claim", false, "approval_not_pending");
    return { success: false, errorCode: "approval_not_pending" };
  }

  const context = bindSupabaseToExecutionContext(
    {
      actionRequestId,
      userId,
    },
    supabase,
  );

  const execution = await executeRegisteredAction(
    actionType,
    actionRequest.payload,
    context,
  );

  const now = new Date().toISOString();

  if (!execution.success) {
    await supabase
      .from("action_requests")
      .update({
        status: "failed",
        approved_at: now,
        executed_at: now,
        safe_error_message: execution.genericExecutionError,
      })
      .eq("id", actionRequestId)
      .eq("user_id", userId);

    logApprovalLifecycle(
      actionType,
      "failed",
      false,
      execution.errorCode === "invalid_action_payload"
        ? "invalid_action_payload"
        : "approval_execution_failed",
    );

    return {
      success: false,
      errorCode:
        execution.errorCode === "invalid_action_payload"
          ? "invalid_action_payload"
          : "approval_execution_failed",
    };
  }

  await supabase
    .from("action_requests")
    .update({
      status: "completed",
      approved_at: now,
      executed_at: now,
      result: execution.safeResult,
      safe_error_message: null,
    })
    .eq("id", actionRequestId)
    .eq("user_id", userId);

  logApprovalLifecycle(actionType, "completed", true);
  return { success: true };
}
