import "server-only";

export const WHOOP_WEBHOOK_ERROR_CODES = {
  invalidSignature: "whoop_webhook_invalid_signature",
  invalidPayload: "whoop_webhook_invalid_payload",
  unknownUser: "whoop_webhook_unknown_user",
  notConnected: "whoop_webhook_not_connected",
  unsupportedEvent: "whoop_webhook_unsupported_event",
  userMismatch: "whoop_webhook_user_mismatch",
  providerFailed: "whoop_webhook_provider_failed",
  reconnectRequired: "whoop_webhook_reconnect_required",
  databaseFailed: "whoop_webhook_database_failed",
  failed: "whoop_webhook_failed",
} as const;

export type WhoopWebhookErrorCode =
  (typeof WHOOP_WEBHOOK_ERROR_CODES)[keyof typeof WHOOP_WEBHOOK_ERROR_CODES];

export class WhoopWebhookError extends Error {
  readonly code: WhoopWebhookErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly terminal: boolean;

  constructor(params: {
    code: WhoopWebhookErrorCode;
    httpStatus: number;
    retryable?: boolean;
    terminal?: boolean;
  }) {
    super(params.code);
    this.name = "WhoopWebhookError";
    this.code = params.code;
    this.httpStatus = params.httpStatus;
    this.retryable = params.retryable ?? false;
    this.terminal = params.terminal ?? false;
  }
}
