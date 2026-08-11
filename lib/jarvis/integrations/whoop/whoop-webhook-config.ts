import "server-only";

/** Stale pending webhook reclaim threshold after hard serverless termination. */
export const WHOOP_WEBHOOK_STALE_PENDING_MS = 15 * 60 * 1000;

export const WHOOP_WEBHOOK_TRACE_ID_MAX_LENGTH = 256;

export const WHOOP_WEBHOOK_RESOURCE_ID_MAX_LENGTH = 128;

/** Maximum webhook events retried per reconciliation run. */
export const WHOOP_WEBHOOK_SWEEP_BATCH_LIMIT = 50;
