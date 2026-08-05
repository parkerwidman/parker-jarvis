export type MetricoolConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnect_required"
  | "error";

export type MetricoolConnectionRow = {
  id: string;
  user_id: string;
  status: MetricoolConnectionStatus;
  brand_id: string | null;
  brand_label: string | null;
  brand_timezone: string | null;
  connected_networks: Record<string, unknown> | unknown[];
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  token_expires_at: string | null;
  encrypted_client_information: string | null;
  last_verified_at: string | null;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
};

export type MetricoolSafeConnection = {
  status: MetricoolConnectionStatus;
  brandId: string | null;
  brandLabel: string | null;
  brandTimezone: string | null;
  connectedNetworks: string[];
  lastVerifiedAt: string | null;
  lastErrorCode: string | null;
};

export type MetricoolVerifiedBrand = {
  id: string;
  label: string;
  timezone: string;
  connectedNetworks: string[];
  networkProfiles: Record<string, unknown>;
};

export type MetricoolSafeErrorCode =
  | "not_configured"
  | "auth_failed"
  | "brand_mismatch"
  | "network_failure"
  | "decryption_failed"
  | "tool_not_allowed"
  | "reconnect_required"
  | "connection_failed"
  | "state_invalid";

export class MetricoolSafeError extends Error {
  readonly code: MetricoolSafeErrorCode;

  constructor(code: MetricoolSafeErrorCode, message?: string) {
    super(message ?? code);
    this.name = "MetricoolSafeError";
    this.code = code;
  }
}

export type MetricoolCommandCenterStatus =
  | "connected"
  | "setup_required"
  | "reconnect_required"
  | "error"
  | "connecting";
