const UNSAFE_HREF_PREFIXES = [
  "javascript:",
  "data:",
  "vbscript:",
  "file:",
];

export function isSafeMarkdownHref(href: string | undefined | null): boolean {
  if (!href) {
    return false;
  }

  const trimmed = href.trim();

  if (trimmed.length === 0) {
    return false;
  }

  const normalized = trimmed.toLowerCase();

  if (UNSAFE_HREF_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return false;
  }

  if (normalized.startsWith("//")) {
    return false;
  }

  return (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("mailto:") ||
    normalized.startsWith("/") ||
    normalized.startsWith("#") ||
    normalized.startsWith("tel:")
  );
}
