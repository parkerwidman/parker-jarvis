import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  METRICOOL_OAUTH_COOKIE_MAX_AGE_SECONDS,
} from "./metricool-config";
import {
  decryptMetricoolSecret,
  encryptMetricoolSecret,
} from "./metricool-token-crypto";
import {
  loadClientInformationForRedirectUri,
  mergeClientInformationForRedirectUri,
  summarizeStoredClientInformation,
} from "./metricool-client-information-store";
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

export function hasUsableMetricoolCredentials(
  row: MetricoolConnectionRow | null,
): boolean {
  return Boolean(row?.encrypted_access_token);
}

export function hasTrustedMetricoolMetadata(
  row: MetricoolConnectionRow | null,
): boolean {
  if (!row?.brand_id || !row.brand_label || !row.brand_timezone) {
    return false;
  }

  return normalizeConnectedNetworks(row.connected_networks).length > 0;
}

/** A connection that should remain authoritative during a failed reconnect attempt. */
export function hadWorkingMetricoolConnection(
  row: MetricoolConnectionRow | null,
): boolean {
  if (!hasUsableMetricoolCredentials(row)) {
    return false;
  }

  return (
    row?.status === "connected" ||
    row?.status === "reconnect_required" ||
    hasTrustedMetricoolMetadata(row)
  );
}

export function isStaleConnectingState(
  row: MetricoolConnectionRow,
  now = Date.now(),
): boolean {
  if (row.status !== "connecting") {
    return false;
  }

  const updatedAt = new Date(row.updated_at).getTime();
  return (
    now - updatedAt > METRICOOL_OAUTH_COOKIE_MAX_AGE_SECONDS * 1000
  );
}

export function isRecoverableConnectingState(
  row: MetricoolConnectionRow | null,
): boolean {
  return row?.status === "connecting";
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

/** Mark connecting only for a first-time OAuth attempt with no saved credentials. */
export async function beginInitialMetricoolOAuth(
  supabase: SupabaseClient,
  userId: string,
  existing: MetricoolConnectionRow | null,
): Promise<void> {
  if (hasUsableMetricoolCredentials(existing)) {
    return;
  }

  await upsertMetricoolConnecting(supabase, userId);
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
  const existing = await loadMetricoolConnectionRow(supabase, userId);

  if (
    hasUsableMetricoolCredentials(existing) ||
    existing?.status === "connected" ||
    existing?.status === "reconnect_required"
  ) {
    const { error } = await supabase
      .from("metricool_connections")
      .update({
        encrypted_client_information: encryptedClientInformation,
      })
      .eq("user_id", userId);

    if (error) {
      throw error;
    }

    return;
  }

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

export function decryptClientInformationPayload(
  encrypted: string,
): unknown {
  return JSON.parse(decryptMetricoolSecret(encrypted));
}

export function loadStoredClientInformationForRedirectUri(
  encrypted: string | null | undefined,
  redirectUri: string,
): ReturnType<typeof loadClientInformationForRedirectUri> {
  if (!encrypted) {
    return undefined;
  }

  const payload = decryptClientInformationPayload(encrypted);
  return loadClientInformationForRedirectUri(payload, redirectUri);
}

export function summarizeEncryptedClientInformation(
  encrypted: string | null | undefined,
): ReturnType<typeof summarizeStoredClientInformation> {
  if (!encrypted) {
    return summarizeStoredClientInformation(null);
  }

  try {
    const payload = decryptClientInformationPayload(encrypted);
    return summarizeStoredClientInformation(payload);
  } catch {
    return { storageVersion: "missing", redirectUris: [] };
  }
}

export function serializeClientInformationForRedirectUri(
  existingEncrypted: string | null | undefined,
  redirectUri: string,
  clientInformation: unknown,
): string {
  let existingPayload: unknown = null;

  if (existingEncrypted) {
    try {
      existingPayload = decryptClientInformationPayload(existingEncrypted);
    } catch {
      existingPayload = null;
    }
  }

  const envelope = mergeClientInformationForRedirectUri(
    existingPayload,
    redirectUri,
    clientInformation as import("@modelcontextprotocol/sdk/shared/auth.js").OAuthClientInformationMixed,
  );

  return encryptMetricoolSecret(JSON.stringify(envelope));
}

export async function markMetricoolConnectionStatus(
  supabase: SupabaseClient,
  userId: string,
  status: MetricoolConnectionStatus,
  lastErrorCode: string | null = null,
): Promise<void> {
  const { error } = await supabase
    .from("metricool_connections")
    .update({
      status,
      last_error_code: lastErrorCode,
    })
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

/** Preserve a working connection when an OAuth attempt fails or is abandoned. */
export async function markMetricoolOAuthFailure(
  supabase: SupabaseClient,
  userId: string,
  rowBeforeAttempt: MetricoolConnectionRow | null,
  lastErrorCode: string,
): Promise<void> {
  if (hadWorkingMetricoolConnection(rowBeforeAttempt)) {
    return;
  }

  if (!rowBeforeAttempt) {
    return;
  }

  const { error } = await supabase
    .from("metricool_connections")
    .update({
      status: "error" satisfies MetricoolConnectionStatus,
      last_error_code: lastErrorCode,
    })
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

export async function clearInterruptedMetricoolConnection(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("metricool_connections")
    .update({
      status: "disconnected" satisfies MetricoolConnectionStatus,
      last_error_code: null,
    })
    .eq("user_id", userId);

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
