import "server-only";

import { decryptToken, encryptToken } from "@/lib/microsoft/encryption";
import {
  grantedScopesIncludeMailReadWrite,
  grantedScopesIncludeMailSend,
  isGrantedScopesUnknown,
  MICROSOFT_MAIL_READ_WRITE_SCOPE,
  MICROSOFT_MAIL_SEND_SCOPE,
  MICROSOFT_SCOPES_STRING,
  resolveMailReadWritePermissionState,
  resolveMailSendPermissionState,
  scopesWithoutMailReadWrite,
  scopesWithoutMailSend,
  type MailSendPermissionState,
  type MicrosoftPermissionState,
} from "@/lib/microsoft/scopes";
import type { SupabaseClient } from "@supabase/supabase-js";

const MICROSOFT_SCOPES = MICROSOFT_SCOPES_STRING;

const FIVE_MINUTES_MS = 5 * 60 * 1000;

const RECONNECT_ERROR_CODES = new Set([
  "invalid_grant",
  "interaction_required",
  "login_required",
  "consent_required",
]);

type MicrosoftConnectionRow = {
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  access_token_expires_at: string;
  tenant_id: string;
};

type MicrosoftTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

export type MicrosoftAccessTokenResult =
  | { success: true; accessToken: string }
  | { success: false; needsConnection: true }
  | { success: false; needsReconnect: true }
  | { success: false; error: string };

function getOAuthConfig() {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft OAuth is not configured");
  }

  return { tenantId, clientId, clientSecret };
}

function tokenExpiresWithinFiveMinutes(expiresAt: string): boolean {
  const expiryTime = new Date(expiresAt).getTime();

  if (Number.isNaN(expiryTime)) {
    return true;
  }

  return expiryTime <= Date.now() + FIVE_MINUTES_MS;
}

async function refreshMicrosoftAccessToken(
  supabase: SupabaseClient,
  userId: string,
  connection: MicrosoftConnectionRow,
): Promise<MicrosoftAccessTokenResult> {
  let refreshToken: string;

  try {
    refreshToken = decryptToken(connection.refresh_token_encrypted);
  } catch {
    return { success: false, needsReconnect: true };
  }

  let config;

  try {
    config = getOAuthConfig();
  } catch {
    return { success: false, error: "Microsoft integration is not configured." };
  }

  const tokenUrl = `https://login.microsoftonline.com/${connection.tenant_id}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: MICROSOFT_SCOPES,
  });

  let tokenResponse: MicrosoftTokenResponse;

  try {
    const result = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    tokenResponse = (await result.json()) as MicrosoftTokenResponse;

    if (!result.ok) {
      const errorCode =
        typeof tokenResponse.error === "string" ? tokenResponse.error : "";

      if (RECONNECT_ERROR_CODES.has(errorCode)) {
        return { success: false, needsReconnect: true };
      }

      return { success: false, error: "Could not refresh Microsoft access token." };
    }
  } catch {
    return { success: false, error: "Could not refresh Microsoft access token." };
  }

  const { access_token, refresh_token, expires_in, scope } = tokenResponse;

  if (typeof access_token !== "string" || typeof expires_in !== "number") {
    return { success: false, error: "Could not refresh Microsoft access token." };
  }

  let accessTokenEncrypted: string;
  let refreshTokenEncrypted = connection.refresh_token_encrypted;

  try {
    accessTokenEncrypted = encryptToken(access_token);

    if (typeof refresh_token === "string") {
      refreshTokenEncrypted = encryptToken(refresh_token);
    }
  } catch {
    return { success: false, error: "Could not store Microsoft access token." };
  }

  const accessTokenExpiresAt = new Date(
    Date.now() + expires_in * 1000,
  ).toISOString();

  const updatePayload: Record<string, string> = {
    access_token_encrypted: accessTokenEncrypted,
    refresh_token_encrypted: refreshTokenEncrypted,
    access_token_expires_at: accessTokenExpiresAt,
  };

  if (typeof scope === "string" && scope.length > 0) {
    updatePayload.granted_scopes = scope;
  }

  const { error: updateError } = await supabase
    .from("microsoft_connections")
    .update(updatePayload)
    .eq("user_id", userId);

  if (updateError) {
    return { success: false, error: "Could not store Microsoft access token." };
  }

  return { success: true, accessToken: access_token };
}

export async function getValidMicrosoftAccessToken(
  supabase: SupabaseClient,
  userId: string,
  forceRefresh = false,
): Promise<MicrosoftAccessTokenResult> {
  const { data: connection, error } = await supabase
    .from("microsoft_connections")
    .select(
      "access_token_encrypted, refresh_token_encrypted, access_token_expires_at, tenant_id",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { success: false, error: "Could not load Microsoft connection." };
  }

  if (!connection) {
    return { success: false, needsConnection: true };
  }

  if (
    !forceRefresh &&
    !tokenExpiresWithinFiveMinutes(connection.access_token_expires_at)
  ) {
    try {
      const accessToken = decryptToken(connection.access_token_encrypted);
      return { success: true, accessToken };
    } catch {
      return refreshMicrosoftAccessToken(supabase, userId, connection);
    }
  }

  return refreshMicrosoftAccessToken(supabase, userId, connection);
}

export async function getMicrosoftGrantedScopes(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("microsoft_connections")
    .select("granted_scopes")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data || data.granted_scopes === undefined || data.granted_scopes === null) {
    return null;
  }

  return data.granted_scopes;
}

export async function getMailSendPermissionState(
  supabase: SupabaseClient,
  userId: string,
): Promise<MailSendPermissionState> {
  const scopes = await getMicrosoftGrantedScopes(supabase, userId);
  return resolveMailSendPermissionState(scopes);
}

export async function userHasMailSendPermission(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const state = await getMailSendPermissionState(supabase, userId);
  return state === "granted";
}

export async function recordMailSendVerified(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const scopes = await getMicrosoftGrantedScopes(supabase, userId);

  if (scopes && grantedScopesIncludeMailSend(scopes)) {
    return;
  }

  const nextScopes =
    scopes && !isGrantedScopesUnknown(scopes)
      ? `${scopes} ${MICROSOFT_MAIL_SEND_SCOPE}`.trim()
      : MICROSOFT_MAIL_SEND_SCOPE;

  await supabase
    .from("microsoft_connections")
    .update({ granted_scopes: nextScopes })
    .eq("user_id", userId);
}

export async function recordMailSendMissing(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const scopes = await getMicrosoftGrantedScopes(supabase, userId);

  if (scopes && !isGrantedScopesUnknown(scopes) && !grantedScopesIncludeMailSend(scopes)) {
    return;
  }

  await supabase
    .from("microsoft_connections")
    .update({ granted_scopes: scopesWithoutMailSend() })
    .eq("user_id", userId);
}

export async function getMailReadWritePermissionState(
  supabase: SupabaseClient,
  userId: string,
): Promise<MicrosoftPermissionState> {
  const scopes = await getMicrosoftGrantedScopes(supabase, userId);
  return resolveMailReadWritePermissionState(scopes);
}

export async function recordMailReadWriteVerified(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const scopes = await getMicrosoftGrantedScopes(supabase, userId);

  if (scopes && grantedScopesIncludeMailReadWrite(scopes)) {
    return;
  }

  const nextScopes =
    scopes && !isGrantedScopesUnknown(scopes)
      ? `${scopes} ${MICROSOFT_MAIL_READ_WRITE_SCOPE}`.trim()
      : MICROSOFT_MAIL_READ_WRITE_SCOPE;

  await supabase
    .from("microsoft_connections")
    .update({ granted_scopes: nextScopes })
    .eq("user_id", userId);
}

export async function recordMailReadWriteMissing(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const scopes = await getMicrosoftGrantedScopes(supabase, userId);

  if (
    scopes &&
    !isGrantedScopesUnknown(scopes) &&
    !grantedScopesIncludeMailReadWrite(scopes)
  ) {
    return;
  }

  await supabase
    .from("microsoft_connections")
    .update({ granted_scopes: scopesWithoutMailReadWrite() })
    .eq("user_id", userId);
}
