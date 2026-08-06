import { createClient } from "@/lib/supabase/server";
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { MICROSOFT_SCOPES_STRING } from "@/lib/microsoft/scopes";

const MICROSOFT_SCOPES = MICROSOFT_SCOPES_STRING;

function getOAuthConfig() {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;

  if (!tenantId || !clientId || !redirectUri) {
    throw new Error("Microsoft OAuth is not configured");
  }

  return { tenantId, clientId, redirectUri };
}

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }

  let config;

  try {
    config = getOAuthConfig();
  } catch {
    return NextResponse.redirect(
      new URL("/connections/microsoft?error=connection_failed", baseUrl),
    );
  }

  const state = randomBytes(32).toString("base64url");
  const authUrl = new URL(
    `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`,
  );

  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", config.redirectUri);
  authUrl.searchParams.set("response_mode", "query");
  authUrl.searchParams.set("scope", MICROSOFT_SCOPES);
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("microsoft_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  return response;
}
