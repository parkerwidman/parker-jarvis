import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AUTO_EXECUTE_RISK_LEVEL,
  EXECUTION_MODE_AUTO_EXECUTE,
} from "./action-type-constants";

export type AutoExecuteAuditRecord = {
  id: string;
  status: string;
  result: Record<string, unknown> | null;
  provider_outcome_certainty: string | null;
};

export type ClaimAutoExecuteResult =
  | { success: true; auditId: string; isReplay: false }
  | {
      success: true;
      auditId: string;
      isReplay: true;
      priorResult: Record<string, unknown>;
      priorStatus: string;
      providerOutcomeCertainty: string | null;
    }
  | { success: false; errorCode: string };

export async function claimAutoExecuteAction(
  supabase: SupabaseClient,
  input: {
    userId: string;
    actionType: string;
    idempotencyKey: string;
    title: string;
    summary: string;
    payload: Record<string, unknown>;
  },
): Promise<ClaimAutoExecuteResult> {
  const { data: existing, error: existingError } = await supabase
    .from("action_requests")
    .select("id, status, result, provider_outcome_certainty")
    .eq("user_id", input.userId)
    .eq("action_type", input.actionType)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  if (existingError) {
    return { success: false, errorCode: "action_unavailable" };
  }

  if (existing) {
    const record = existing as AutoExecuteAuditRecord;

    if (record.status === "completed" && record.result) {
      return {
        success: true,
        auditId: record.id,
        isReplay: true,
        priorResult: record.result,
        priorStatus: record.status,
        providerOutcomeCertainty: record.provider_outcome_certainty,
      };
    }

    if (record.status === "executing") {
      return { success: false, errorCode: "duplicate_execution_blocked" };
    }

    if (
      record.status === "failed" &&
      record.provider_outcome_certainty === "uncertain"
    ) {
      return { success: false, errorCode: "duplicate_execution_blocked" };
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from("action_requests")
    .insert({
      user_id: input.userId,
      action_type: input.actionType,
      status: "executing",
      risk_level: AUTO_EXECUTE_RISK_LEVEL,
      execution_mode: EXECUTION_MODE_AUTO_EXECUTE,
      title: input.title,
      summary: input.summary,
      payload: input.payload,
      idempotency_key: input.idempotencyKey,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return { success: false, errorCode: "duplicate_execution_blocked" };
    }

    return { success: false, errorCode: "action_unavailable" };
  }

  if (!inserted || typeof inserted.id !== "string") {
    return { success: false, errorCode: "action_unavailable" };
  }

  return {
    success: true,
    auditId: inserted.id,
    isReplay: false,
  };
}

export async function completeAutoExecuteAction(
  supabase: SupabaseClient,
  input: {
    auditId: string;
    userId: string;
    result: Record<string, unknown>;
    providerOutcomeCertainty?: "confirmed" | "uncertain" | "failed_before_send";
  },
): Promise<{ success: boolean }> {
  const { error } = await supabase
    .from("action_requests")
    .update({
      status: "completed",
      result: input.result,
      executed_at: new Date().toISOString(),
      provider_outcome_certainty: input.providerOutcomeCertainty ?? "confirmed",
    })
    .eq("id", input.auditId)
    .eq("user_id", input.userId)
    .eq("status", "executing");

  return { success: !error };
}

export async function failAutoExecuteAction(
  supabase: SupabaseClient,
  input: {
    auditId: string;
    userId: string;
    safeErrorMessage: string;
    providerOutcomeCertainty?: "confirmed" | "uncertain" | "failed_before_send";
  },
): Promise<void> {
  await supabase
    .from("action_requests")
    .update({
      status: "failed",
      safe_error_message: input.safeErrorMessage,
      executed_at: new Date().toISOString(),
      provider_outcome_certainty: input.providerOutcomeCertainty ?? "confirmed",
    })
    .eq("id", input.auditId)
    .eq("user_id", input.userId)
    .eq("status", "executing");
}

export function buildIdempotencyKey(
  toolCallId: string,
  actionType: string,
): string {
  return `${actionType}:${toolCallId}`;
}
