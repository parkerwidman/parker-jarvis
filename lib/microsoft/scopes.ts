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

export function grantedScopesIncludeMailSend(grantedScopes: string): boolean {
  const normalized = grantedScopes.toLowerCase();
  return normalized.includes("mail.send");
}
