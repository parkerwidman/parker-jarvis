const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F-\u009F]/g;

export function sanitizePlainText(value: string): string {
  return value.replace(CONTROL_CHAR_PATTERN, "").trim();
}

export function normalizeOptionalPlainText(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const sanitized = sanitizePlainText(value);
  return sanitized.length > 0 ? sanitized : null;
}
