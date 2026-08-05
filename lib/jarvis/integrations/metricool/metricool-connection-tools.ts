import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptMetricoolSecret,
  encryptMetricoolSecret,
} from "./metricool-token-crypto";
import type {
  MetricoolConnectionRow,
  MetricoolConnectionStatus,
  MetricoolSafeConnection,
  MetricoolCommandCenterStatus,
} from "./metricool-types";

const CONNECTION_COLUMNS =
  "id, user_id, status, brand_id, brand_label, brand_timezone, connected_networks, encrypted_access_token, encrypted_refresh_token, token_expires_at, encrypted_client_information, last_verified_at, last_error_code, created_at, updated_at";

function normalizeConnectedNetworks(
  value: MetricoolConnectionRow["connected_networks"],
): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>);
  }

  return [];
}

export function toSafeMetricoolConnection(
  row: MetricoolConnectionRow | null,
): MetricoolSafeConnection {
  if (!row) {
    return {
      status: "disconnected",
      brandId: null,
      brandLabel: null,
      brandTimezone: null,
      connectedNetworks: [],
      lastVerifiedAt: null,
      lastErrorCode: null,
    };
  }

  return {
    status: row.status,
    brandId: row.brand_id,
    brandLabel: row.brand_label,
    brandTimezone: row.brand_timezone,
    connectedNetworks: normalizeConnectedNetworks(row.connected_networks),
    lastVerifiedAt: row.last_verified_at,
    lastErrorCode: row.last_error_code,
  };
}

export function toCommandCenterStatus(
  connection: MetricoolSafeConnection,
): MetricoolCommandCenterStatus {
  switch (connection.status) {
    case "connected":
      return "connected";
    case "connecting":
      return "connecting";
    case "reconnect_required":
      return "reconnect_required";
    case "error":
      return "error";
    case "disconnected":
    default:
      return "setup_required";
  }
}

export async function loadMetricoolConnectionRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<MetricoolConnectionRow | null> {
  const { data, error } = await supabase
    .from("metricool_connections")
    .select(CONNECTION_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as MetricoolConnectionRow | null) ?? null;
}

export async function loadSafeMetricoolConnection(
  supabase: SupabaseClient,
  userId: string,
): Promise<MetricoolSafeConnection> {
  const row = await loadMetricoolConnectionRow(supabase, userId);
  return toSafeMetricoolConnection(row);
}

export async function upsertMetricoolConnecting(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase.from("metricool_connections").upsert(
    {
      user_id: userId,
      status: "connecting" satisfies MetricoolConnectionStatus,
      last_error_code: null,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw error;
  }
}

export async function saveMetricoolConnectedMetadata(
  supabase: SupabaseClient,
  userId: string,
  metadata: {
    brandId: string;
    brandLabel: string;
    brandTimezone: string;
    connectedNetworks: Record<string, unknown>;
    encryptedAccessToken: string;
    encryptedRefreshToken: string | null;
    tokenExpiresAt: string | null;
    encryptedClientInformation: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("metricool_connections").upsert(
    {
      user_id: userId,
      status: "connected" satisfies MetricoolConnectionStatus,
      brand_id: metadata.brandId,
      brand_label: metadata.brandLabel,
      brand_timezone: metadata.brandTimezone,
      connected_networks: metadata.connectedNetworks,
      encrypted_access_token: metadata.encryptedAccessToken,
      encrypted_refresh_token: metadata.encryptedRefreshToken,
      token_expires_at: metadata.tokenExpiresAt,
      encrypted_client_information: metadata.encryptedClientInformation,
      last_verified_at: new Date().toISOString(),
      last_error_code: null,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw error;
  }
}

export async function saveMetricoolClientInformation(
  supabase: SupabaseClient,
  userId: string,
  encryptedClientInformation: string,
): Promise<void> {
  const { error } = await supabase.from("metricool_connections").upsert(
    {
      user_id: userId,
      status: "connecting" satisfies MetricoolConnectionStatus,
      encrypted_client_information: encryptedClientInformation,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw error;
  }
}

export async function markMetricoolConnectionStatus(
  supabase: SupabaseClient,
  userId: string,
  status: MetricoolConnectionStatus,
  lastErrorCode: string | null = null,
): Promise<void> {
  const { error } = await supabase.from("metricool_connections").upsert(
    {
      user_id: userId,
      status,
      last_error_code: lastErrorCode,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw error;
  }
}

export async function updateMetricoolVerifiedMetadata(
  supabase: SupabaseClient,
  userId: string,
  metadata: {
    brandId: string;
    brandLabel: string;
    brandTimezone: string;
    connectedNetworks: Record<string, unknown>;
    status?: MetricoolConnectionStatus;
  },
): Promise<void> {
  const { error } = await supabase
    .from("metricool_connections")
    .update({
      status: metadata.status ?? "connected",
      brand_id: metadata.brandId,
      brand_label: metadata.brandLabel,
      brand_timezone: metadata.brandTimezone,
      connected_networks: metadata.connectedNetworks,
      last_verified_at: new Date().toISOString(),
      last_error_code: null,
    })
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

export async function disconnectMetricoolConnection(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase.from("metricool_connections").upsert(
    {
      user_id: userId,
      status: "disconnected" satisfies MetricoolConnectionStatus,
      brand_id: null,
      brand_label: null,
      brand_timezone: null,
      connected_networks: {},
      encrypted_access_token: null,
      encrypted_refresh_token: null,
      token_expires_at: null,
      encrypted_client_information: null,
      last_verified_at: null,
      last_error_code: null,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw error;
  }
}

export function loadEncryptedClientInformation(
  row: MetricoolConnectionRow | null,
): string | null {
  return row?.encrypted_client_information ?? null;
}

export function serializeClientInformation(
  clientInformation: unknown,
): string {
  return encryptMetricoolSecret(JSON.stringify(clientInformation));
}

export function deserializeClientInformation<T>(encrypted: string): T {
  return JSON.parse(decryptMetricoolSecret(encrypted)) as T;
}

export function serializeOAuthTokens(tokens: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}): {
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  tokenExpiresAt: string | null;
} {
  const encryptedAccessToken = encryptMetricoolSecret(tokens.access_token);
  const encryptedRefreshToken =
    typeof tokens.refresh_token === "string"
      ? encryptMetricoolSecret(tokens.refresh_token)
      : null;
  const tokenExpiresAt =
    typeof tokens.expires_in === "number"
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

  return {
    encryptedAccessToken,
    encryptedRefreshToken,
    tokenExpiresAt,
  };
}

export function deserializeOAuthTokens(row: MetricoolConnectionRow): {
  accessToken: string;
  refreshToken: string | undefined;
  expiresAt: string | null;
} | null {
  if (!row.encrypted_access_token) {
    return null;
  }

  const accessToken = decryptMetricoolSecret(row.encrypted_access_token);
  const refreshToken = row.encrypted_refresh_token
    ? decryptMetricoolSecret(row.encrypted_refresh_token)
    : undefined;

  return {
    accessToken,
    refreshToken,
    expiresAt: row.token_expires_at,
  };
}
