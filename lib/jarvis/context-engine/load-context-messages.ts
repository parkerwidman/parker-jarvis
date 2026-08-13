import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AgentMessageRecord } from "@/lib/jarvis/agents/types";
import { RECENT_MESSAGES_LIMIT } from "@/lib/jarvis/agents/agent-message-tools";
import { CONTEXT_MESSAGE_LOAD_LIMIT } from "@/lib/jarvis/context-engine/context-budget";
import { isMessageAfterWatermark } from "@/lib/jarvis/context-engine/conversation-state";

type AgentMessageRow = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

function mapMessageRow(row: AgentMessageRow): AgentMessageRecord {
  return {
    id: row.id,
    role: row.role as AgentMessageRecord["role"],
    content: row.content,
    createdAt: row.created_at,
  };
}

export async function loadThreadMessagesForContext(
  supabase: SupabaseClient,
  userId: string,
  threadId: string,
  watermark: { id: string; createdAt: string } | null,
): Promise<AgentMessageRecord[]> {
  const loadLimit = watermark
    ? CONTEXT_MESSAGE_LOAD_LIMIT
    : RECENT_MESSAGES_LIMIT;

  let query = supabase
    .from("agent_messages")
    .select("id, role, content, created_at")
    .eq("user_id", userId)
    .eq("thread_id", threadId)
    .eq("agent_key", "main")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(loadLimit);

  if (watermark) {
    query = query.or(
      `created_at.gt.${watermark.createdAt},and(created_at.eq.${watermark.createdAt},id.gt.${watermark.id})`,
    );
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  const rows = (data as AgentMessageRow[])
    .filter((row) => row.role === "user" || row.role === "assistant")
    .slice()
    .reverse();

  if (watermark) {
    return rows
      .filter((row) =>
        isMessageAfterWatermark(
          { id: row.id, createdAt: row.created_at },
          watermark,
        ),
      )
      .map(mapMessageRow);
  }

  return rows.map(mapMessageRow);
}

export async function validateSummaryWatermark(
  supabase: SupabaseClient,
  userId: string,
  threadId: string,
  watermark: { id: string; createdAt: string } | null,
): Promise<{ id: string; createdAt: string } | null> {
  if (!watermark) {
    return null;
  }

  const { data, error } = await supabase
    .from("agent_messages")
    .select("id, created_at")
    .eq("id", watermark.id)
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .eq("agent_key", "main")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id as string,
    createdAt: data.created_at as string,
  };
}
