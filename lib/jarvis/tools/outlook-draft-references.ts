import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OutlookDraftReference = {
  id: string;
  graph_message_id: string;
  sent_at: string | null;
};

export type OutlookDraftReferenceErrorCode =
  | "draft_reference_persistence_failed"
  | "unauthorized";

export type StoreOutlookDraftReferenceResult =
  | { success: true; draftKey: string }
  | { success: false; errorCode: OutlookDraftReferenceErrorCode };

export function logOutlookDraftStageDiagnostic(input: {
  stage:
    | "graph_draft_created"
    | "draft_reference_persistence"
    | "draft_audit_completion"
    | "draft_reconciliation";
  success: boolean;
  errorCode?: string;
  hasGraphMessageId?: boolean;
  existingReferenceFound?: boolean;
}): void {
  console.log("[Jarvis outlook draft]", {
    stage: input.stage,
    success: input.success,
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    ...(typeof input.hasGraphMessageId === "boolean"
      ? { hasGraphMessageId: input.hasGraphMessageId }
      : {}),
    ...(typeof input.existingReferenceFound === "boolean"
      ? { existingReferenceFound: input.existingReferenceFound }
      : {}),
  });
}

function classifyReferenceInsertError(error: {
  code?: string;
}): OutlookDraftReferenceErrorCode {
  if (error.code === "42501") {
    return "unauthorized";
  }

  return "draft_reference_persistence_failed";
}

export async function storeOutlookDraftReference(
  supabase: SupabaseClient,
  userId: string,
  graphMessageId: string,
  actionRequestId: string,
): Promise<StoreOutlookDraftReferenceResult> {
  const { data, error } = await supabase
    .from("outlook_draft_references")
    .insert({
      user_id: userId,
      graph_message_id: graphMessageId,
      action_request_id: actionRequestId,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    logOutlookDraftStageDiagnostic({
      stage: "draft_reference_persistence",
      success: false,
      errorCode: error
        ? classifyReferenceInsertError(error)
        : "draft_reference_persistence_failed",
      hasGraphMessageId: true,
    });
    return {
      success: false,
      errorCode: error
        ? classifyReferenceInsertError(error)
        : "draft_reference_persistence_failed",
    };
  }

  logOutlookDraftStageDiagnostic({
    stage: "draft_reference_persistence",
    success: true,
    hasGraphMessageId: true,
  });

  return { success: true, draftKey: data.id };
}

export async function findOutlookDraftReferenceByActionRequest(
  supabase: SupabaseClient,
  userId: string,
  actionRequestId: string,
): Promise<
  | { success: true; reference: OutlookDraftReference }
  | { success: false; errorCode: "invalid_action_payload" }
> {
  if (!UUID_REGEX.test(actionRequestId)) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const { data, error } = await supabase
    .from("outlook_draft_references")
    .select("id, graph_message_id, sent_at")
    .eq("action_request_id", actionRequestId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  if (data.sent_at) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  return {
    success: true,
    reference: data as OutlookDraftReference,
  };
}

export async function resolveOutlookDraftReference(
  supabase: SupabaseClient,
  userId: string,
  draftKey: string,
): Promise<
  | { success: true; reference: OutlookDraftReference }
  | { success: false; errorCode: string }
> {
  if (!UUID_REGEX.test(draftKey)) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  const { data, error } = await supabase
    .from("outlook_draft_references")
    .select("id, graph_message_id, sent_at")
    .eq("id", draftKey)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return { success: false, errorCode: "invalid_action_payload" };
  }

  if (data.sent_at) {
    return { success: false, errorCode: "duplicate_execution_blocked" };
  }

  return {
    success: true,
    reference: data as OutlookDraftReference,
  };
}

export async function markOutlookDraftReferenceSent(
  supabase: SupabaseClient,
  userId: string,
  draftKey: string,
): Promise<void> {
  await supabase
    .from("outlook_draft_references")
    .update({ sent_at: new Date().toISOString() })
    .eq("id", draftKey)
    .eq("user_id", userId)
    .is("sent_at", null);
}
