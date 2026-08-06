import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

import {
  buildMicrosoftAuthorizeUrl,
  generateMicrosoftOAuthNonce,
  isAllowedMicrosoftOAuthReturnPath,
  microsoftConnectionsResultUrl,
  MICROSOFT_OAUTH_RESULT,
  parseMicrosoftConnectMode,
  setMicrosoftOAuthStateCookie,
} from "@/lib/microsoft/oauth-state";

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
  const returnPath = request.nextUrl.searchParams.get("return");

  if (returnPath && !isAllowedMicrosoftOAuthReturnPath(returnPath)) {
    return NextResponse.redirect(
      microsoftConnectionsResultUrl(baseUrl, MICROSOFT_OAUTH_RESULT.connectionFailed),
    );
  }

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

  let config;

  try {
    config = getOAuthConfig();
  } catch {
    return NextResponse.redirect(
      microsoftConnectionsResultUrl(baseUrl, MICROSOFT_OAUTH_RESULT.connectionFailed),
    );
  }

  const mode = parseMicrosoftConnectMode(request.nextUrl.searchParams);
  const state = generateMicrosoftOAuthNonce();
  const authUrl = buildMicrosoftAuthorizeUrl({
    tenantId: config.tenantId,
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state,
    mode,
  });

  const response = NextResponse.redirect(authUrl);
  setMicrosoftOAuthStateCookie(response, {
    state,
    userId,
    mode,
    issuedAt: Date.now(),
  });

  return response;
}
