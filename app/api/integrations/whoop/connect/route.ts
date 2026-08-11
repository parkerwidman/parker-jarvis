import { NextRequest, NextResponse } from "next/server";

import {
  buildWhoopAuthorizeUrl,
  generateWhoopOAuthState,
  setWhoopOAuthStateCookie,
  whoopIntegrationsStatusUrl,
} from "@/lib/jarvis/integrations/whoop/whoop-oauth-state";
import {
  getWhoopBaseUrl,
  getWhoopOAuthConfig,
  getWhoopRedirectUri,
} from "@/lib/jarvis/integrations/whoop/whoop-config";
import { toWhoopSafeErrorParam } from "@/lib/jarvis/integrations/whoop/whoop-oauth-errors";
import { createClient } from "@/lib/supabase/server";

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

  let clientId: string;

  try {
    ({ clientId } = getWhoopOAuthConfig());
  } catch {
    return NextResponse.redirect(
      whoopIntegrationsStatusUrl(
        baseUrl,
        "error",
        toWhoopSafeErrorParam("whoop_not_configured"),
      ),
    );
  }

  const state = generateWhoopOAuthState();
  const redirectUri = getWhoopRedirectUri(request.nextUrl.origin);
  const authUrl = buildWhoopAuthorizeUrl({
    clientId,
    redirectUri,
    state,
  });

  const response = NextResponse.redirect(authUrl);
  setWhoopOAuthStateCookie(response, {
    state,
    userId,
    issuedAt: Date.now(),
  });

  return response;
}
