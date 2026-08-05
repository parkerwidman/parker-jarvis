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
  last_sync_accounts_created: number | null;
  last_sync_accounts_updated: number | null;
  last_sync_transactions_added: number | null;
  last_sync_transactions_modified: number | null;
  last_sync_transactions_removed: number | null;
  last_sync_unclassified_count: number | null;
  linked_accounts_count: number | null;
  sync_in_progress_at: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PlaidSafeConnectionSummary = {
  id: string;
  connected: boolean;
  status: PlaidConnectionStatus;
  institutionName: string | null;
  environment: PlaidEnvironment;
  connectedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  reconnectRequired: boolean;
  lastErrorCode: string | null;
  syncInProgress: boolean;
  linkedAccountsCount: number | null;
  lastSyncAccountsCreated: number | null;
  lastSyncAccountsUpdated: number | null;
  lastSyncTransactionsAdded: number | null;
  lastSyncTransactionsModified: number | null;
  lastSyncTransactionsRemoved: number | null;
  lastSyncUnclassifiedCount: number | null;
};

export type PlaidSafeErrorCode =
  | "not_configured"
  | "unauthorized"
  | "invalid_request"
  | "exchange_failed"
  | "disconnect_failed"
  | "sync_failed"
  | "sync_in_progress"
  | "item_not_found"
  | "plaid_error"
  | "decryption_failed"
  | "connection_failed"
  | "reconnect_required"
  | "product_not_ready"
  | "rate_limited"
  | "unsupported_currency"
  | "sync_mutation_during_pagination"
  | "update_failed"
  | "token_not_repairable";

export type PlaidSyncStatus = "success" | "reconnect_required" | "error";

export type PlaidConnectionSyncResult = {
  connectionId: string;
  status: PlaidSyncStatus;
  accountsCreated: number;
  accountsUpdated: number;
  transactionsAdded: number;
  transactionsModified: number;
  transactionsRemoved: number;
  unclassifiedCount: number;
  errorCode?: PlaidSafeErrorCode;
};

export class PlaidSafeError extends Error {
  readonly code: PlaidSafeErrorCode;
  readonly plaidErrorCode?: string;

  constructor(code: PlaidSafeErrorCode, message?: string, plaidErrorCode?: string) {
    super(message ?? code);
    this.name = "PlaidSafeError";
    this.code = code;
    this.plaidErrorCode = plaidErrorCode;
  }
}
