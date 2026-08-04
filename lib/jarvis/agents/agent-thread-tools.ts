import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getDefaultThreadTitle,
  validateAgentKey,
} from "./agent-registry";
import type {
  AgentKey,
  AgentThreadRecord,
  MelusiThreadType,
  ThreadStatus,
} from "./types";
import { isMelusiThreadType, isThreadStatus, isValidThreadId } from "./types";

const MAX_THREAD_TITLE_LENGTH = 200;

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
    agentKey: row.agent_key as AgentKey,
    threadType: row.thread_type as MelusiThreadType,
    title: row.title,
    status: row.status as ThreadStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
  };
}

function sanitizeThreadTitle(title: string): string {
  const trimmed = title.trim();

  if (trimmed.length === 0) {
    return "";
  }

  return trimmed.slice(0, MAX_THREAD_TITLE_LENGTH);
}

export type ThreadToolResult<T> =
  | { success: true; thread: T }
  | { success: false; error: string };

export async function findMelusiCommandThread(
  supabase: SupabaseClient,
  userId: string,
): Promise<AgentThreadRecord | null> {
  const { data, error } = await supabase
    .from("agent_threads")
    .select(
      "id, user_id, agent_key, thread_type, title, status, created_at, updated_at, last_message_at",
    )
    .eq("user_id", userId)
    .eq("agent_key", "melusi")
    .eq("thread_type", "command")
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapThreadRow(data as AgentThreadRow);
}

export async function findOrCreateMelusiCommandThread(
  supabase: SupabaseClient,
  userId: string,
): Promise<ThreadToolResult<AgentThreadRecord>> {
  const existing = await findMelusiCommandThread(supabase, userId);

  if (existing) {
    return { success: true, thread: existing };
  }

  const { data, error } = await supabase
    .from("agent_threads")
    .insert({
      user_id: userId,
      agent_key: "melusi",
      thread_type: "command",
      title: getDefaultThreadTitle("command"),
      status: "active",
    })
    .select(
      "id, user_id, agent_key, thread_type, title, status, created_at, updated_at, last_message_at",
    )
    .single();

  if (error || !data) {
    const retry = await findMelusiCommandThread(supabase, userId);

    if (retry) {
      return { success: true, thread: retry };
    }

    return { success: false, error: "Could not create command thread." };
  }

  return { success: true, thread: mapThreadRow(data as AgentThreadRow) };
}

export async function createMelusiThread(
  supabase: SupabaseClient,
  userId: string,
  threadType: MelusiThreadType,
  title: string,
): Promise<ThreadToolResult<AgentThreadRecord>> {
  if (!isMelusiThreadType(threadType) || threadType === "command") {
    return { success: false, error: "Invalid thread type." };
  }

  const sanitizedTitle = sanitizeThreadTitle(title);

  if (sanitizedTitle.length === 0) {
    return { success: false, error: "Thread title is required." };
  }

  const { data, error } = await supabase
    .from("agent_threads")
    .insert({
      user_id: userId,
      agent_key: "melusi",
      thread_type: threadType,
      title: sanitizedTitle,
      status: "active",
    })
    .select(
      "id, user_id, agent_key, thread_type, title, status, created_at, updated_at, last_message_at",
    )
    .single();

  if (error || !data) {
    return { success: false, error: "Could not create thread." };
  }

  return { success: true, thread: mapThreadRow(data as AgentThreadRow) };
}

export async function listMelusiThreads(
  supabase: SupabaseClient,
  userId: string,
  options?: { status?: ThreadStatus; limit?: number },
): Promise<AgentThreadRecord[]> {
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 50);

  let query = supabase
    .from("agent_threads")
    .select(
      "id, user_id, agent_key, thread_type, title, status, created_at, updated_at, last_message_at",
    )
    .eq("user_id", userId)
    .eq("agent_key", "melusi")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (options?.status && isThreadStatus(options.status)) {
    query = query.eq("status", options.status);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  return (data as AgentThreadRow[]).map(mapThreadRow);
}

export async function loadAuthorizedMelusiThread(
  supabase: SupabaseClient,
  userId: string,
  threadId: string,
): Promise<AgentThreadRecord | null> {
  if (!isValidThreadId(threadId)) {
    return null;
  }

  const { data, error } = await supabase
    .from("agent_threads")
    .select(
      "id, user_id, agent_key, thread_type, title, status, created_at, updated_at, last_message_at",
    )
    .eq("id", threadId)
    .eq("user_id", userId)
    .eq("agent_key", "melusi")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapThreadRow(data as AgentThreadRow);
}

export async function archiveMelusiThread(
  supabase: SupabaseClient,
  userId: string,
  threadId: string,
): Promise<ThreadToolResult<AgentThreadRecord>> {
  if (!isValidThreadId(threadId)) {
    return { success: false, error: "Invalid thread." };
  }

  const thread = await loadAuthorizedMelusiThread(supabase, userId, threadId);

  if (!thread) {
    return { success: false, error: "Thread not found." };
  }

  if (thread.threadType === "command") {
    return { success: false, error: "The command thread cannot be archived." };
  }

  const { data, error } = await supabase
    .from("agent_threads")
    .update({ status: "archived" })
    .eq("id", threadId)
    .eq("user_id", userId)
    .eq("agent_key", "melusi")
    .select(
      "id, user_id, agent_key, thread_type, title, status, created_at, updated_at, last_message_at",
    )
    .single();

  if (error || !data) {
    return { success: false, error: "Could not archive thread." };
  }

  return { success: true, thread: mapThreadRow(data as AgentThreadRow) };
}

export async function resolveMelusiThreadForMessage(
  supabase: SupabaseClient,
  userId: string,
  threadId: string | null,
): Promise<ThreadToolResult<AgentThreadRecord>> {
  if (threadId) {
    const thread = await loadAuthorizedMelusiThread(supabase, userId, threadId);

    if (!thread) {
      return { success: false, error: "Thread not found." };
    }

    if (thread.status !== "active") {
      return { success: false, error: "This thread is archived." };
    }

    return { success: true, thread };
  }

  return findOrCreateMelusiCommandThread(supabase, userId);
}

export function validateThreadAgentConsistency(
  thread: AgentThreadRecord,
  agentKey: AgentKey,
): boolean {
  if (!validateAgentKey(agentKey)) {
    return false;
  }

  return thread.agentKey === agentKey;
}
