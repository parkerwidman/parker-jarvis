import {
  isValidRitualDate,
  MORNING_RITUAL_BYPASS_COOKIE,
  MORNING_RITUAL_BYPASS_MAX_AGE_SECONDS,
} from "@/lib/jarvis/rituals/morning-ritual-bypass-shared";

export function buildMorningRitualBypassDocumentCookie(
  ritualDate: string,
  options?: { secure?: boolean },
): string | null {
  if (!isValidRitualDate(ritualDate)) {
    return null;
  }

  const secure =
    options?.secure ?? process.env.NODE_ENV === "production";
  const parts = [
    `${MORNING_RITUAL_BYPASS_COOKIE}=${ritualDate}`,
    "Path=/",
    `Max-Age=${MORNING_RITUAL_BYPASS_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function setMorningRitualBypassCookieInBrowser(
  ritualDate: string,
): boolean {
  const cookie = buildMorningRitualBypassDocumentCookie(ritualDate);

  if (!cookie) {
    return false;
  }

  document.cookie = cookie;
  return true;
}
