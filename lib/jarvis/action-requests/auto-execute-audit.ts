import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AUTO_EXECUTE_RISK_LEVEL,
  EXECUTION_MODE_AUTO_EXECUTE,
  ACTION_TYPE_CREATE_OUTLOOK_DRAFT,
} from "./action-type-constants";

export type AutoExecuteAuditRecord = {
  id: string;
  status: string;
  result: Record<string, unknown> | null;
  provider_outcome_certainty: string | null;
};

export type AutoExecuteAuditErrorCode =
  | "duplicate_execution_blocked"
  | "audit_schema_failure"
  | "action_unavailable"
  | "unauthorized"
  | "audit_creation_failed";

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
  | { success: false; errorCode: AutoExecuteAuditErrorCode };

function logAutoExecuteAuditDiagnostic(input: {
  stage: "claim_lookup" | "claim_insert";
  actionType: string;
  success: boolean;
  errorCode?: AutoExecuteAuditErrorCode;
}): void {
  console.log("[Jarvis auto-execute audit]", {
    stage: input.stage,
    actionType: input.actionType,
    success: input.success,
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
  });
}

function classifyDatabaseError(error: {
  code?: string;
  message?: string;
}): AutoExecuteAuditErrorCode {
  if (error.code === "42501") {
    return "unauthorized";
  }

  if (error.code === "23514") {
    return "audit_schema_failure";
  }

  if (error.code === "23505") {
    return "duplicate_execution_blocked";
  }

  return "audit_creation_failed";
}

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
    const errorCode =
      existingError.code === "42501" ? "unauthorized" : "action_unavailable";
    logAutoExecuteAuditDiagnostic({
      stage: "claim_lookup",
      actionType: input.actionType,
      success: false,
      errorCode,
    });
    return { success: false, errorCode };
  }

  if (existing) {
    const record = existing as AutoExecuteAuditRecord;

    if (record.status === "completed" && record.result) {
      logAutoExecuteAuditDiagnostic({
        stage: "claim_lookup",
        actionType: input.actionType,
        success: true,
      });
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
      logAutoExecuteAuditDiagnostic({
        stage: "claim_lookup",
        actionType: input.actionType,
        success: false,
        errorCode: "duplicate_execution_blocked",
      });
      return { success: false, errorCode: "duplicate_execution_blocked" };
    }

    if (
      record.status === "failed" &&
      record.provider_outcome_certainty === "uncertain"
    ) {
      if (input.actionType === ACTION_TYPE_CREATE_OUTLOOK_DRAFT) {
        logAutoExecuteAuditDiagnostic({
          stage: "claim_lookup",
          actionType: input.actionType,
          success: true,
        });
        return {
          success: true,
          auditId: record.id,
          isReplay: true,
          priorResult: record.result ?? {},
          priorStatus: record.status,
          providerOutcomeCertainty: record.provider_outcome_certainty,
        };
      }

      logAutoExecuteAuditDiagnostic({
        stage: "claim_lookup",
        actionType: input.actionType,
        success: false,
        errorCode: "duplicate_execution_blocked",
      });
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
    const errorCode = classifyDatabaseError(insertError);
    logAutoExecuteAuditDiagnostic({
      stage: "claim_insert",
      actionType: input.actionType,
      success: false,
      errorCode,
    });
    return { success: false, errorCode };
  }

  if (!inserted || typeof inserted.id !== "string") {
    logAutoExecuteAuditDiagnostic({
      stage: "claim_insert",
      actionType: input.actionType,
      success: false,
      errorCode: "audit_creation_failed",
    });
    return { success: false, errorCode: "audit_creation_failed" };
  }

  logAutoExecuteAuditDiagnostic({
    stage: "claim_insert",
    actionType: input.actionType,
    success: true,
  });

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

export function mapAutoExecuteClaimFailure(
  errorCode: AutoExecuteAuditErrorCode,
  actionFailureCode: string,
): { success: false; errorCode: string } {
  if (errorCode === "duplicate_execution_blocked") {
    return { success: false, errorCode: "duplicate_execution_blocked" };
  }

  return { success: false, errorCode: actionFailureCode };
}
