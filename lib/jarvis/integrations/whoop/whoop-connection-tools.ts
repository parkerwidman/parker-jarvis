import "server-only";

import {
  getWhoopEncryptionVersion,
  encryptWhoopAccessToken,
  encryptWhoopRefreshToken,
} from "@/lib/jarvis/integrations/whoop/whoop-token-crypto";
import type {
  WhoopConnectionRow,
  WhoopRuntimeConnection,
} from "@/lib/jarvis/integrations/whoop/whoop-types";
import {
  formatWhoopGrantedScopesDisplay,
  toWhoopSafeLastErrorMessage,
  WHOOP_CONNECTION_INTERNAL_ERROR_CODES,
} from "@/lib/jarvis/integrations/whoop/whoop-connection-errors";
import { createAutomationClient } from "@/lib/supabase/automation";

type RpcResult = {
  success?: boolean;
  code?: string;
  connection_id?: string;
  claimed?: boolean;
  token_version?: number;
};

function getAutomationClient() {
  return createAutomationClient();
}

export async function loadWhoopRuntimeConnectionByUserId(
  userId: string,
): Promise<WhoopRuntimeConnection | null> {
  const supabase = getAutomationClient();

  const { data: connection, error: connectionError } = await supabase
    .from("whoop_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (connectionError || !connection) {
    return null;
  }

  const { data: credentials, error: credentialsError } = await supabase
    .from("whoop_connection_credentials")
    .select("*")
    .eq("connection_id", connection.id)
    .maybeSingle();

  if (credentialsError || !credentials) {
    return null;
  }

  return {
    connection: connection as WhoopConnectionRow,
    credentials: {
      ...(credentials as WhoopRuntimeConnection["credentials"]),
      token_version: Number(credentials.token_version ?? 0),
    },
  };
}

export async function persistWhoopOAuthConnection(params: {
  userId: string;
  whoopUserId: number;
  grantedScopes: string[];
  accessTokenExpiresAt: string;
  accessToken: string;
  refreshToken: string;
}): Promise<{ connectionId: string }> {
  const supabase = getAutomationClient();

  const { data, error } = await supabase.rpc("whoop_upsert_oauth_connection", {
    p_user_id: params.userId,
    p_whoop_user_id: params.whoopUserId,
    p_granted_scopes: params.grantedScopes,
    p_access_token_expires_at: params.accessTokenExpiresAt,
    p_encrypted_access_token: encryptWhoopAccessToken(params.accessToken),
    p_encrypted_refresh_token: encryptWhoopRefreshToken(params.refreshToken),
    p_encryption_version: getWhoopEncryptionVersion(),
  });

  if (error) {
    throw new Error("whoop_persistence_failed");
  }

  const result = data as RpcResult;

  if (!result?.success || typeof result.connection_id !== "string") {
    throw new Error(result?.code ?? "whoop_persistence_failed");
  }

  return { connectionId: result.connection_id };
}

export async function claimWhoopRefresh(params: {
  connectionId: string;
  claimId: string;
  staleAfterSeconds: number;
}): Promise<{ claimed: boolean; tokenVersion: number }> {
  const supabase = getAutomationClient();

  const { data, error } = await supabase.rpc("whoop_claim_refresh", {
    p_connection_id: params.connectionId,
    p_claim_id: params.claimId,
    p_stale_after_seconds: params.staleAfterSeconds,
  });

  if (error) {
    throw new Error("whoop_refresh_claim_failed");
  }

  const result = data as RpcResult;

  if (!result?.success || typeof result.token_version !== "number") {
    throw new Error(result?.code ?? "whoop_refresh_claim_failed");
  }

  return {
    claimed: result.claimed === true,
    tokenVersion: result.token_version,
  };
}

export async function completeWhoopRefresh(params: {
  connectionId: string;
  claimId: string;
  priorTokenVersion: number;
  accessTokenExpiresAt: string;
  accessToken: string;
  refreshToken: string;
}): Promise<{ tokenVersion: number }> {
  const supabase = getAutomationClient();

  const { data, error } = await supabase.rpc("whoop_complete_refresh", {
    p_connection_id: params.connectionId,
    p_claim_id: params.claimId,
    p_encrypted_access_token: encryptWhoopAccessToken(params.accessToken),
    p_encrypted_refresh_token: encryptWhoopRefreshToken(params.refreshToken),
    p_access_token_expires_at: params.accessTokenExpiresAt,
    p_prior_token_version: params.priorTokenVersion,
  });

  if (error) {
    throw new Error("whoop_refresh_complete_failed");
  }

  const result = data as RpcResult;

  if (!result?.success || typeof result.token_version !== "number") {
    throw new Error(result?.code ?? "whoop_refresh_complete_failed");
  }

  return { tokenVersion: result.token_version };
}

export async function releaseWhoopRefreshClaim(params: {
  connectionId: string;
  claimId: string;
}): Promise<void> {
  const supabase = getAutomationClient();

  await supabase.rpc("whoop_release_refresh_claim", {
    p_connection_id: params.connectionId,
    p_claim_id: params.claimId,
  });
}

export async function loadWhoopConnectionMetadataByUserId(userId: string): Promise<
  Pick<
    WhoopConnectionRow,
    "id" | "status" | "last_error_code" | "access_token_expires_at"
  > | null
> {
  const supabase = getAutomationClient();

  const { data, error } = await supabase
    .from("whoop_connections")
    .select("id, status, last_error_code, access_token_expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as Pick<
    WhoopConnectionRow,
    "id" | "status" | "last_error_code" | "access_token_expires_at"
  >;
}

export async function markWhoopRemoteRevokeCleanupPending(
  userId: string,
): Promise<void> {
  const supabase = getAutomationClient();

  await supabase
    .from("whoop_connections")
    .update({
      last_error_code:
        WHOOP_CONNECTION_INTERNAL_ERROR_CODES.remoteRevokeLocalCleanupPending,
    })
    .eq("user_id", userId);
}

export async function disconnectWhoopConnection(userId: string): Promise<void> {
  const supabase = getAutomationClient();

  const { data, error } = await supabase.rpc("whoop_disconnect_connection", {
    p_user_id: userId,
  });

  if (error) {
    throw new Error("whoop_disconnect_failed");
  }

  const result = data as RpcResult;

  if (!result?.success) {
    throw new Error(result?.code ?? "whoop_disconnect_failed");
  }
}

export async function markWhoopConnectionError(params: {
  userId: string;
  errorCode: string;
  status?: "error" | "reconnect_required";
}): Promise<void> {
  const supabase = getAutomationClient();

  await supabase
    .from("whoop_connections")
    .update({
      status: params.status ?? "reconnect_required",
      last_error_code: params.errorCode,
    })
    .eq("user_id", params.userId);
}

export function toWhoopSafeConnectionSummary(
  connection:
    | Pick<
        WhoopConnectionRow,
        | "status"
        | "whoop_user_id"
        | "connected_at"
        | "granted_scopes"
        | "last_error_code"
      >
    | null,
) {
  if (!connection) {
    return {
      connected: false,
      status: "disconnected" as const,
      whoopUserId: null,
      connectedAt: null,
      grantedScopes: [] as string[],
      grantedScopesDisplay: null,
      lastErrorMessage: null,
    };
  }

  const connected = connection.status === "connected";

  return {
    connected,
    status: connection.status,
    whoopUserId: connection.whoop_user_id,
    connectedAt: connection.connected_at,
    grantedScopes: connection.granted_scopes,
    grantedScopesDisplay: formatWhoopGrantedScopesDisplay(
      connection.granted_scopes,
      connected,
    ),
    lastErrorMessage: toWhoopSafeLastErrorMessage(connection.last_error_code),
  };
}
