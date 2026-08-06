import { encryptToken } from "@/lib/microsoft/encryption";
import {
  clearMicrosoftOAuthStateCookie,
  decodeMicrosoftOAuthStateCookie,
  isMicrosoftOAuthStateExpired,
  microsoftConnectionsResultUrl,
  microsoftOAuthStatesMatch,
  MICROSOFT_OAUTH_RESULT,
  MICROSOFT_OAUTH_STATE_COOKIE,
  resolvePersistedGrantedScopes,
  resolveReconnectSuccessResult,
} from "@/lib/microsoft/oauth-state";
import {
  MICROSOFT_SCOPES_STRING,
  resolveMailSendPermissionState,
} from "@/lib/microsoft/scopes";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const MICROSOFT_SCOPES = MICROSOFT_SCOPES_STRING;

function getBaseUrl(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
}

function getOAuthConfig() {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;

  if (!tenantId || !clientId || !clientSecret || !redirectUri) {
    throw new Error("Microsoft OAuth is not configured");
  }

  return { tenantId, clientId, clientSecret, redirectUri };
}

function redirectWithResult(
  request: NextRequest,
  result: (typeof MICROSOFT_OAUTH_RESULT)[keyof typeof MICROSOFT_OAUTH_RESULT] | "microsoft_connected",
): NextResponse {
  const response = NextResponse.redirect(
    microsoftConnectionsResultUrl(getBaseUrl(request), result),
  );
  clearMicrosoftOAuthStateCookie(response);
  return response;
}

type MicrosoftTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

type MicrosoftProfile = {
  id?: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
};

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return NextResponse.redirect(new URL("/login", getBaseUrl(request)));
  }

  const userId =
    typeof data.claims.sub === "string" ? data.claims.sub : null;

  if (!userId) {
    return NextResponse.redirect(new URL("/login", getBaseUrl(request)));
  }

  const searchParams = request.nextUrl.searchParams;
  const oauthError = searchParams.get("error");
  const code = searchParams.get("code");
  const returnedState = searchParams.get("state");
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(MICROSOFT_OAUTH_STATE_COOKIE)?.value;
  const pendingState = cookieValue
    ? decodeMicrosoftOAuthStateCookie(cookieValue)
    : null;

  if (oauthError === "access_denied") {
    return redirectWithResult(request, MICROSOFT_OAUTH_RESULT.consentCancelled);
  }

  if (
    oauthError ||
    !code ||
    !returnedState ||
    !pendingState ||
    !microsoftOAuthStatesMatch(pendingState.state, returnedState) ||
    pendingState.userId !== userId ||
    isMicrosoftOAuthStateExpired(pendingState.issuedAt)
  ) {
    return redirectWithResult(request, MICROSOFT_OAUTH_RESULT.invalidOAuthState);
  }

  let config;

  try {
    config = getOAuthConfig();
  } catch {
    return redirectWithResult(request, MICROSOFT_OAUTH_RESULT.connectionFailed);
  }

  const { data: existingConnection } = await supabase
    .from("microsoft_connections")
    .select("granted_scopes")
    .eq("user_id", userId)
    .maybeSingle();

  let tokenResponse: MicrosoftTokenResponse;

  try {
    const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      scope: MICROSOFT_SCOPES,
    });

    const tokenResult = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!tokenResult.ok) {
      return redirectWithResult(request, MICROSOFT_OAUTH_RESULT.connectionFailed);
    }

    tokenResponse = (await tokenResult.json()) as MicrosoftTokenResponse;
  } catch {
    return redirectWithResult(request, MICROSOFT_OAUTH_RESULT.connectionFailed);
  }

  const { access_token, refresh_token, expires_in, scope } = tokenResponse;

  if (
    typeof access_token !== "string" ||
    typeof refresh_token !== "string" ||
    typeof expires_in !== "number"
  ) {
    return redirectWithResult(request, MICROSOFT_OAUTH_RESULT.connectionFailed);
  }

  let profile: MicrosoftProfile;

  try {
    const profileResult = await fetch(
      "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName",
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      },
    );

    if (!profileResult.ok) {
      return redirectWithResult(request, MICROSOFT_OAUTH_RESULT.connectionFailed);
    }

    profile = (await profileResult.json()) as MicrosoftProfile;
  } catch {
    return redirectWithResult(request, MICROSOFT_OAUTH_RESULT.connectionFailed);
  }

  if (typeof profile.id !== "string") {
    return redirectWithResult(request, MICROSOFT_OAUTH_RESULT.connectionFailed);
  }

  const email =
    typeof profile.mail === "string" && profile.mail.length > 0
      ? profile.mail
      : typeof profile.userPrincipalName === "string"
        ? profile.userPrincipalName
        : null;

  const displayName =
    typeof profile.displayName === "string" ? profile.displayName : null;

  let accessTokenEncrypted: string;
  let refreshTokenEncrypted: string;

  try {
    accessTokenEncrypted = encryptToken(access_token);
    refreshTokenEncrypted = encryptToken(refresh_token);
  } catch {
    return redirectWithResult(request, MICROSOFT_OAUTH_RESULT.connectionFailed);
  }

  const accessTokenExpiresAt = new Date(
    Date.now() + expires_in * 1000,
  ).toISOString();
  const grantedScopes = resolvePersistedGrantedScopes({
    tokenScope: scope,
    existingGrantedScopes: existingConnection?.granted_scopes ?? null,
    mode: pendingState.mode,
  });
  const mailSendState = resolveMailSendPermissionState(grantedScopes);

  const { error: upsertError } = await supabase.from("microsoft_connections").upsert(
    {
      user_id: userId,
      microsoft_user_id: profile.id,
      tenant_id: config.tenantId,
      email,
      display_name: displayName,
      access_token_encrypted: accessTokenEncrypted,
      refresh_token_encrypted: refreshTokenEncrypted,
      access_token_expires_at: accessTokenExpiresAt,
      granted_scopes: grantedScopes,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (upsertError) {
    return redirectWithResult(request, MICROSOFT_OAUTH_RESULT.connectionFailed);
  }

  const successResult =
    pendingState.mode === "reconnect"
      ? resolveReconnectSuccessResult(mailSendState)
      : "microsoft_connected";

  return redirectWithResult(request, successResult);
}
