import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { UI_MESSAGES_PAGE_SIZE } from "@/lib/jarvis/agents/agent-message-tools";
import type { ThreadToolResult } from "@/lib/jarvis/agents/agent-thread-tools";
import type { AgentThreadRecord, ThreadStatus } from "@/lib/jarvis/agents/types";
import {
  MAIN_THREAD_TYPE,
  isValidThreadId,
  isThreadStatus,
} from "@/lib/jarvis/agents/types";
import { deriveConversationTitle } from "@/lib/jarvis/conversations/conversation-title";
import type {
  MainConversationSummary,
  MessagePageCursor,
} from "@/lib/jarvis/conversations/types";

const THREAD_SELECT =
  "id, user_id, agent_key, thread_type, title, status, created_at, updated_at, last_message_at";

type AgentThreadRow = {
  id: string;
  user_id: string;
  agent_key: string;
  thread_type: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
};

function mapThreadRow(row: AgentThreadRow): AgentThreadRecord {
  return {
    id: row.id,
    userId: row.user_id,
    agentKey: row.agent_key as AgentThreadRecord["agentKey"],
    threadType: row.thread_type as AgentThreadRecord["threadType"],
    title: row.title,
    status: row.status as ThreadStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
  };
}

export async function loadAuthorizedMainThread(
  supabase: SupabaseClient,
  userId: string,
  threadId: string,
): Promise<AgentThreadRecord | null> {
  if (!isValidThreadId(threadId)) {
    return null;
  }

  const { data, error } = await supabase
    .from("agent_threads")
    .select(THREAD_SELECT)
    .eq("id", threadId)
    .eq("user_id", userId)
    .eq("agent_key", "main")
    .eq("thread_type", MAIN_THREAD_TYPE)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapThreadRow(data as AgentThreadRow);
}

export async function createMainConversation(
  supabase: SupabaseClient,
  userId: string,
  firstMessage: string,
): Promise<ThreadToolResult<AgentThreadRecord>> {
  const title = deriveConversationTitle(firstMessage);

  const { data, error } = await supabase
    .from("agent_threads")
    .insert({
      user_id: userId,
      agent_key: "main",
      thread_type: MAIN_THREAD_TYPE,
      title,
      status: "active",
    })
    .select(THREAD_SELECT)
    .single();

  if (error || !data) {
    return { success: false, error: "Could not create conversation." };
  }

  return { success: true, thread: mapThreadRow(data as AgentThreadRow) };
}

export async function resolveMainThreadForMessage(
  supabase: SupabaseClient,
  userId: string,
  threadId: string | null,
  firstMessage: string,
): Promise<ThreadToolResult<AgentThreadRecord>> {
  if (threadId) {
    const thread = await loadAuthorizedMainThread(supabase, userId, threadId);

    if (!thread) {
      return { success: false, error: "Conversation not found." };
    }

    if (thread.status !== "active") {
      return { success: false, error: "This conversation is archived." };
    }

    return { success: true, thread };
  }

  return createMainConversation(supabase, userId, firstMessage);
}

export async function listMainConversations(
  supabase: SupabaseClient,
  userId: string,
  options?: { status?: ThreadStatus; limit?: number },
): Promise<MainConversationSummary[]> {
  const limit = Math.min(Math.max(options?.limit ?? 30, 1), 50);

  let query = supabase
    .from("agent_threads")
    .select("id, title, last_message_at, updated_at")
    .eq("user_id", userId)
    .eq("agent_key", "main")
    .eq("thread_type", MAIN_THREAD_TYPE)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (options?.status && isThreadStatus(options.status)) {
    query = query.eq("status", options.status);
  } else {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  return data.map((row) => ({
    id: row.id as string,
    title: row.title as string,
    lastMessageAt: (row.last_message_at as string | null) ?? null,
    updatedAt: row.updated_at as string,
  }));
}

export async function loadMainThreadMessagesPage(
  supabase: SupabaseClient,
  userId: string,
  threadId: string,
  options?: {
    limit?: number;
    before?: MessagePageCursor | null;
  },
): Promise<{
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    createdAt: string;
  }>;
  hasOlder: boolean;
}> {
  const limit = Math.min(Math.max(options?.limit ?? UI_MESSAGES_PAGE_SIZE, 1), UI_MESSAGES_PAGE_SIZE);

  const thread = await loadAuthorizedMainThread(supabase, userId, threadId);

  if (!thread) {
    return { messages: [], hasOlder: false };
  }

  let query = supabase
    .from("agent_messages")
    .select("id, role, content, created_at")
    .eq("user_id", userId)
    .eq("thread_id", threadId)
    .eq("agent_key", "main")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (options?.before) {
    query = query.or(
      `created_at.lt.${options.before.createdAt},and(created_at.eq.${options.before.createdAt},id.lt.${options.before.id})`,
    );
  }

  const { data, error } = await query;

  if (error || !data) {
    return { messages: [], hasOlder: false };
  }

  const rows = data as Array<{
    id: string;
    role: string;
    content: string;
    created_at: string;
  }>;

  const hasOlder = rows.length > limit;
  const pageRows = hasOlder ? rows.slice(0, limit) : rows;

  return {
    hasOlder,
    messages: pageRows
      .slice()
      .reverse()
      .flatMap((row) => {
        if (row.role !== "user" && row.role !== "assistant") {
          return [];
        }

        const content = row.content.trim();

        if (content.length === 0) {
          return [];
        }

        return [
          {
            id: row.id,
            role: row.role,
            content,
            createdAt: row.created_at,
          },
        ];
      }),
  };
}
