import "server-only";

import {
  resolveMorningRitualRootRoute,
  type MorningRitualEntry,
} from "@/lib/jarvis/rituals/load-morning-ritual-entry";
import {
  isValidRitualDate,
  MORNING_RITUAL_BYPASS_COOKIE,
} from "@/lib/jarvis/rituals/morning-ritual-bypass-shared";

export {
  isValidRitualDate,
  MORNING_RITUAL_BYPASS_COOKIE,
  MORNING_RITUAL_BYPASS_MAX_AGE_SECONDS,
} from "@/lib/jarvis/rituals/morning-ritual-bypass-shared";

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
