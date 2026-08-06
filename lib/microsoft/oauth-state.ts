import "server-only";

import { randomBytes, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import { encryptToken, decryptToken } from "@/lib/microsoft/encryption";
import {
  MICROSOFT_GRANTED_SCOPES_UNKNOWN,
  MICROSOFT_SCOPES_STRING,
  normalizeGrantedScopes,
  resolveMailReadWritePermissionState,
  type MicrosoftPermissionState,
} from "@/lib/microsoft/scopes";

export const MICROSOFT_OAUTH_STATE_COOKIE = "microsoft_oauth_state";
export const MICROSOFT_OAUTH_COOKIE_MAX_AGE_SECONDS = 600;
export const MICROSOFT_CONNECTIONS_PATH = "/connections/microsoft";

export const MICROSOFT_OAUTH_RESULT = {
  reconnected: "microsoft_reconnected",
  reconnectedPermissionsUnknown: "microsoft_reconnected_permissions_unknown",
  permissionNotGranted: "microsoft_permission_not_granted",
  connectionFailed: "microsoft_connection_failed",
  consentCancelled: "microsoft_consent_cancelled",
  stateInvalid: "microsoft_state_invalid",
  tokenExchangeFailed: "microsoft_token_exchange_failed",
  tokenPersistenceFailed: "microsoft_token_persistence_failed",
} as const;

export type MicrosoftOAuthResultCode =
  (typeof MICROSOFT_OAUTH_RESULT)[keyof typeof MICROSOFT_OAUTH_RESULT];

export type MicrosoftOAuthMode = "connect" | "reconnect";

export type MicrosoftOAuthPendingState = {
  state: string;
  userId: string;
  mode: MicrosoftOAuthMode;
  issuedAt: number;
};

export function generateMicrosoftOAuthNonce(): string {
  return randomBytes(32).toString("base64url");
}

export function encodeMicrosoftOAuthStateCookie(
  payload: MicrosoftOAuthPendingState,
): string {
  return encryptToken(JSON.stringify(payload));
}

export function decodeMicrosoftOAuthStateCookie(
  value: string,
): MicrosoftOAuthPendingState | null {
  try {
    const parsed = JSON.parse(
      decryptToken(value),
    ) as MicrosoftOAuthPendingState;

    if (
      typeof parsed.state !== "string" ||
      typeof parsed.userId !== "string" ||
      (parsed.mode !== "connect" && parsed.mode !== "reconnect") ||
      typeof parsed.issuedAt !== "number"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function microsoftOAuthStatesMatch(
  expected: string,
  received: string,
): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function isMicrosoftOAuthStateExpired(
  issuedAt: number,
  now = Date.now(),
): boolean {
  return now - issuedAt > MICROSOFT_OAUTH_COOKIE_MAX_AGE_SECONDS * 1000;
}

export function parseMicrosoftConnectMode(
  searchParams: URLSearchParams,
): MicrosoftOAuthMode {
  return searchParams.get("mode") === "reconnect" ? "reconnect" : "connect";
}

export function buildMicrosoftAuthorizeUrl(params: {
  tenantId: string;
  clientId: string;
  redirectUri: string;
  state: string;
  mode: MicrosoftOAuthMode;
}): URL {
  const authUrl = new URL(
    `https://login.microsoftonline.com/${params.tenantId}/oauth2/v2.0/authorize`,
  );

  authUrl.searchParams.set("client_id", params.clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", params.redirectUri);
  authUrl.searchParams.set("response_mode", "query");
  authUrl.searchParams.set("scope", MICROSOFT_SCOPES_STRING);
  authUrl.searchParams.set("state", params.state);

  if (params.mode === "reconnect") {
    authUrl.searchParams.set("prompt", "consent");
  }

  return authUrl;
}

export function microsoftConnectionsResultUrl(
  baseUrl: string,
  result: MicrosoftOAuthResultCode | "microsoft_connected",
): URL {
  const url = new URL(MICROSOFT_CONNECTIONS_PATH, baseUrl);
  url.searchParams.set("result", result);
  return url;
}

export function isAllowedMicrosoftOAuthReturnPath(pathname: string): boolean {
  return pathname === MICROSOFT_CONNECTIONS_PATH;
}

export function setMicrosoftOAuthStateCookie(
  response: NextResponse,
  payload: MicrosoftOAuthPendingState,
): void {
  response.cookies.set(
    MICROSOFT_OAUTH_STATE_COOKIE,
    encodeMicrosoftOAuthStateCookie(payload),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MICROSOFT_OAUTH_COOKIE_MAX_AGE_SECONDS,
    },
  );
}

export function clearMicrosoftOAuthStateCookie(response: NextResponse): void {
  response.cookies.set(MICROSOFT_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function resolvePersistedGrantedScopes(params: {
  tokenScope: string | undefined;
  existingGrantedScopes: string | null;
  mode: MicrosoftOAuthMode;
}): string {
  if (typeof params.tokenScope === "string" && params.tokenScope.length > 0) {
    return normalizeGrantedScopes(params.tokenScope);
  }

  return MICROSOFT_GRANTED_SCOPES_UNKNOWN;
}

export function resolveReconnectSuccessResult(
  mailReadWriteState: MicrosoftPermissionState,
): (typeof MICROSOFT_OAUTH_RESULT)[keyof typeof MICROSOFT_OAUTH_RESULT] {
  switch (mailReadWriteState) {
    case "granted":
      return MICROSOFT_OAUTH_RESULT.reconnected;
    case "missing":
      return MICROSOFT_OAUTH_RESULT.permissionNotGranted;
    case "unknown":
      return MICROSOFT_OAUTH_RESULT.reconnectedPermissionsUnknown;
  }
}
