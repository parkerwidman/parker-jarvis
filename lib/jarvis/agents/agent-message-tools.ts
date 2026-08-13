import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentKey, AgentMessageRecord, MessageRole } from "./types";

export const MAX_USER_MESSAGE_LENGTH = 4000;
export const MAX_ASSISTANT_MESSAGE_LENGTH = 16000;
export const MAX_MESSAGE_LENGTH = MAX_USER_MESSAGE_LENGTH;
export const RECENT_MESSAGES_LIMIT = 20;
export const UI_MESSAGES_PAGE_SIZE = 50;

const MAX_HISTORY_MESSAGES = RECENT_MESSAGES_LIMIT;

type AgentMessageRow = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

function isPersistedMessageRole(role: string): role is MessageRole {
  return role === "user" || role === "assistant";
}

function mapMessageRow(row: AgentMessageRow): AgentMessageRecord {
  return {
    id: row.id,
    role: row.role as MessageRole,
    content: row.content,
    createdAt: row.created_at,
  };
}

function maxLengthForRole(role: MessageRole): number {
  return role === "assistant"
    ? MAX_ASSISTANT_MESSAGE_LENGTH
    : MAX_USER_MESSAGE_LENGTH;
}

function sanitizeMessageContent(
  content: string,
  maxLength: number,
): string | null {
  if (typeof content !== "string") {
    return null;
  }

  const trimmed = content.trim();

  if (trimmed.length === 0 || trimmed.length > maxLength) {
    return null;
  }

  return trimmed;
}

export function normalizeThreadHistoryRecord(
  message: AgentMessageRecord,
): ConversationMessage | null {
  if (!isPersistedMessageRole(message.role)) {
    return null;
  }

  const sanitized = sanitizeMessageContent(
    message.content,
    maxLengthForRole(message.role),
  );

  if (!sanitized) {
    return null;
  }

  return {
    role: message.role,
    content: sanitized,
  };
}

export function normalizeThreadHistoryForModel(
  history: AgentMessageRecord[],
): ConversationMessage[] {
  return history
    .map(normalizeThreadHistoryRecord)
    .filter((message): message is ConversationMessage => message !== null);
}

export type PersistMessageResult =
  | { success: true; message: AgentMessageRecord }
  | { success: false; error: string };

export async function persistAgentMessage(
  supabase: SupabaseClient,
  userId: string,
  threadId: string,
  agentKey: AgentKey,
  role: MessageRole,
  content: string,
): Promise<PersistMessageResult> {
  const sanitized = sanitizeMessageContent(content, maxLengthForRole(role));

  if (!sanitized) {
    return {
      success: false,
      error:
        role === "user"
          ? "Invalid message content."
          : "Could not save response.",
    };
  }

  const { data, error } = await supabase
    .from("agent_messages")
    .insert({
      user_id: userId,
      thread_id: threadId,
      agent_key: agentKey,
      role,
      content: sanitized,
    })
    .select("id, role, content, created_at")
    .single();

  if (error || !data) {
    return { success: false, error: "Could not save message." };
  }

  const now = new Date().toISOString();

  await supabase
    .from("agent_threads")
    .update({ last_message_at: now })
    .eq("id", threadId)
    .eq("user_id", userId);

  return { success: true, message: mapMessageRow(data as AgentMessageRow) };
}

export async function loadRecentThreadMessages(
  supabase: SupabaseClient,
  userId: string,
  threadId: string,
  limit = MAX_HISTORY_MESSAGES,
  agentKey?: AgentKey,
): Promise<AgentMessageRecord[]> {
  const safeLimit = Math.min(Math.max(limit, 1), MAX_HISTORY_MESSAGES);

  let query = supabase
    .from("agent_messages")
    .select("id, role, content, created_at")
    .eq("user_id", userId)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(safeLimit);

  if (agentKey) {
    query = query.eq("agent_key", agentKey);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  const rows = (data as AgentMessageRow[]).slice().reverse();

  return rows.map(mapMessageRow);
}

export function buildConversationInput(
  history: AgentMessageRecord[],
  newUserMessage: string,
): ConversationMessage[] {
  const trimmedNew = sanitizeMessageContent(
    newUserMessage,
    MAX_USER_MESSAGE_LENGTH,
  );

  const items = normalizeThreadHistoryForModel(history);

  if (!trimmedNew) {
    return items;
  }

  const lastItem = items.at(-1);

  if (lastItem?.role === "user" && lastItem.content === trimmedNew) {
    return items;
  }

  items.push({ role: "user", content: trimmedNew });

  return items;
}

export { MAX_HISTORY_MESSAGES };
