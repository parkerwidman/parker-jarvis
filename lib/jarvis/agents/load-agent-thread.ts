import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  loadRecentThreadMessages,
  normalizeThreadHistoryRecord,
  UI_MESSAGES_PAGE_SIZE,
} from "./agent-message-tools";
import { loadAuthorizedMainThread } from "@/lib/jarvis/conversations/main-conversation-tools";
import { loadMainThreadMessagesPage } from "@/lib/jarvis/conversations/main-conversation-tools";
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

export async function loadMainAgentThreadWithMessages(
  supabase: SupabaseClient,
  userId: string,
  threadId: string,
): Promise<AgentThreadWithMessages | null> {
  if (!isValidThreadId(threadId)) {
    return null;
  }

  const thread = await loadAuthorizedMainThread(supabase, userId, threadId);

  if (!thread) {
    return null;
  }

  const { messages } = await loadMainThreadMessagesPage(
    supabase,
    userId,
    threadId,
    { limit: UI_MESSAGES_PAGE_SIZE },
  );

  return {
    ...thread,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
    })),
  };
}

export type ThreadMessagePreview = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
};

export function toChatInitialMessages(
  messages: AgentMessageRecord[],
): ThreadMessagePreview[] {
  return messages.flatMap((message) => {
    const normalized = normalizeThreadHistoryRecord(message);

    if (!normalized) {
      return [];
    }

    return [
      {
        ...normalized,
        id: message.id,
        createdAt: message.createdAt,
      },
    ];
  });
}
