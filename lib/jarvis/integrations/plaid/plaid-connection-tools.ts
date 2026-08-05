import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptPlaidAccessToken,
  encryptPlaidAccessToken,
  getPlaidEncryptionVersion,
} from "./plaid-token-crypto";
import { getPlaidEnvironment } from "./plaid-config";
import type {
  PlaidConnectionRow,
  PlaidConnectionStatus,
  PlaidSafeConnectionSummary,
} from "./plaid-types";
import { PlaidSafeError } from "./plaid-types";

const MAX_SAFE_PLAID_CONNECTIONS = 50;

const SECRET_COLUMNS =
  "id, user_id, item_id, institution_id, institution_name, encrypted_access_token, encryption_version, environment, status, products, transactions_cursor, last_successful_sync_at, last_webhook_at, last_error_code, connected_at, disconnected_at, created_at, updated_at";

const SAFE_SUMMARY_COLUMNS =
  "id, status, institution_name, environment, connected_at, last_successful_sync_at, last_error_code";

const ACTIVE_CONNECTION_STATUSES: PlaidConnectionStatus[] = [
  "connected",
  "reconnect_required",
  "error",
];

type SafeSummaryRow = Pick<
  PlaidConnectionRow,
  | "id"
  | "status"
  | "institution_name"
  | "environment"
  | "connected_at"
  | "last_successful_sync_at"
  | "last_error_code"
>;

export function toSafePlaidConnectionSummary(
  row: SafeSummaryRow,
): PlaidSafeConnectionSummary {
  return {
    id: row.id,
    connected: row.status === "connected",
    status: row.status,
    institutionName: row.institution_name,
    environment: row.environment,
    connectedAt: row.connected_at,
    lastSuccessfulSyncAt: row.last_successful_sync_at,
    reconnectRequired: row.status === "reconnect_required",
    lastErrorCode: row.last_error_code,
  };
}

export async function loadPlaidConnectionRowById(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string,
): Promise<PlaidConnectionRow | null> {
  const { data, error } = await supabase
    .from("plaid_connections")
    .select(SECRET_COLUMNS)
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as PlaidConnectionRow | null) ?? null;
}

export async function loadPlaidConnectionRowByItemId(
  supabase: SupabaseClient,
  itemId: string,
): Promise<PlaidConnectionRow | null> {
  const { data, error } = await supabase
    .from("plaid_connections")
    .select(SECRET_COLUMNS)
    .eq("item_id", itemId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as PlaidConnectionRow | null) ?? null;
}

export async function loadSafePlaidConnections(
  supabase: SupabaseClient,
  userId: string,
): Promise<PlaidSafeConnectionSummary[]> {
  const { data, error } = await supabase
    .from("plaid_connections")
    .select(SAFE_SUMMARY_COLUMNS)
    .eq("user_id", userId)
    .in("status", ACTIVE_CONNECTION_STATUSES)
    .order("connected_at", { ascending: false, nullsFirst: false })
    .limit(MAX_SAFE_PLAID_CONNECTIONS);

  if (error) {
    throw error;
  }

  return ((data as SafeSummaryRow[] | null) ?? []).map(
    toSafePlaidConnectionSummary,
  );
}

export function hasUsablePlaidCredentials(
  row: PlaidConnectionRow | null,
): boolean {
  return Boolean(row?.encrypted_access_token && row.status === "connected");
}

export function decryptStoredAccessToken(
  row: PlaidConnectionRow,
): string | null {
  if (!row.encrypted_access_token) {
    return null;
  }

  return decryptPlaidAccessToken(row.encrypted_access_token);
}

export async function savePlaidConnectedConnection(
  supabase: SupabaseClient,
  userId: string,
  metadata: {
    itemId: string;
    institutionId: string | null;
    institutionName: string | null;
    accessToken: string;
  },
): Promise<PlaidSafeConnectionSummary> {
  const now = new Date().toISOString();
  const encryptedAccessToken = encryptPlaidAccessToken(metadata.accessToken);
  const existing = await loadPlaidConnectionRowByItemId(
    supabase,
    metadata.itemId,
  );

  if (existing && existing.user_id !== userId) {
    throw new PlaidSafeError("exchange_failed");
  }

  const connectionPayload = {
    item_id: metadata.itemId,
    institution_id: metadata.institutionId,
    institution_name: metadata.institutionName,
    encrypted_access_token: encryptedAccessToken,
    encryption_version: getPlaidEncryptionVersion(),
    environment: getPlaidEnvironment(),
    status: "connected" satisfies PlaidConnectionStatus,
    products: ["transactions"],
    transactions_cursor: null,
    last_successful_sync_at: null,
    last_webhook_at: null,
    last_error_code: null,
    connected_at: now,
    disconnected_at: null,
  };

  if (existing) {
    const { data, error } = await supabase
      .from("plaid_connections")
      .update(connectionPayload)
      .eq("id", existing.id)
      .eq("user_id", userId)
      .select(SAFE_SUMMARY_COLUMNS)
      .single();

    if (error) {
      throw error;
    }

    return toSafePlaidConnectionSummary(data as SafeSummaryRow);
  }

  const { data, error } = await supabase
    .from("plaid_connections")
    .insert({
      user_id: userId,
      ...connectionPayload,
    })
    .select(SAFE_SUMMARY_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return toSafePlaidConnectionSummary(data as SafeSummaryRow);
}

export async function disconnectPlaidConnectionById(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string,
): Promise<void> {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("plaid_connections")
    .update({
      item_id: null,
      institution_id: null,
      institution_name: null,
      encrypted_access_token: null,
      encryption_version: getPlaidEncryptionVersion(),
      environment: getPlaidEnvironment(),
      status: "disconnected" satisfies PlaidConnectionStatus,
      transactions_cursor: null,
      last_error_code: null,
      disconnected_at: now,
    })
    .eq("id", connectionId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

export async function markPlaidConnectionErrorByItemId(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  lastErrorCode: string,
  status: PlaidConnectionStatus = "error",
): Promise<void> {
  const { error } = await supabase
    .from("plaid_connections")
    .update({
      status,
      last_error_code: lastErrorCode,
    })
    .eq("user_id", userId)
    .eq("item_id", itemId);

  if (error) {
    throw error;
  }
}

export async function markPlaidConnectionErrorById(
  supabase: SupabaseClient,
  userId: string,
  connectionId: string,
  lastErrorCode: string,
  status: PlaidConnectionStatus = "error",
): Promise<void> {
  const { error } = await supabase
    .from("plaid_connections")
    .update({
      status,
      last_error_code: lastErrorCode,
    })
    .eq("id", connectionId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}
