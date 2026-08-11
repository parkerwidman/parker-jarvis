import "server-only";

export const WHOOP_OAUTH_ERROR_CODES = {
  notConfigured: "whoop_not_configured",
  unauthorized: "whoop_unauthorized",
  stateInvalid: "whoop_state_invalid",
  authorizationDenied: "whoop_authorization_denied",
  connectionFailed: "whoop_connection_failed",
  authorizationExpired: "whoop_authorization_expired",
  tokenExchangeFailed: "whoop_token_exchange_failed",
  tokenRefreshFailed: "whoop_token_refresh_failed",
  profileInvalid: "whoop_profile_invalid",
  persistenceFailed: "whoop_persistence_failed",
  disconnectFailed: "whoop_disconnect_failed",
  disconnectCleanupPending: "whoop_disconnect_cleanup_pending",
  disconnectRemoteFailed: "whoop_disconnect_remote_failed",
  needsConnection: "whoop_needs_connection",
  needsReconnect: "whoop_needs_reconnect",
} as const;

export type WhoopOAuthErrorCode =
  (typeof WHOOP_OAUTH_ERROR_CODES)[keyof typeof WHOOP_OAUTH_ERROR_CODES];

export class WhoopOAuthError extends Error {
  readonly code: WhoopOAuthErrorCode;

  constructor(code: WhoopOAuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = "WhoopOAuthError";
    this.code = code;
  }
}

export type WhoopSafeUserMessage =
  | "WHOOP connection failed"
  | "WHOOP authorization expired"
  | "WHOOP token refresh failed"
  | "WHOOP disconnect could not be completed"
  | "WHOOP is not connected";

export function toWhoopSafeUserMessage(
  code: WhoopOAuthErrorCode,
): WhoopSafeUserMessage {
  switch (code) {
    case WHOOP_OAUTH_ERROR_CODES.authorizationExpired:
    case WHOOP_OAUTH_ERROR_CODES.stateInvalid:
    case WHOOP_OAUTH_ERROR_CODES.authorizationDenied:
      return "WHOOP authorization expired";
    case WHOOP_OAUTH_ERROR_CODES.tokenRefreshFailed:
    case WHOOP_OAUTH_ERROR_CODES.needsReconnect:
      return "WHOOP token refresh failed";
    case WHOOP_OAUTH_ERROR_CODES.disconnectFailed:
    case WHOOP_OAUTH_ERROR_CODES.disconnectCleanupPending:
    case WHOOP_OAUTH_ERROR_CODES.disconnectRemoteFailed:
      return "WHOOP disconnect could not be completed";
    case WHOOP_OAUTH_ERROR_CODES.needsConnection:
      return "WHOOP is not connected";
    default:
      return "WHOOP connection failed";
  }
}

export function toWhoopSafeErrorParam(code: WhoopOAuthErrorCode): string {
  switch (code) {
    case WHOOP_OAUTH_ERROR_CODES.stateInvalid:
    case WHOOP_OAUTH_ERROR_CODES.authorizationDenied:
      return "authorization_expired";
    case WHOOP_OAUTH_ERROR_CODES.tokenExchangeFailed:
      return "token_exchange_failed";
    case WHOOP_OAUTH_ERROR_CODES.persistenceFailed:
      return "persistence_failed";
    case WHOOP_OAUTH_ERROR_CODES.profileInvalid:
      return "profile_invalid";
    case WHOOP_OAUTH_ERROR_CODES.notConfigured:
      return "not_configured";
    default:
      return "connection_failed";
  }
}
