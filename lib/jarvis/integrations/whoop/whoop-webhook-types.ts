import "server-only";

export const WHOOP_WEBHOOK_EVENT_TYPES = [
  "workout.updated",
  "workout.deleted",
  "sleep.updated",
  "sleep.deleted",
  "recovery.updated",
  "recovery.deleted",
] as const;

export type WhoopWebhookEventType =
  (typeof WHOOP_WEBHOOK_EVENT_TYPES)[number];

export type WhoopWebhookPayload = {
  user_id: number;
  id: string;
  type: WhoopWebhookEventType;
  trace_id: string;
};

export type WhoopWebhookConnectedConnection = {
  connectionId: string;
  userId: string;
  whoopUserId: number;
};

export type WhoopWebhookEventStatus = "pending" | "processed" | "failed";

export type WhoopWebhookEventRecord = {
  id: string;
  trace_id: string;
  user_id: string | null;
  event_type: string;
  resource_id: string;
  received_at: string;
  updated_at: string;
  processed_at: string | null;
  status: WhoopWebhookEventStatus;
  error_code: string | null;
};
