import type { SupabaseClient } from "@supabase/supabase-js";

import { ACTION_REQUEST_EXPIRATION_MS } from "./action-type-constants";

export function computeActionRequestExpiration(): string {
  return new Date(Date.now() + ACTION_REQUEST_EXPIRATION_MS).toISOString();
}

export function stableStringifyPayload(payload: Record<string, unknown>): string {
  const sortedKeys = Object.keys(payload).sort();
  const normalized: Record<string, unknown> = {};

  for (const key of sortedKeys) {
    normalized[key] = payload[key];
  }

  return JSON.stringify(normalized);
}

export async function findDuplicatePendingActionRequest(
  supabase: SupabaseClient,
  userId: string,
  actionType: string,
  normalizedPayload: Record<string, unknown>,
): Promise<{
  status: string;
  title: string;
  summary: string;
  expires_at: string;
} | null> {
  const payloadFingerprint = stableStringifyPayload(normalizedPayload);
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("action_requests")
    .select("status, title, summary, expires_at, payload")
    .eq("user_id", userId)
    .eq("action_type", actionType)
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !data) {
    return null;
  }

  for (const row of data) {
    const rowPayload =
      typeof row.payload === "object" && row.payload !== null
        ? (row.payload as Record<string, unknown>)
        : null;

    if (!rowPayload) {
      continue;
    }

    if (stableStringifyPayload(rowPayload) === payloadFingerprint) {
      return {
        status: row.status,
        title: row.title,
        summary: row.summary,
        expires_at: row.expires_at,
      };
    }
  }

  return null;
}
