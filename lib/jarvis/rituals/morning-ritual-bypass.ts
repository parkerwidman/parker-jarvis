import "server-only";

import {
  resolveMorningRitualRootRoute,
  type MorningRitualEntry,
} from "@/lib/jarvis/rituals/load-morning-ritual-entry";

export const MORNING_RITUAL_BYPASS_COOKIE = "jarvis-morning-ritual-bypass";

const RITUAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidRitualDate(value: string): boolean {
  return RITUAL_DATE_PATTERN.test(value);
}

export function isMorningRitualBypassActive(
  bypassRitualDate: string | null | undefined,
  ritualDate: string,
): boolean {
  if (!bypassRitualDate || !isValidRitualDate(bypassRitualDate)) {
    return false;
  }

  return bypassRitualDate === ritualDate;
}

export function shouldRedirectHomeToWake(input: {
  entry: Pick<MorningRitualEntry, "ritualStatus" | "playbackReadiness">;
  ritualDate: string;
  ritualEntry?: string;
  bypassRitualDate?: string | null;
}): boolean {
  if (input.ritualEntry === "complete") {
    return input.entry.ritualStatus !== "completed";
  }

  if (
    isMorningRitualBypassActive(input.bypassRitualDate, input.ritualDate)
  ) {
    return false;
  }

  return resolveMorningRitualRootRoute(input.entry) === "wake";
}
