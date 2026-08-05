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
  PlaidSafeConnection,
} from "./plaid-types";

const SECRET_COLUMNS =
  "id, user_id, item_id, institution_id, institution_name, encrypted_access_token, encryption_version, environment, status, products, transactions_cursor, last_successful_sync_at, last_webhook_at, last_error_code, connected_at, disconnected_at, created_at, updated_at";

const SAFE_COLUMNS =
  "status, institution_name, environment, connected_at, last_successful_sync_at, last_error_code";

export function toSafePlaidConnection(
  row: Pick<
    PlaidConnectionRow,
    | "status"
    | "institution_name"
    | "environment"
    | "connected_at"
    | "last_successful_sync_at"
    | "last_error_code"
  > | null,
): PlaidSafeConnection {
  if (!row || row.status === "disconnected") {
    return {
      connected: false,
      status: "disconnected",
      institutionName: null,
      environment: getPlaidEnvironment(),
      connectedAt: null,
      lastSuccessfulSyncAt: null,
      reconnectRequired: false,
      lastErrorCode: null,
    };
  }

  return {
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

export async function loadPlaidConnectionRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<PlaidConnectionRow | null> {
  const { data, error } = await supabase
    .from("plaid_connections")
    .select(SECRET_COLUMNS)
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

export async function loadSafePlaidConnection(
  supabase: SupabaseClient,
  userId: string,
): Promise<PlaidSafeConnection> {
  const { data, error } = await supabase
    .from("plaid_connections")
    .select(SAFE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return toSafePlaidConnection(
    data as Pick<
      PlaidConnectionRow,
      | "status"
      | "institution_name"
      | "environment"
      | "connected_at"
      | "last_successful_sync_at"
      | "last_error_code"
    > | null,
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
): Promise<PlaidSafeConnection> {
  const now = new Date().toISOString();
  const encryptedAccessToken = encryptPlaidAccessToken(metadata.accessToken);

  const { data, error } = await supabase
    .from("plaid_connections")
    .upsert(
      {
        user_id: userId,
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
      },
      { onConflict: "user_id" },
    )
    .select(SAFE_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return toSafePlaidConnection(
    data as Pick<
      PlaidConnectionRow,
      | "status"
      | "institution_name"
      | "environment"
      | "connected_at"
      | "last_successful_sync_at"
      | "last_error_code"
    >,
  );
}

export async function disconnectPlaidConnection(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();

  const { error } = await supabase.from("plaid_connections").upsert(
    {
      user_id: userId,
      item_id: null,
      institution_id: null,
      institution_name: null,
      encrypted_access_token: null,
      encryption_version: getPlaidEncryptionVersion(),
      environment: getPlaidEnvironment(),
      status: "disconnected" satisfies PlaidConnectionStatus,
      products: ["transactions"],
      transactions_cursor: null,
      last_successful_sync_at: null,
      last_webhook_at: null,
      last_error_code: null,
      connected_at: null,
      disconnected_at: now,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw error;
  }
}

export async function markPlaidConnectionError(
  supabase: SupabaseClient,
  userId: string,
  lastErrorCode: string,
  status: PlaidConnectionStatus = "error",
): Promise<void> {
  const { error } = await supabase
    .from("plaid_connections")
    .update({
      status,
      last_error_code: lastErrorCode,
    })
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}
