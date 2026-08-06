import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OutlookDraftReference = {
  id: string;
  graph_message_id: string;
  sent_at: string | null;
};

export async function storeOutlookDraftReference(
  supabase: SupabaseClient,
  userId: string,
  graphMessageId: string,
): Promise<{ success: true; draftKey: string } | { success: false }> {
  const { data, error } = await supabase
    .from("outlook_draft_references")
    .insert({
      user_id: userId,
      graph_message_id: graphMessageId,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return { success: false };
  }

  return { success: true, draftKey: data.id };
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
