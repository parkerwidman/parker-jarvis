import {
  httpStatusClass,
  logMicrosoftOAuthCallbackDiagnostic,
  MICROSOFT_CALLBACK_STAGES,
} from "@/lib/microsoft/callback-diagnostics";
import {
  resolveCallbackRefreshTokenEncrypted,
  type ExistingMicrosoftConnection,
} from "@/lib/microsoft/callback-helpers";
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
  type MicrosoftOAuthMode,
  type MicrosoftOAuthResultCode,
} from "@/lib/microsoft/oauth-state";
import {
  MICROSOFT_SCOPES_STRING,
  resolveMailReadWritePermissionState,
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
  result: MicrosoftOAuthResultCode | "microsoft_connected",
): NextResponse {
  const response = NextResponse.redirect(
    microsoftConnectionsResultUrl(getBaseUrl(request), result),
  );
  clearMicrosoftOAuthStateCookie(response);
  return response;
}

function finishCallback(
  request: NextRequest,
  params: {
    result: MicrosoftOAuthResultCode | "microsoft_connected";
    mode: MicrosoftOAuthMode;
    stage: (typeof MICROSOFT_CALLBACK_STAGES)[keyof typeof MICROSOFT_CALLBACK_STAGES];
    success: boolean;
    httpStatusClass?: string;
    hasAccessToken?: boolean;
    hasRefreshToken?: boolean;
    hasScope?: boolean;
  },
): NextResponse {
  logMicrosoftOAuthCallbackDiagnostic({
    stage: params.stage,
    mode: params.mode,
    success: params.success,
    resultCode: params.result,
    httpStatusClass: params.httpStatusClass,
    hasAccessToken: params.hasAccessToken,
    hasRefreshToken: params.hasRefreshToken,
    hasScope: params.hasScope,
  });
  return redirectWithResult(request, params.result);
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
  const mode = pendingState?.mode ?? "connect";

  if (oauthError === "access_denied") {
    return finishCallback(request, {
      result: MICROSOFT_OAUTH_RESULT.consentCancelled,
      mode,
      stage: MICROSOFT_CALLBACK_STAGES.oauthStateValidation,
      success: false,
    });
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
    return finishCallback(request, {
      result: MICROSOFT_OAUTH_RESULT.stateInvalid,
      mode,
      stage: MICROSOFT_CALLBACK_STAGES.oauthStateValidation,
      success: false,
    });
  }

  let config;

  try {
    config = getOAuthConfig();
  } catch {
    return finishCallback(request, {
      result: MICROSOFT_OAUTH_RESULT.connectionFailed,
      mode: pendingState.mode,
      stage: MICROSOFT_CALLBACK_STAGES.oauthStateValidation,
      success: false,
    });
  }

  const { data: existingConnectionRow } = await supabase
    .from("microsoft_connections")
    .select("granted_scopes, refresh_token_encrypted, microsoft_user_id")
    .eq("user_id", userId)
    .maybeSingle();

  const existingConnection: ExistingMicrosoftConnection | null =
    existingConnectionRow &&
    typeof existingConnectionRow.refresh_token_encrypted === "string" &&
    typeof existingConnectionRow.microsoft_user_id === "string" &&
    typeof existingConnectionRow.granted_scopes === "string"
      ? {
          granted_scopes: existingConnectionRow.granted_scopes,
          refresh_token_encrypted: existingConnectionRow.refresh_token_encrypted,
          microsoft_user_id: existingConnectionRow.microsoft_user_id,
        }
      : null;

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
      return finishCallback(request, {
        result: MICROSOFT_OAUTH_RESULT.tokenExchangeFailed,
        mode: pendingState.mode,
        stage: MICROSOFT_CALLBACK_STAGES.authorizationCodeExchange,
        success: false,
        httpStatusClass: httpStatusClass(tokenResult.status),
      });
    }

    tokenResponse = (await tokenResult.json()) as MicrosoftTokenResponse;
  } catch {
    return finishCallback(request, {
      result: MICROSOFT_OAUTH_RESULT.tokenExchangeFailed,
      mode: pendingState.mode,
      stage: MICROSOFT_CALLBACK_STAGES.authorizationCodeExchange,
      success: false,
    });
  }

  const { access_token, refresh_token, expires_in, scope } = tokenResponse;
  const hasScope = typeof scope === "string" && scope.length > 0;

  if (typeof access_token !== "string" || typeof expires_in !== "number") {
    return finishCallback(request, {
      result: MICROSOFT_OAUTH_RESULT.tokenExchangeFailed,
      mode: pendingState.mode,
      stage: MICROSOFT_CALLBACK_STAGES.tokenResponseValidation,
      success: false,
      hasAccessToken: typeof access_token === "string",
      hasRefreshToken: typeof refresh_token === "string",
      hasScope,
    });
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
      return finishCallback(request, {
        result: MICROSOFT_OAUTH_RESULT.connectionFailed,
        mode: pendingState.mode,
        stage: MICROSOFT_CALLBACK_STAGES.tokenResponseValidation,
        success: false,
        httpStatusClass: httpStatusClass(profileResult.status),
        hasAccessToken: true,
        hasRefreshToken: typeof refresh_token === "string",
        hasScope,
      });
    }

    profile = (await profileResult.json()) as MicrosoftProfile;
  } catch {
    return finishCallback(request, {
      result: MICROSOFT_OAUTH_RESULT.connectionFailed,
      mode: pendingState.mode,
      stage: MICROSOFT_CALLBACK_STAGES.tokenResponseValidation,
      success: false,
      hasAccessToken: true,
      hasRefreshToken: typeof refresh_token === "string",
      hasScope,
    });
  }

  if (typeof profile.id !== "string") {
    return finishCallback(request, {
      result: MICROSOFT_OAUTH_RESULT.connectionFailed,
      mode: pendingState.mode,
      stage: MICROSOFT_CALLBACK_STAGES.tokenResponseValidation,
      success: false,
      hasAccessToken: true,
      hasRefreshToken: typeof refresh_token === "string",
      hasScope,
    });
  }

  const refreshTokenResolution = resolveCallbackRefreshTokenEncrypted({
    refreshToken: refresh_token,
    mode: pendingState.mode,
    existingConnection,
    profileMicrosoftUserId: profile.id,
  });

  if (!refreshTokenResolution.success) {
    return finishCallback(request, {
      result: MICROSOFT_OAUTH_RESULT.tokenExchangeFailed,
      mode: pendingState.mode,
      stage: MICROSOFT_CALLBACK_STAGES.tokenResponseValidation,
      success: false,
      hasAccessToken: true,
      hasRefreshToken: typeof refresh_token === "string",
      hasScope,
    });
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

  try {
    accessTokenEncrypted = encryptToken(access_token);
  } catch {
    return finishCallback(request, {
      result: MICROSOFT_OAUTH_RESULT.connectionFailed,
      mode: pendingState.mode,
      stage: MICROSOFT_CALLBACK_STAGES.tokenPersistence,
      success: false,
      hasAccessToken: true,
      hasRefreshToken: refreshTokenResolution.preservedExisting || typeof refresh_token === "string",
      hasScope,
    });
  }

  const accessTokenExpiresAt = new Date(
    Date.now() + expires_in * 1000,
  ).toISOString();
  const grantedScopes = resolvePersistedGrantedScopes({
    tokenScope: scope,
    existingGrantedScopes: existingConnection?.granted_scopes ?? null,
    mode: pendingState.mode,
  });
  const mailReadWriteState = resolveMailReadWritePermissionState(grantedScopes);

  const { error: upsertError } = await supabase.from("microsoft_connections").upsert(
    {
      user_id: userId,
      microsoft_user_id: profile.id,
      tenant_id: config.tenantId,
      email,
      display_name: displayName,
      access_token_encrypted: accessTokenEncrypted,
      refresh_token_encrypted: refreshTokenResolution.refreshTokenEncrypted,
      access_token_expires_at: accessTokenExpiresAt,
      granted_scopes: grantedScopes,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (upsertError) {
    return finishCallback(request, {
      result: MICROSOFT_OAUTH_RESULT.tokenPersistenceFailed,
      mode: pendingState.mode,
      stage: MICROSOFT_CALLBACK_STAGES.tokenPersistence,
      success: false,
      hasAccessToken: true,
      hasRefreshToken: refreshTokenResolution.preservedExisting || typeof refresh_token === "string",
      hasScope,
    });
  }

  const successResult =
    pendingState.mode === "reconnect"
      ? resolveReconnectSuccessResult(mailReadWriteState)
      : "microsoft_connected";

  return finishCallback(request, {
    result: successResult,
    mode: pendingState.mode,
    stage: MICROSOFT_CALLBACK_STAGES.callbackCompletion,
    success: true,
    hasAccessToken: true,
    hasRefreshToken: refreshTokenResolution.preservedExisting || typeof refresh_token === "string",
    hasScope,
  });
}
