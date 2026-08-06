import "server-only";

export const MAX_PUBLIC_TOKEN_LENGTH = 512;

const PUBLIC_TOKEN_FORMAT_PATTERN =
  /^public-(?:sandbox|production)-[A-Za-z0-9-]+$/;

export function extractPublicTokenFromExchangeBody(body: unknown): string | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const record = body as Record<string, unknown>;
  const candidate = record.publicToken ?? record.public_token;

  if (typeof candidate !== "string") {
    return null;
  }

  const trimmed = candidate.trim();

  if (trimmed.length === 0 || trimmed.length > MAX_PUBLIC_TOKEN_LENGTH) {
    return null;
  }

  return trimmed;
}

export function isValidPlaidPublicTokenFormat(publicToken: string): boolean {
  return PUBLIC_TOKEN_FORMAT_PATTERN.test(publicToken);
}

export function parseExchangePublicToken(body: unknown): {
  publicToken: string;
} | null {
  const publicToken = extractPublicTokenFromExchangeBody(body);

  if (!publicToken || !isValidPlaidPublicTokenFormat(publicToken)) {
    return null;
  }

  return { publicToken };
}
