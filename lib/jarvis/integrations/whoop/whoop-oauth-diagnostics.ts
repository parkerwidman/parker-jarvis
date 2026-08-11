import "server-only";

export const WHOOP_OAUTH_PROVIDER_ERROR_ALLOWLIST = [
  "invalid_client",
  "invalid_grant",
  "invalid_request",
  "invalid_scope",
  "unauthorized_client",
  "unsupported_grant_type",
  "temporarily_unavailable",
  "server_error",
] as const;

export type WhoopOAuthProviderErrorCode =
  (typeof WHOOP_OAUTH_PROVIDER_ERROR_ALLOWLIST)[number];

export const WHOOP_UNKNOWN_OAUTH_ERROR = "unknown_oauth_error";

export type WhoopTokenRequestOperation = "token_exchange" | "token_refresh";

export type WhoopTokenRequestDiagnostic = {
  integration: "whoop";
  operation: WhoopTokenRequestOperation;
  httpStatus: number;
  oauthErrorCode: string;
};

const ALLOWED_PROVIDER_ERROR_CODES = new Set<string>(
  WHOOP_OAUTH_PROVIDER_ERROR_ALLOWLIST,
);

export function sanitizeWhoopOAuthProviderErrorCode(
  value: unknown,
): string {
  if (typeof value !== "string") {
    return WHOOP_UNKNOWN_OAUTH_ERROR;
  }

  const trimmed = value.trim();

  if (
    trimmed.length === 0 ||
    trimmed.length > 64 ||
    !/^[a-z0-9_]+$/.test(trimmed)
  ) {
    return WHOOP_UNKNOWN_OAUTH_ERROR;
  }

  if (!ALLOWED_PROVIDER_ERROR_CODES.has(trimmed)) {
    return WHOOP_UNKNOWN_OAUTH_ERROR;
  }

  return trimmed;
}

export function logWhoopTokenRequestDiagnostic(
  diagnostic: WhoopTokenRequestDiagnostic,
): void {
  console.error("[whoop-oauth]", diagnostic);
}
