import "server-only";

import {
  WHOOP_WEBHOOK_RESOURCE_ID_MAX_LENGTH,
  WHOOP_WEBHOOK_TRACE_ID_MAX_LENGTH,
} from "@/lib/jarvis/integrations/whoop/whoop-webhook-config";
import { WHOOP_WEBHOOK_ERROR_CODES } from "@/lib/jarvis/integrations/whoop/whoop-webhook-errors";
import { parseWhoopWebhookResourceId } from "@/lib/jarvis/integrations/whoop/whoop-webhook-resource-id";
import {
  WHOOP_WEBHOOK_EVENT_TYPES,
  type WhoopWebhookEventType,
  type WhoopWebhookPayload,
} from "@/lib/jarvis/integrations/whoop/whoop-webhook-types";

function isNonEmptyBoundedString(
  value: unknown,
  maxLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function isWhoopWebhookUserId(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value > 0
  );
}

export function isWhoopWebhookEventType(value: string): value is WhoopWebhookEventType {
  return (WHOOP_WEBHOOK_EVENT_TYPES as readonly string[]).includes(value);
}

export function parseWhoopWebhookPayload(rawBody: string): WhoopWebhookPayload {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error(WHOOP_WEBHOOK_ERROR_CODES.invalidPayload);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(WHOOP_WEBHOOK_ERROR_CODES.invalidPayload);
  }

  const candidate = parsed as Record<string, unknown>;

  if (!isWhoopWebhookUserId(candidate.user_id)) {
    throw new Error(WHOOP_WEBHOOK_ERROR_CODES.invalidPayload);
  }

  if (!isNonEmptyBoundedString(candidate.id, WHOOP_WEBHOOK_RESOURCE_ID_MAX_LENGTH)) {
    throw new Error(WHOOP_WEBHOOK_ERROR_CODES.invalidPayload);
  }

  let resourceId: string;

  try {
    resourceId = parseWhoopWebhookResourceId(candidate.id);
  } catch {
    throw new Error(WHOOP_WEBHOOK_ERROR_CODES.invalidPayload);
  }

  if (
    !isNonEmptyBoundedString(candidate.trace_id, WHOOP_WEBHOOK_TRACE_ID_MAX_LENGTH)
  ) {
    throw new Error(WHOOP_WEBHOOK_ERROR_CODES.invalidPayload);
  }

  if (typeof candidate.type !== "string" || !isWhoopWebhookEventType(candidate.type)) {
    throw new Error(WHOOP_WEBHOOK_ERROR_CODES.invalidPayload);
  }

  return {
    user_id: candidate.user_id,
    id: resourceId,
    type: candidate.type,
    trace_id: candidate.trace_id,
  };
}
