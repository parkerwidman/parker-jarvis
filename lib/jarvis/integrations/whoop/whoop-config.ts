import "server-only";

export const WHOOP_AUTHORIZE_URL =
  "https://api.prod.whoop.com/oauth/oauth2/auth";
export const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
export const WHOOP_API_BASE = "https://api.prod.whoop.com/developer";
export const WHOOP_PROFILE_PATH = "/v2/user/profile/basic";
export const WHOOP_REVOKE_PATH = "/v2/user/access";

export const WHOOP_REQUESTED_SCOPES = [
  "offline",
  "read:recovery",
  "read:cycles",
  "read:sleep",
  "read:workout",
  "read:profile",
  "read:body_measurement",
] as const;

export const WHOOP_SCOPES_STRING = WHOOP_REQUESTED_SCOPES.join(" ");

export const WHOOP_INTEGRATIONS_PATH = "/integrations/whoop";
export const WHOOP_CALLBACK_PATH = "/api/integrations/whoop/callback";

export const WHOOP_ACCESS_TOKEN_REFRESH_WINDOW_MS = 60_000;
export const WHOOP_REFRESH_CLAIM_STALE_SECONDS = 90;
export const WHOOP_REFRESH_WAIT_MAX_ATTEMPTS = 40;
export const WHOOP_REFRESH_WAIT_INTERVAL_MS = 250;
export const WHOOP_REFRESH_LOSER_MAX_WAIT_MS =
  WHOOP_REFRESH_WAIT_MAX_ATTEMPTS * WHOOP_REFRESH_WAIT_INTERVAL_MS;

export function getWhoopBaseUrl(fallbackOrigin: string): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim() || fallbackOrigin;
}

export function getWhoopRedirectUri(fallbackOrigin: string): string {
  const configured = process.env.WHOOP_REDIRECT_URI?.trim();
  if (configured) {
    return configured;
  }

  return `${getWhoopBaseUrl(fallbackOrigin)}${WHOOP_CALLBACK_PATH}`;
}

export function getWhoopOAuthConfig(): {
  clientId: string;
  clientSecret: string;
} {
  const clientId = process.env.WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("WHOOP OAuth is not configured");
  }

  return { clientId, clientSecret };
}

export function normalizeWhoopGrantedScopes(scope: string | undefined): string[] {
  if (typeof scope !== "string" || scope.trim().length === 0) {
    return [];
  }

  return scope
    .split(/\s+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}
