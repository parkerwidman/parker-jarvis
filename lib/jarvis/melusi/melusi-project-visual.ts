export type MelusiProjectIconKind = "video" | "web" | "generic";

export function getMelusiProjectIconKind(name: string): MelusiProjectIconKind {
  const normalized = name.trim().toLowerCase();

  if (/video|seedance|reel|film|clip|content|youtube|tiktok/.test(normalized)) {
    return "video";
  }

  if (
    /website|web|outreach|automated|automation|maker|landing|site|email/.test(
      normalized,
    )
  ) {
    return "web";
  }

  return "generic";
}
