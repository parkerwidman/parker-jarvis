export type PlaidConnectionStatus =
  | "connected"
  | "reconnect_required"
  | "error"
  | "disconnected";

export type PlaidEnvironment = "sandbox" | "production";

export type PlaidConnectionRow = {
  id: string;
  user_id: string;
  item_id: string | null;
  institution_id: string | null;
  institution_name: string | null;
  encrypted_access_token: string | null;
  encryption_version: number;
  environment: PlaidEnvironment;
  status: PlaidConnectionStatus;
  products: string[];
  transactions_cursor: string | null;
  last_successful_sync_at: string | null;
  last_webhook_at: string | null;
  last_error_code: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PlaidSafeConnection = {
  connected: boolean;
  status: PlaidConnectionStatus;
  institutionName: string | null;
  environment: PlaidEnvironment;
  connectedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  reconnectRequired: boolean;
  lastErrorCode: string | null;
};

export type PlaidSafeErrorCode =
  | "not_configured"
  | "unauthorized"
  | "invalid_request"
  | "exchange_failed"
  | "disconnect_failed"
  | "item_not_found"
  | "plaid_error"
  | "decryption_failed"
  | "connection_failed";

export class PlaidSafeError extends Error {
  readonly code: PlaidSafeErrorCode;

  constructor(code: PlaidSafeErrorCode, message?: string) {
    super(message ?? code);
    this.name = "PlaidSafeError";
    this.code = code;
  }
}
