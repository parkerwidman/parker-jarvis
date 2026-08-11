import "server-only";

import { randomBytes, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

import {
  encryptWhoopAccessToken,
  decryptWhoopAccessToken,
} from "@/lib/jarvis/integrations/whoop/whoop-token-crypto";

export const WHOOP_OAUTH_STATE_COOKIE = "whoop_oauth_state";
export const WHOOP_OAUTH_COOKIE_MAX_AGE_SECONDS = 600;
export const WHOOP_OAUTH_COOKIE_PATH = "/api/integrations/whoop";

const WHOOP_STATE_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export type WhoopOAuthPendingState = {
  state: string;
  userId: string;
  issuedAt: number;
};

export function generateWhoopOAuthState(): string {
  const bytes = randomBytes(8);
  let state = "";

  for (let index = 0; index < 8; index += 1) {
    state += WHOOP_STATE_ALPHABET[bytes[index]! % WHOOP_STATE_ALPHABET.length];
  }

  return state;
}

export function encodeWhoopOAuthStateCookie(
  payload: WhoopOAuthPendingState,
): string {
  return encryptWhoopAccessToken(JSON.stringify(payload));
}

export function decodeWhoopOAuthStateCookie(
  value: string,
): WhoopOAuthPendingState | null {
  try {
    const parsed = JSON.parse(
      decryptWhoopAccessToken(value),
    ) as WhoopOAuthPendingState;

    if (
      typeof parsed.state !== "string" ||
      parsed.state.length !== 8 ||
      typeof parsed.userId !== "string" ||
      typeof parsed.issuedAt !== "number"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function whoopOAuthStatesMatch(
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

export function isWhoopOAuthStateExpired(
  issuedAt: number,
  now = Date.now(),
): boolean {
  return now - issuedAt > WHOOP_OAUTH_COOKIE_MAX_AGE_SECONDS * 1000;
}

export function buildWhoopAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): URL {
  const authUrl = new URL(
    "https://api.prod.whoop.com/oauth/oauth2/auth",
  );

  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", params.clientId);
  authUrl.searchParams.set("redirect_uri", params.redirectUri);
  authUrl.searchParams.set("scope", "offline read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement");
  authUrl.searchParams.set("state", params.state);

  return authUrl;
}

export function whoopIntegrationsStatusUrl(
  baseUrl: string,
  status: "connected" | "disconnected" | "error",
  errorCode?: string,
): URL {
  const url = new URL("/integrations/whoop", baseUrl);
  url.searchParams.set("status", status);

  if (errorCode) {
    url.searchParams.set("error", errorCode);
  }

  return url;
}

export function setWhoopOAuthStateCookie(
  response: NextResponse,
  payload: WhoopOAuthPendingState,
): void {
  response.cookies.set(
    WHOOP_OAUTH_STATE_COOKIE,
    encodeWhoopOAuthStateCookie(payload),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: WHOOP_OAUTH_COOKIE_PATH,
      maxAge: WHOOP_OAUTH_COOKIE_MAX_AGE_SECONDS,
    },
  );
}

export function clearWhoopOAuthStateCookie(response: NextResponse): void {
  response.cookies.set(WHOOP_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: WHOOP_OAUTH_COOKIE_PATH,
    maxAge: 0,
  });
}

export function sanitizeWhoopProviderError(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0 || trimmed.length > 120) {
    return null;
  }

  if (!/^[a-zA-Z0-9._ -]+$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}
