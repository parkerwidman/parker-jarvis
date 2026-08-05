import { createClient } from "@/lib/supabase/server";
import {
  finishMetricoolOAuthAndVerify,
  loadMetricoolProviderForUser,
  mapMetricoolError,
} from "@/lib/jarvis/integrations/metricool/metricool-client";
import {
  getMetricoolSocialRedirectPath,
  getMetricoolBaseUrl,
} from "@/lib/jarvis/integrations/metricool/metricool-config";
import {
  hadWorkingMetricoolConnection,
  loadMetricoolConnectionRow,
  markMetricoolConnectionStatus,
  markMetricoolOAuthFailure,
  saveMetricoolConnectedMetadata,
  serializeOAuthTokens,
} from "@/lib/jarvis/integrations/metricool/metricool-connection-tools";
import {
  clearMetricoolOAuthCookies,
  isOAuthPendingStateExpired,
  oauthStatesMatch,
  readMetricoolOAuthCookies,
} from "@/lib/jarvis/integrations/metricool/metricool-oauth-cookies";
import { MetricoolSafeError } from "@/lib/jarvis/integrations/metricool/metricool-types";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

function getBaseUrl(request: NextRequest): string {
  return getMetricoolBaseUrl(request.nextUrl.origin);
}

function socialRedirect(
  request: NextRequest,
  params: Record<string, string>,
  clearOAuthCookies: boolean,
): NextResponse {
  const url = new URL(getMetricoolSocialRedirectPath(), getBaseUrl(request));
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = NextResponse.redirect(url);
  if (clearOAuthCookies) {
    clearMetricoolOAuthCookies(response);
  }
  return response;
}

function failureRedirect(request: NextRequest): NextResponse {
  return socialRedirect(request, { error: "connection_failed" }, true);
}

export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl(request);
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

  const rowBeforeAttempt = await loadMetricoolConnectionRow(supabase, userId);

  const searchParams = request.nextUrl.searchParams;
  const oauthError = searchParams.get("error");
  const code = searchParams.get("code");
  const returnedState = searchParams.get("state");

  if (oauthError || !code || !returnedState) {
    await markMetricoolOAuthFailure(
      supabase,
      userId,
      rowBeforeAttempt,
      "auth_failed",
    );
    return failureRedirect(request);
  }

  const cookieStore = await cookies();
  const { pendingState, codeVerifier } = readMetricoolOAuthCookies(cookieStore);

  if (
    !pendingState ||
    !codeVerifier ||
    pendingState.userId !== userId ||
    isOAuthPendingStateExpired(pendingState.issuedAt) ||
    !oauthStatesMatch(pendingState.state, returnedState)
  ) {
    await markMetricoolOAuthFailure(
      supabase,
      userId,
      rowBeforeAttempt,
      "state_invalid",
    );
    return socialRedirect(request, { error: "state_invalid" }, true);
  }

  const provider = await loadMetricoolProviderForUser(
    supabase,
    userId,
    baseUrl,
  );
  provider.hydrateState(pendingState.state);
  provider.hydrateCodeVerifier(codeVerifier);

  try {
    const verifiedBrand = await finishMetricoolOAuthAndVerify(provider, code);
    const tokens = provider.getSerializedTokens();

    if (!tokens?.access_token) {
      throw new MetricoolSafeError("auth_failed");
    }

    const encrypted = serializeOAuthTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in:
        typeof tokens.expires_in === "number" ? tokens.expires_in : undefined,
    });

    await provider.refreshConnectionRow();
    const refreshedRow = await loadMetricoolConnectionRow(supabase, userId);

    await saveMetricoolConnectedMetadata(supabase, userId, {
      brandId: verifiedBrand.id,
      brandLabel: verifiedBrand.label,
      brandTimezone: verifiedBrand.timezone,
      connectedNetworks: verifiedBrand.networkProfiles,
      encryptedAccessToken: encrypted.encryptedAccessToken,
      encryptedRefreshToken: encrypted.encryptedRefreshToken,
      tokenExpiresAt: encrypted.tokenExpiresAt,
      encryptedClientInformation:
        refreshedRow?.encrypted_client_information ?? null,
    });

    return socialRedirect(request, { connected: "true" }, true);
  } catch (caught) {
    const safeError = mapMetricoolError(caught);

    if (safeError.code === "brand_mismatch") {
      if (!hadWorkingMetricoolConnection(rowBeforeAttempt)) {
        await markMetricoolConnectionStatus(
          supabase,
          userId,
          "error",
          safeError.code,
        );
      }

      return socialRedirect(request, { error: "brand_mismatch" }, true);
    }

    if (hadWorkingMetricoolConnection(rowBeforeAttempt)) {
      return failureRedirect(request);
    }

    const status =
      safeError.code === "auth_failed" ||
      safeError.code === "reconnect_required"
        ? "reconnect_required"
        : "error";

    await markMetricoolConnectionStatus(
      supabase,
      userId,
      status,
      safeError.code,
    );

    return failureRedirect(request);
  }
}
