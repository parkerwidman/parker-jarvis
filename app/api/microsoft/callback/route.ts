import { encryptToken } from "@/lib/microsoft/encryption";
import { createClient } from "@/lib/supabase/server";
import { timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const MICROSOFT_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "User.Read",
  "Mail.ReadWrite",
  "Calendars.ReadWrite",
].join(" ");

const STATE_COOKIE = "microsoft_oauth_state";

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

function statesMatch(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

function clearStateCookie(response: NextResponse): void {
  response.cookies.set(STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

function connectionFailedRedirect(request: NextRequest): NextResponse {
  const response = NextResponse.redirect(
    new URL("/connections/microsoft?error=connection_failed", getBaseUrl(request)),
  );
  clearStateCookie(response);
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
  const cookieState = cookieStore.get(STATE_COOKIE)?.value;

  if (
    oauthError ||
    !code ||
    !returnedState ||
    !cookieState ||
    !statesMatch(cookieState, returnedState)
  ) {
    return connectionFailedRedirect(request);
  }

  let config;

  try {
    config = getOAuthConfig();
  } catch {
    return connectionFailedRedirect(request);
  }

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
      return connectionFailedRedirect(request);
    }

    tokenResponse = (await tokenResult.json()) as MicrosoftTokenResponse;
  } catch {
    return connectionFailedRedirect(request);
  }

  const { access_token, refresh_token, expires_in, scope } = tokenResponse;

  if (
    typeof access_token !== "string" ||
    typeof refresh_token !== "string" ||
    typeof expires_in !== "number"
  ) {
    return connectionFailedRedirect(request);
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
      return connectionFailedRedirect(request);
    }

    profile = (await profileResult.json()) as MicrosoftProfile;
  } catch {
    return connectionFailedRedirect(request);
  }

  if (typeof profile.id !== "string") {
    return connectionFailedRedirect(request);
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
    return connectionFailedRedirect(request);
  }

  const accessTokenExpiresAt = new Date(
    Date.now() + expires_in * 1000,
  ).toISOString();
  const grantedScopes =
    typeof scope === "string" && scope.length > 0 ? scope : MICROSOFT_SCOPES;

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
    return connectionFailedRedirect(request);
  }

  const response = NextResponse.redirect(
    new URL("/connections/microsoft?connected=true", getBaseUrl(request)),
  );
  clearStateCookie(response);
  return response;
}
