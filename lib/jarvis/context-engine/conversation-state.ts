import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadAuthorizedMainThread } from "@/lib/jarvis/conversations/main-conversation-tools";
import type {
  ConversationActiveEntity,
  ConversationStateRecord,
  StructuredSummaryResult,
} from "@/lib/jarvis/context-engine/context-types";

const STATE_SELECT =
  "conversation_id, user_id, agent_key, rolling_summary, unresolved_questions, active_entities, decisions, summary_through_message_id, summary_through_created_at, summary_version, created_at, updated_at";

type ConversationStateRow = {
  conversation_id: string;
  user_id: string;
  agent_key: string;
  rolling_summary: string;
  unresolved_questions: unknown;
  active_entities: unknown;
  decisions: unknown;
  summary_through_message_id: string | null;
  summary_through_created_at: string | null;
  summary_version: number;
  created_at: string;
  updated_at: string;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item !== "string") {
      return [];
    }

    const trimmed = item.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  });
}

function asActiveEntities(value: unknown): ConversationActiveEntity[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }

    const record = item as { type?: unknown; name?: unknown };
    const type = typeof record.type === "string" ? record.type.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";

    if (!type || !name) {
      return [];
    }

    return [{ type, name }];
  });
}

function mapStateRow(row: ConversationStateRow): ConversationStateRecord {
  return {
    conversationId: row.conversation_id,
    userId: row.user_id,
    agentKey: "main",
    rollingSummary: row.rolling_summary,
    unresolvedQuestions: asStringArray(row.unresolved_questions),
    activeEntities: asActiveEntities(row.active_entities),
    decisions: asStringArray(row.decisions),
    summaryThroughMessageId: row.summary_through_message_id,
    summaryThroughCreatedAt: row.summary_through_created_at,
    summaryVersion: row.summary_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadConversationState(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
): Promise<ConversationStateRecord | null> {
  const thread = await loadAuthorizedMainThread(supabase, userId, conversationId);

  if (!thread) {
    return null;
  }

  const { data, error } = await supabase
    .from("jarvis_conversation_state")
    .select(STATE_SELECT)
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .eq("agent_key", "main")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapStateRow(data as ConversationStateRow);
}

export type UpsertConversationStateInput = {
  conversationId: string;
  userId: string;
  summary: StructuredSummaryResult;
  summaryThroughMessageId: string;
  summaryThroughCreatedAt: string;
  expectedSummaryVersion: number | null;
};

export type UpsertConversationStateResult =
  | { success: true; state: ConversationStateRecord }
  | { success: false; reason: "not_found" | "conflict" | "error" };

export async function upsertConversationState(
  supabase: SupabaseClient,
  input: UpsertConversationStateInput,
): Promise<UpsertConversationStateResult> {
  const thread = await loadAuthorizedMainThread(
    supabase,
    input.userId,
    input.conversationId,
  );

  if (!thread) {
    return { success: false, reason: "not_found" };
  }

  const { data: watermarkMessage, error: watermarkError } = await supabase
    .from("agent_messages")
    .select("id, created_at")
    .eq("id", input.summaryThroughMessageId)
    .eq("thread_id", input.conversationId)
    .eq("user_id", input.userId)
    .eq("agent_key", "main")
    .maybeSingle();

  if (watermarkError || !watermarkMessage) {
    return { success: false, reason: "error" };
  }

  const payload = {
    conversation_id: input.conversationId,
    user_id: input.userId,
    agent_key: "main",
    rolling_summary: input.summary.rollingSummary,
    unresolved_questions: input.summary.unresolvedQuestions,
    active_entities: input.summary.activeEntities,
    decisions: input.summary.decisions,
    summary_through_message_id: input.summaryThroughMessageId,
    summary_through_created_at: watermarkMessage.created_at as string,
  };

  if (input.expectedSummaryVersion === null) {
    const { data: existingRow } = await supabase
      .from("jarvis_conversation_state")
      .select("summary_version")
      .eq("conversation_id", input.conversationId)
      .eq("user_id", input.userId)
      .eq("agent_key", "main")
      .maybeSingle();

    if (existingRow) {
      return upsertConversationState(supabase, {
        ...input,
        expectedSummaryVersion: (existingRow as { summary_version: number })
          .summary_version,
      });
    }

    const { data, error } = await supabase
      .from("jarvis_conversation_state")
      .insert({
        ...payload,
        summary_version: 1,
      })
      .select(STATE_SELECT)
      .single();

    if (error || !data) {
      return { success: false, reason: "error" };
    }

    return { success: true, state: mapStateRow(data as ConversationStateRow) };
  }

  const nextVersion = input.expectedSummaryVersion + 1;

  const { data, error } = await supabase
    .from("jarvis_conversation_state")
    .update({
      ...payload,
      summary_version: nextVersion,
    })
    .eq("conversation_id", input.conversationId)
    .eq("user_id", input.userId)
    .eq("agent_key", "main")
    .eq("summary_version", input.expectedSummaryVersion)
    .select(STATE_SELECT)
    .maybeSingle();

  if (error) {
    return { success: false, reason: "error" };
  }

  if (!data) {
    return { success: false, reason: "conflict" };
  }

  return { success: true, state: mapStateRow(data as ConversationStateRow) };
}

export function isMessageAfterWatermark(
  message: { id: string; createdAt: string },
  watermark: { id: string; createdAt: string } | null,
): boolean {
  if (!watermark) {
    return true;
  }

  if (message.createdAt > watermark.createdAt) {
    return true;
  }

  if (message.createdAt < watermark.createdAt) {
    return false;
  }

  return message.id > watermark.id;
}

export function countMessagesAfterWatermark(
  messages: Array<{ id: string; createdAt: string }>,
  watermark: { id: string; createdAt: string } | null,
): number {
  return messages.filter((message) => isMessageAfterWatermark(message, watermark))
    .length;
}
