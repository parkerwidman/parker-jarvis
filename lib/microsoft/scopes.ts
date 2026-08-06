export const MICROSOFT_OAUTH_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "User.Read",
  "Mail.ReadWrite",
  "Mail.Send",
  "Calendars.ReadWrite",
] as const;

export const MICROSOFT_SCOPES_STRING = MICROSOFT_OAUTH_SCOPES.join(" ");

export const MICROSOFT_MAIL_SEND_SCOPE = "Mail.Send" as const;

/** Stored when OAuth succeeded but the token response omitted scope. */
export const MICROSOFT_GRANTED_SCOPES_UNKNOWN = "";

export type MailSendPermissionState = "granted" | "missing" | "unknown";

export function normalizeGrantedScopes(scope: string): string {
  return scope.trim().replace(/\s+/g, " ");
}

export function isGrantedScopesUnknown(
  grantedScopes: string | null | undefined,
): boolean {
  return grantedScopes === null || grantedScopes === undefined || grantedScopes === "";
}

export function grantedScopesIncludeMailSend(grantedScopes: string): boolean {
  const normalized = grantedScopes.toLowerCase();
  return normalized.includes("mail.send");
}

export function resolveMailSendPermissionState(
  grantedScopes: string | null | undefined,
): MailSendPermissionState {
  if (isGrantedScopesUnknown(grantedScopes)) {
    return "unknown";
  }

  return grantedScopesIncludeMailSend(grantedScopes!) ? "granted" : "missing";
}

export function scopesWithoutMailSend(): string {
  return MICROSOFT_OAUTH_SCOPES.filter(
    (scope) => scope !== MICROSOFT_MAIL_SEND_SCOPE,
  ).join(" ");
}
