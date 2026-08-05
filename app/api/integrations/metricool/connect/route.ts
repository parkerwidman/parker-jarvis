import { auth, UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { createClient } from "@/lib/supabase/server";
import {
  METRICOOL_MCP_URL,
  getMetricoolBaseUrl,
  getMetricoolRedirectUri,
  getMetricoolSocialRedirectPath,
} from "@/lib/jarvis/integrations/metricool/metricool-config";
import {
  beginInitialMetricoolOAuth,
  hasUsableMetricoolCredentials,
  loadMetricoolConnectionRow,
  loadStoredClientInformationForRedirectUri,
  summarizeEncryptedClientInformation,
} from "@/lib/jarvis/integrations/metricool/metricool-connection-tools";
import {
  classifyConnectFailure,
  logMetricoolConnectDiagnostic,
  type MetricoolConnectSafeErrorCategory,
} from "@/lib/jarvis/integrations/metricool/metricool-connect-diagnostics";
import { clientInformationSupportsRedirectUri } from "@/lib/jarvis/integrations/metricool/metricool-client-information-store";
import {
  clearMetricoolOAuthCookies,
  generateOAuthState,
  isActiveMetricoolOAuthFlow,
  setMetricoolOAuthCookies,
} from "@/lib/jarvis/integrations/metricool/metricool-oauth-cookies";
import { MetricoolOAuthProvider } from "@/lib/jarvis/integrations/metricool/metricool-oauth-provider";
import {
  mapMetricoolError,
  verifyMetricoolConnection,
} from "@/lib/jarvis/integrations/metricool/metricool-client";
import { MetricoolSafeError } from "@/lib/jarvis/integrations/metricool/metricool-types";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

type ConnectDiagnostics = {
  connectionStatus?: string | null;
  hasEncryptedClientInformation?: boolean;
  hasEncryptedAccessCredentials?: boolean;
  redirectOrigin: string;
  callbackUrl: string;
  storedClientRedirectUris: string[];
  storedClientMatchesCallback: boolean;
  clientStorageVersion: number | "legacy" | "missing";
};

function socialRedirect(
  request: NextRequest,
  params: Record<string, string>,
  clearOAuthCookies: boolean,
): NextResponse {
  const baseUrl = getMetricoolBaseUrl(request.nextUrl.origin);
  const url = new URL(getMetricoolSocialRedirectPath(), baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = NextResponse.redirect(url);
  if (clearOAuthCookies) {
    clearMetricoolOAuthCookies(response);
  }
  return response;
}

function connectFailureRedirect(
  request: NextRequest,
  errorCategory: MetricoolConnectSafeErrorCategory,
): NextResponse {
  return socialRedirect(request, { error: errorCategory }, true);
}

function buildAuthorizationRedirect(
  provider: MetricoolOAuthProvider,
  oauthState: string,
  userId: string,
  diagnostics: ConnectDiagnostics,
): NextResponse | MetricoolConnectSafeErrorCategory {
  const authorizationUrl = provider.getAuthorizationUrl();
  if (!authorizationUrl) {
    logMetricoolConnectDiagnostic({
      stage: "build_authorization_url",
      ...diagnostics,
      errorCategory: "authorization_url_failed",
    });
    return "authorization_url_failed";
  }

  try {
    const codeVerifier = provider.codeVerifier();
    logMetricoolConnectDiagnostic({
      stage: "create_pkce",
      ...diagnostics,
    });

    const response = NextResponse.redirect(authorizationUrl);
    setMetricoolOAuthCookies(response, {
      state: oauthState,
      userId,
      codeVerifier,
    });

    logMetricoolConnectDiagnostic({
      stage: "write_oauth_cookies",
      ...diagnostics,
    });
    logMetricoolConnectDiagnostic({
      stage: "return_redirect",
      ...diagnostics,
      authResult: "REDIRECT",
    });

    return response;
  } catch (error) {
    logMetricoolConnectDiagnostic({
      stage: "create_pkce",
      ...diagnostics,
      errorCategory: "authorization_url_failed",
      errorClass: error instanceof Error ? error.name : "UnknownError",
    });
    return "authorization_url_failed";
  }
}

async function startMetricoolAuthorization(
  provider: MetricoolOAuthProvider,
  oauthState: string,
  userId: string,
  diagnostics: ConnectDiagnostics,
): Promise<
  | { kind: "redirect"; response: NextResponse }
  | { kind: "connected" }
  | { kind: "error"; errorCategory: MetricoolConnectSafeErrorCategory }
> {
  provider.setPendingOAuthValues(oauthState, "");

  logMetricoolConnectDiagnostic({
    stage: "create_oauth_state",
    ...diagnostics,
  });

  let authResult: string;

  try {
    authResult = await auth(provider, {
      serverUrl: METRICOOL_MCP_URL,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      const redirectResult = buildAuthorizationRedirect(
        provider,
        oauthState,
        userId,
        diagnostics,
      );
      if (redirectResult instanceof NextResponse) {
        return { kind: "redirect", response: redirectResult };
      }
      return { kind: "error", errorCategory: redirectResult };
    }

    logMetricoolConnectDiagnostic({
      stage: "dynamic_client_registration",
      ...diagnostics,
      errorCategory: classifyConnectFailure("dynamic_client_registration", error),
      errorClass: error instanceof Error ? error.name : "UnknownError",
    });

    if (
      error instanceof MetricoolSafeError &&
      error.code === "decryption_failed"
    ) {
      return {
        kind: "error",
        errorCategory: "oauth_client_registration_failed",
      };
    }

    return {
      kind: "error",
      errorCategory: classifyConnectFailure("dynamic_client_registration", error),
    };
  }

  logMetricoolConnectDiagnostic({
    stage: "dynamic_client_registration",
    ...diagnostics,
    authResult,
  });

  if (authResult === "AUTHORIZED") {
    try {
      await verifyMetricoolConnection(provider, { runReadProbe: true });
      logMetricoolConnectDiagnostic({
        stage: "return_redirect",
        ...diagnostics,
        authResult: "AUTHORIZED",
      });
      return { kind: "connected" };
    } catch (verifyError) {
      logMetricoolConnectDiagnostic({
        stage: "dynamic_client_registration",
        ...diagnostics,
        authResult: "AUTHORIZED",
        errorCategory: "oauth_verification_failed",
        errorClass:
          verifyError instanceof Error ? verifyError.name : "UnknownError",
      });

      const safeError = mapMetricoolError(verifyError);
      if (
        safeError.code === "auth_failed" ||
        safeError.code === "reconnect_required"
      ) {
        provider.clearInMemoryOAuthTokens();
        await provider.invalidateCredentials("tokens");

        try {
          const retryResult = await auth(provider, {
            serverUrl: METRICOOL_MCP_URL,
          });

          if (retryResult === "REDIRECT") {
            const redirectResult = buildAuthorizationRedirect(
              provider,
              oauthState,
              userId,
              diagnostics,
            );
            if (redirectResult instanceof NextResponse) {
              return { kind: "redirect", response: redirectResult };
            }
            return { kind: "error", errorCategory: redirectResult };
          }
        } catch (retryError) {
          logMetricoolConnectDiagnostic({
            stage: "dynamic_client_registration",
            ...diagnostics,
            errorCategory: "oauth_token_refresh_failed",
            errorClass:
              retryError instanceof Error ? retryError.name : "UnknownError",
          });
        }
      }

      return {
        kind: "error",
        errorCategory: "oauth_verification_failed",
      };
    }
  }

  if (authResult === "REDIRECT") {
    const redirectResult = buildAuthorizationRedirect(
      provider,
      oauthState,
      userId,
      diagnostics,
    );
    if (redirectResult instanceof NextResponse) {
      return { kind: "redirect", response: redirectResult };
    }
    return { kind: "error", errorCategory: redirectResult };
  }

  return { kind: "error", errorCategory: "authorization_url_failed" };
}

export async function GET(request: NextRequest) {
  const redirectOrigin = getMetricoolBaseUrl(request.nextUrl.origin);
  const callbackUrl = getMetricoolRedirectUri(request.nextUrl.origin);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return NextResponse.redirect(new URL("/login", redirectOrigin));
  }

  const userId =
    typeof data.claims.sub === "string" ? data.claims.sub : null;

  if (!userId) {
    return NextResponse.redirect(new URL("/login", redirectOrigin));
  }

  logMetricoolConnectDiagnostic({ stage: "authenticate" });

  let existing;

  try {
    existing = await loadMetricoolConnectionRow(supabase, userId);
  } catch (loadError) {
    logMetricoolConnectDiagnostic({
      stage: "load_connection",
      errorCategory: "connection_failed",
      errorClass: loadError instanceof Error ? loadError.name : "UnknownError",
    });
    return connectFailureRedirect(request, "connection_failed");
  }

  const cookieStore = await cookies();
  const oauthFlowActive = isActiveMetricoolOAuthFlow(cookieStore, userId);
  const hasEncryptedClientInformation = Boolean(
    existing?.encrypted_client_information,
  );
  const hasEncryptedAccessCredentials = hasUsableMetricoolCredentials(existing);
  const clientSummary = summarizeEncryptedClientInformation(
    existing?.encrypted_client_information,
  );
  const storedClient = loadStoredClientInformationForRedirectUri(
    existing?.encrypted_client_information,
    callbackUrl,
  );
  const storedClientMatchesCallback = Boolean(
    storedClient &&
      clientInformationSupportsRedirectUri(storedClient, callbackUrl),
  );

  const diagnostics: ConnectDiagnostics = {
    connectionStatus: existing?.status ?? null,
    hasEncryptedClientInformation,
    hasEncryptedAccessCredentials,
    redirectOrigin,
    callbackUrl,
    storedClientRedirectUris: clientSummary.redirectUris,
    storedClientMatchesCallback,
    clientStorageVersion: clientSummary.storageVersion,
  };

  logMetricoolConnectDiagnostic({
    stage: "load_connection",
    ...diagnostics,
  });

  logMetricoolConnectDiagnostic({
    stage: "resolve_redirect_uri",
    ...diagnostics,
  });

  if (existing?.status === "connected" && hasEncryptedAccessCredentials) {
    return socialRedirect(request, { connected: "true" }, true);
  }

  if (existing?.status === "connecting") {
    if (oauthFlowActive) {
      logMetricoolConnectDiagnostic({
        stage: "validate_client_redirect",
        ...diagnostics,
      });
    } else if (hasEncryptedAccessCredentials) {
      return socialRedirect(request, {}, true);
    }
  }

  logMetricoolConnectDiagnostic({
    stage: "validate_client_redirect",
    ...diagnostics,
  });

  if (hasEncryptedClientInformation) {
    logMetricoolConnectDiagnostic({
      stage: "decrypt_client_information",
      ...diagnostics,
    });
  }

  try {
    await beginInitialMetricoolOAuth(supabase, userId, existing);
  } catch (beginError) {
    logMetricoolConnectDiagnostic({
      stage: "save_client_information",
      ...diagnostics,
      errorCategory: "connection_failed",
      errorClass: beginError instanceof Error ? beginError.name : "UnknownError",
    });
    return connectFailureRedirect(request, "connection_failed");
  }

  const oauthState = generateOAuthState();
  const skipPersistedTokens =
    hasEncryptedAccessCredentials && existing?.status !== "connected";

  const provider = new MetricoolOAuthProvider({
    userId,
    supabase,
    redirectOrigin,
    connectionRow: existing,
    skipPersistedTokens,
  });

  const flowResult = await startMetricoolAuthorization(
    provider,
    oauthState,
    userId,
    diagnostics,
  );

  if (flowResult.kind === "connected") {
    return socialRedirect(request, { connected: "true" }, true);
  }

  if (flowResult.kind === "redirect") {
    return flowResult.response;
  }

  return connectFailureRedirect(request, flowResult.errorCategory);
}
