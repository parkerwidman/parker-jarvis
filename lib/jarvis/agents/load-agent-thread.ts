import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadRecentThreadMessages,
  normalizeThreadHistoryForModel,
} from "./agent-message-tools";
import { loadAuthorizedMelusiThread } from "./agent-thread-tools";
import type { AgentMessageRecord, AgentThreadWithMessages } from "./types";
import { isValidThreadId } from "./types";

export async function loadAgentThreadWithMessages(
  supabase: SupabaseClient,
  userId: string,
  threadId: string,
): Promise<AgentThreadWithMessages | null> {
  if (!isValidThreadId(threadId)) {
    return null;
  }

  const thread = await loadAuthorizedMelusiThread(supabase, userId, threadId);

  if (!thread) {
    return null;
  }

  const messages = await loadRecentThreadMessages(
    supabase,
    userId,
    threadId,
  );

  return {
    ...thread,
    messages,
  };
}

export type ThreadMessagePreview = {
  role: "user" | "assistant";
  content: string;
};

export function toChatInitialMessages(
  messages: AgentMessageRecord[],
): ThreadMessagePreview[] {
  return normalizeThreadHistoryForModel(messages);
}
