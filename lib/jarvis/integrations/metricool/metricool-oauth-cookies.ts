import "server-only";

import { randomBytes, timingSafeEqual } from "crypto";
import {
  METRICOOL_OAUTH_COOKIE_MAX_AGE_SECONDS,
  METRICOOL_OAUTH_STATE_COOKIE,
  METRICOOL_OAUTH_VERIFIER_COOKIE,
} from "./metricool-config";
import {
  decryptMetricoolSecret,
  encryptMetricoolSecret,
} from "./metricool-token-crypto";
import { NextResponse } from "next/server";

type MetricoolOAuthPendingState = {
  state: string;
  userId: string;
  issuedAt: number;
};

function encodeCookiePayload(payload: MetricoolOAuthPendingState): string {
  return encryptMetricoolSecret(JSON.stringify(payload));
}

function decodeCookiePayload(value: string): MetricoolOAuthPendingState | null {
  try {
    const parsed = JSON.parse(
      decryptMetricoolSecret(value),
    ) as MetricoolOAuthPendingState;

    if (
      typeof parsed.state !== "string" ||
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

export function generateOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function oauthStatesMatch(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function isOAuthPendingStateExpired(
  issuedAt: number,
  now = Date.now(),
): boolean {
  return now - issuedAt > METRICOOL_OAUTH_COOKIE_MAX_AGE_SECONDS * 1000;
}

export function setMetricoolOAuthCookies(
  response: NextResponse,
  params: {
    state: string;
    userId: string;
    codeVerifier: string;
  },
): void {
  const secure = process.env.NODE_ENV === "production";
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: METRICOOL_OAUTH_COOKIE_MAX_AGE_SECONDS,
  };

  response.cookies.set(
    METRICOOL_OAUTH_STATE_COOKIE,
    encodeCookiePayload({
      state: params.state,
      userId: params.userId,
      issuedAt: Date.now(),
    }),
    cookieOptions,
  );

  response.cookies.set(
    METRICOOL_OAUTH_VERIFIER_COOKIE,
    encryptMetricoolSecret(params.codeVerifier),
    cookieOptions,
  );
}

export function readMetricoolOAuthCookies(cookieStore: {
  get: (name: string) => { value: string } | undefined;
}): {
  pendingState: MetricoolOAuthPendingState | null;
  codeVerifier: string | null;
} {
  const stateCookie = cookieStore.get(METRICOOL_OAUTH_STATE_COOKIE)?.value;
  const verifierCookie = cookieStore.get(METRICOOL_OAUTH_VERIFIER_COOKIE)?.value;

  const pendingState = stateCookie ? decodeCookiePayload(stateCookie) : null;
  let codeVerifier: string | null = null;

  if (verifierCookie) {
    try {
      codeVerifier = decryptMetricoolSecret(verifierCookie);
    } catch {
      codeVerifier = null;
    }
  }

  return { pendingState, codeVerifier };
}

export function isActiveMetricoolOAuthFlow(
  cookieStore: {
    get: (name: string) => { value: string } | undefined;
  },
  userId: string,
): boolean {
  const { pendingState, codeVerifier } = readMetricoolOAuthCookies(cookieStore);

  return Boolean(
    pendingState &&
      codeVerifier &&
      pendingState.userId === userId &&
      !isOAuthPendingStateExpired(pendingState.issuedAt),
  );
}

export function clearMetricoolOAuthCookies(response: NextResponse): void {
  const secure = process.env.NODE_ENV === "production";
  const clearOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: 0,
  };

  response.cookies.set(METRICOOL_OAUTH_STATE_COOKIE, "", clearOptions);
  response.cookies.set(METRICOOL_OAUTH_VERIFIER_COOKIE, "", clearOptions);
}
