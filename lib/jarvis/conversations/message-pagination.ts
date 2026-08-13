import { UI_MESSAGES_PAGE_SIZE } from "@/lib/jarvis/agents/agent-message-tools";
import { isValidThreadId } from "@/lib/jarvis/agents/types";
import type { MessagePageCursor } from "@/lib/jarvis/conversations/types";

const ISO_TIMESTAMP_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

export function parseMessagePaginationLimit(
  raw: string | null,
  defaultLimit = UI_MESSAGES_PAGE_SIZE,
): number {
  if (!raw) {
    return defaultLimit;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed)) {
    return defaultLimit;
  }

  return Math.min(Math.max(parsed, 1), UI_MESSAGES_PAGE_SIZE);
}

export function parseMessagePageCursor(input: {
  beforeCreatedAt: string | null;
  beforeId: string | null;
}): MessagePageCursor | null | "invalid" {
  if (!input.beforeCreatedAt && !input.beforeId) {
    return null;
  }

  if (!input.beforeCreatedAt || !input.beforeId) {
    return "invalid";
  }

  if (!ISO_TIMESTAMP_REGEX.test(input.beforeCreatedAt)) {
    return "invalid";
  }

  if (!isValidThreadId(input.beforeId)) {
    return "invalid";
  }

  return {
    createdAt: input.beforeCreatedAt,
    id: input.beforeId,
  };
}
