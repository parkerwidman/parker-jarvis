import { auth, UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { createClient } from "@/lib/supabase/server";
import {
  METRICOOL_MCP_URL,
  getMetricoolSocialRedirectPath,
} from "@/lib/jarvis/integrations/metricool/metricool-config";
import {
  loadMetricoolConnectionRow,
  upsertMetricoolConnecting,
} from "@/lib/jarvis/integrations/metricool/metricool-connection-tools";
import {
  generateOAuthState,
  setMetricoolOAuthCookies,
} from "@/lib/jarvis/integrations/metricool/metricool-oauth-cookies";
import { MetricoolOAuthProvider } from "@/lib/jarvis/integrations/metricool/metricool-oauth-provider";
import { verifyMetricoolConnection } from "@/lib/jarvis/integrations/metricool/metricool-client";
import { MetricoolSafeError } from "@/lib/jarvis/integrations/metricool/metricool-types";
import { NextRequest, NextResponse } from "next/server";

function getBaseUrl(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
}

function socialRedirect(
  request: NextRequest,
  params: Record<string, string>,
): NextResponse {
  const url = new URL(getMetricoolSocialRedirectPath(), getBaseUrl(request));
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

function buildAuthorizationRedirect(
  request: NextRequest,
  provider: MetricoolOAuthProvider,
  oauthState: string,
  userId: string,
): NextResponse | null {
  const authorizationUrl = provider.getAuthorizationUrl();
  if (!authorizationUrl) {
    return null;
  }

  try {
    const codeVerifier = provider.codeVerifier();
    const response = NextResponse.redirect(authorizationUrl);
    setMetricoolOAuthCookies(response, {
      state: oauthState,
      userId,
      codeVerifier,
    });
    return response;
  } catch {
    return null;
  }
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

  const existing = await loadMetricoolConnectionRow(supabase, userId);
  if (existing?.status === "connecting") {
    return socialRedirect(request, { status: "connecting" });
  }

  if (existing?.status === "connected") {
    return socialRedirect(request, { connected: "true" });
  }

  try {
    await upsertMetricoolConnecting(supabase, userId);
  } catch {
    return socialRedirect(request, { error: "connection_failed" });
  }

  const oauthState = generateOAuthState();

  const provider = new MetricoolOAuthProvider({
    userId,
    supabase,
    redirectOrigin: baseUrl,
    connectionRow: existing,
  });

  provider.setPendingOAuthValues(oauthState, "");

  try {
    const authResult = await auth(provider, {
      serverUrl: METRICOOL_MCP_URL,
    });

    if (authResult === "AUTHORIZED") {
      try {
        await verifyMetricoolConnection(provider, { runReadProbe: true });
        return socialRedirect(request, { connected: "true" });
      } catch {
        return socialRedirect(request, { error: "connection_failed" });
      }
    }
  } catch (caught) {
    if (caught instanceof UnauthorizedError) {
      const response = buildAuthorizationRedirect(
        request,
        provider,
        oauthState,
        userId,
      );
      if (response) {
        return response;
      }
    }

    if (caught instanceof MetricoolSafeError) {
      return socialRedirect(request, { error: "connection_failed" });
    }

    return socialRedirect(request, { error: "connection_failed" });
  }

  const redirectResponse = buildAuthorizationRedirect(
    request,
    provider,
    oauthState,
    userId,
  );
  if (redirectResponse) {
    return redirectResponse;
  }

  return socialRedirect(request, { error: "connection_failed" });
}
