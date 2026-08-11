import "server-only";

import {
  getWhoopOAuthConfig,
  normalizeWhoopGrantedScopes,
  WHOOP_API_BASE,
  WHOOP_PROFILE_PATH,
  WHOOP_REVOKE_PATH,
  WHOOP_SCOPES_STRING,
  WHOOP_TOKEN_URL,
} from "@/lib/jarvis/integrations/whoop/whoop-config";
import {
  WHOOP_OAUTH_ERROR_CODES,
  WhoopOAuthError,
} from "@/lib/jarvis/integrations/whoop/whoop-oauth-errors";

export type WhoopTokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  grantedScopes: string[];
  tokenType: string | null;
};

export type WhoopBasicProfile = {
  user_id: number;
};

type WhoopTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

function validateTokenResponse(
  response: WhoopTokenResponse,
  requireRefreshToken: boolean,
): WhoopTokenPair {
  const accessToken = response.access_token;
  const refreshToken = response.refresh_token;
  const expiresIn = response.expires_in;

  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw new WhoopOAuthError(
      WHOOP_OAUTH_ERROR_CODES.tokenExchangeFailed,
      "WHOOP token response missing access token",
    );
  }

  if (
    requireRefreshToken &&
    (typeof refreshToken !== "string" || refreshToken.length === 0)
  ) {
    throw new WhoopOAuthError(
      WHOOP_OAUTH_ERROR_CODES.tokenExchangeFailed,
      "WHOOP token response missing refresh token",
    );
  }

  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new WhoopOAuthError(
      WHOOP_OAUTH_ERROR_CODES.tokenExchangeFailed,
      "WHOOP token response missing expiry",
    );
  }

  return {
    accessToken,
    refreshToken: refreshToken ?? "",
    expiresIn,
    grantedScopes: normalizeWhoopGrantedScopes(response.scope),
    tokenType:
      typeof response.token_type === "string" ? response.token_type : null,
  };
}

async function postWhoopTokenRequest(
  body: URLSearchParams,
  requireRefreshToken: boolean,
): Promise<WhoopTokenPair> {
  let response: Response;

  try {
    response = await fetch(WHOOP_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
  } catch {
    throw new WhoopOAuthError(
      WHOOP_OAUTH_ERROR_CODES.tokenExchangeFailed,
      "WHOOP token request failed",
    );
  }

  let payload: WhoopTokenResponse;

  try {
    payload = (await response.json()) as WhoopTokenResponse;
  } catch {
    throw new WhoopOAuthError(
      WHOOP_OAUTH_ERROR_CODES.tokenExchangeFailed,
      "WHOOP token response was invalid",
    );
  }

  if (!response.ok) {
    throw new WhoopOAuthError(
      WHOOP_OAUTH_ERROR_CODES.tokenExchangeFailed,
      "WHOOP token exchange failed",
    );
  }

  return validateTokenResponse(payload, requireRefreshToken);
}

export async function exchangeWhoopAuthorizationCode(params: {
  code: string;
  redirectUri: string;
}): Promise<WhoopTokenPair> {
  const { clientId, clientSecret } = getWhoopOAuthConfig();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: params.redirectUri,
  });

  return postWhoopTokenRequest(body, true);
}

export async function refreshWhoopTokenPair(
  refreshToken: string,
): Promise<WhoopTokenPair> {
  const { clientId, clientSecret } = getWhoopOAuthConfig();

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    scope: "offline",
  });

  const tokenPair = await postWhoopTokenRequest(body, true);

  if (tokenPair.refreshToken.length === 0) {
    throw new WhoopOAuthError(
      WHOOP_OAUTH_ERROR_CODES.tokenRefreshFailed,
      "WHOOP refresh response missing refresh token",
    );
  }

  return tokenPair;
}

export async function fetchWhoopBasicProfile(
  accessToken: string,
): Promise<WhoopBasicProfile> {
  let response: Response;

  try {
    response = await fetch(`${WHOOP_API_BASE}${WHOOP_PROFILE_PATH}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    throw new WhoopOAuthError(
      WHOOP_OAUTH_ERROR_CODES.profileInvalid,
      "WHOOP profile request failed",
    );
  }

  let payload: { user_id?: number };

  try {
    payload = (await response.json()) as { user_id?: number };
  } catch {
    throw new WhoopOAuthError(
      WHOOP_OAUTH_ERROR_CODES.profileInvalid,
      "WHOOP profile response was invalid",
    );
  }

  if (!response.ok) {
    throw new WhoopOAuthError(
      WHOOP_OAUTH_ERROR_CODES.profileInvalid,
      "WHOOP profile request rejected",
    );
  }

  if (
    typeof payload.user_id !== "number" ||
    !Number.isFinite(payload.user_id) ||
    payload.user_id <= 0
  ) {
    throw new WhoopOAuthError(
      WHOOP_OAUTH_ERROR_CODES.profileInvalid,
      "WHOOP profile missing user_id",
    );
  }

  return { user_id: payload.user_id };
}

export type WhoopRevokeResult =
  | { success: true; alreadyRevoked: boolean }
  | { success: false; retryable: boolean };

export async function revokeWhoopAccess(
  accessToken: string,
): Promise<WhoopRevokeResult> {
  let response: Response;

  try {
    response = await fetch(`${WHOOP_API_BASE}${WHOOP_REVOKE_PATH}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    return { success: false, retryable: true };
  }

  if (response.status === 204) {
    return { success: true, alreadyRevoked: false };
  }

  if (response.status === 401 || response.status === 404) {
    return { success: true, alreadyRevoked: true };
  }

  if (response.status >= 500) {
    return { success: false, retryable: true };
  }

  return { success: false, retryable: false };
}

export function buildWhoopAccessTokenExpiryIso(expiresInSeconds: number): string {
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

export function whoopScopesIncludeOffline(): boolean {
  return WHOOP_SCOPES_STRING.includes("offline");
}
