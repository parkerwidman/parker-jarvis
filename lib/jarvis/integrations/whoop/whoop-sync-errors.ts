import "server-only";

export const WHOOP_SYNC_ERROR_CODES = {
  notConnected: "whoop_sync_not_connected",
  inProgress: "whoop_sync_in_progress",
  providerFailed: "whoop_sync_provider_failed",
  invalidPayload: "whoop_sync_invalid_payload",
  userMismatch: "whoop_sync_user_mismatch",
  databaseFailed: "whoop_sync_database_failed",
  reconnectRequired: "whoop_sync_reconnect_required",
  paginationLimitExceeded: "whoop_sync_pagination_limit",
} as const;

export type WhoopSyncErrorCode =
  (typeof WHOOP_SYNC_ERROR_CODES)[keyof typeof WHOOP_SYNC_ERROR_CODES];

export class WhoopSyncError extends Error {
  readonly code: WhoopSyncErrorCode;
  readonly providerHttpStatus?: number;

  constructor(code: WhoopSyncErrorCode, message?: string, providerHttpStatus?: number) {
    super(message ?? code);
    this.name = "WhoopSyncError";
    this.code = code;
    this.providerHttpStatus = providerHttpStatus;
  }
}

export function toWhoopSyncSafeUserMessage(code: WhoopSyncErrorCode): string {
  switch (code) {
    case WHOOP_SYNC_ERROR_CODES.notConnected:
      return "Connect WHOOP before syncing fitness data.";
    case WHOOP_SYNC_ERROR_CODES.inProgress:
      return "A WHOOP sync is already in progress. Try again shortly.";
    case WHOOP_SYNC_ERROR_CODES.reconnectRequired:
      return "WHOOP connection needs to be reconnected before syncing.";
    case WHOOP_SYNC_ERROR_CODES.userMismatch:
      return "WHOOP sync detected an account mismatch and stopped.";
    case WHOOP_SYNC_ERROR_CODES.invalidPayload:
      return "WHOOP returned unexpected fitness data.";
    case WHOOP_SYNC_ERROR_CODES.paginationLimitExceeded:
      return "WHOOP sync returned more data than this release can safely process.";
    case WHOOP_SYNC_ERROR_CODES.databaseFailed:
      return "WHOOP fitness data could not be saved.";
    default:
      return "WHOOP sync could not be completed.";
  }
}
