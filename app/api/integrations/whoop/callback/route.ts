import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import {
  buildWhoopAccessTokenExpiryIso,
  exchangeWhoopAuthorizationCode,
  fetchWhoopBasicProfile,
} from "@/lib/jarvis/integrations/whoop/whoop-oauth-client";
import { persistWhoopOAuthConnection } from "@/lib/jarvis/integrations/whoop/whoop-connection-tools";
import {
  getWhoopBaseUrl,
  getWhoopRedirectUri,
  getWhoopOAuthConfig,
} from "@/lib/jarvis/integrations/whoop/whoop-config";
import {
  WHOOP_OAUTH_ERROR_CODES,
  toWhoopSafeErrorParam,
} from "@/lib/jarvis/integrations/whoop/whoop-oauth-errors";
import {
  clearWhoopOAuthStateCookie,
  decodeWhoopOAuthStateCookie,
  isWhoopOAuthStateExpired,
  sanitizeWhoopProviderError,
  whoopIntegrationsStatusUrl,
  whoopOAuthStatesMatch,
  WHOOP_OAUTH_STATE_COOKIE,
} from "@/lib/jarvis/integrations/whoop/whoop-oauth-state";
import { createClient } from "@/lib/supabase/server";

function redirectWithStatus(
  request: NextRequest,
  status: "connected" | "error",
  errorCode?: string,
): NextResponse {
  const response = NextResponse.redirect(
    whoopIntegrationsStatusUrl(
      getWhoopBaseUrl(request.nextUrl.origin),
      status === "connected" ? "connected" : "error",
      errorCode,
    ),
  );
  clearWhoopOAuthStateCookie(response);
  return response;
}

export async function GET(request: NextRequest) {
  const baseUrl = getWhoopBaseUrl(request.nextUrl.origin);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }

  const userId =
    typeof data.claims.sub === "string" ? data.claims.sub : null;

  if (!userId) {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }

  const searchParams = request.nextUrl.searchParams;
  const oauthError = searchParams.get("error");
  const code = searchParams.get("code");
  const returnedState = searchParams.get("state");
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(WHOOP_OAUTH_STATE_COOKIE)?.value;
  const pendingState = cookieValue
    ? decodeWhoopOAuthStateCookie(cookieValue)
    : null;

  if (oauthError) {
    sanitizeWhoopProviderError(searchParams.get("error_description"));
    return redirectWithStatus(
      request,
      "error",
      oauthError === "access_denied"
        ? "authorization_expired"
        : "connection_failed",
    );
  }

  if (
    !code ||
    !returnedState ||
    !pendingState ||
    !whoopOAuthStatesMatch(pendingState.state, returnedState) ||
    pendingState.userId !== userId ||
    isWhoopOAuthStateExpired(pendingState.issuedAt)
  ) {
    return redirectWithStatus(
      request,
      "error",
      toWhoopSafeErrorParam(WHOOP_OAUTH_ERROR_CODES.stateInvalid),
    );
  }

  try {
    getWhoopOAuthConfig();
  } catch {
    return redirectWithStatus(
      request,
      "error",
      toWhoopSafeErrorParam(WHOOP_OAUTH_ERROR_CODES.notConfigured),
    );
  }

  const redirectUri = getWhoopRedirectUri(request.nextUrl.origin);

  let tokenPair;

  try {
    tokenPair = await exchangeWhoopAuthorizationCode({
      code,
      redirectUri,
    });
  } catch {
    return redirectWithStatus(
      request,
      "error",
      toWhoopSafeErrorParam(WHOOP_OAUTH_ERROR_CODES.tokenExchangeFailed),
    );
  }

  let profile;

  try {
    profile = await fetchWhoopBasicProfile(tokenPair.accessToken);
  } catch {
    return redirectWithStatus(
      request,
      "error",
      toWhoopSafeErrorParam(WHOOP_OAUTH_ERROR_CODES.profileInvalid),
    );
  }

  try {
    await persistWhoopOAuthConnection({
      userId,
      whoopUserId: profile.user_id,
      grantedScopes: tokenPair.grantedScopes,
      accessTokenExpiresAt: buildWhoopAccessTokenExpiryIso(tokenPair.expiresIn),
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
    });
  } catch {
    return redirectWithStatus(
      request,
      "error",
      toWhoopSafeErrorParam(WHOOP_OAUTH_ERROR_CODES.persistenceFailed),
    );
  }

  return redirectWithStatus(request, "connected");
}
