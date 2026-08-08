import "server-only";

import {
  getLocalDateString,
  resolveTimeZone,
} from "@/lib/jarvis/dashboard/command-center-utils";
import {
  loadMorningBriefingForRitualByDate,
  resolveMorningRitualPlaybackReadiness,
  type MorningRitualBriefing,
  type MorningRitualPlaybackReadiness,
} from "@/lib/jarvis/rituals/morning-ritual-briefing";
import {
  getDailyRitual,
  isValidCompletedDailyRitual,
} from "@/lib/jarvis/rituals/daily-ritual";
import type { SupabaseClient } from "@supabase/supabase-js";

export type MorningRitualState = "full_required" | "welcome_back";

export type MorningRitualStatus = "not_started" | "started" | "completed";

export type MorningRitualEntry = {
  displayName: string;
  timezone: string;
  ritualDate: string;
  ritualState: MorningRitualState;
  ritualStatus: MorningRitualStatus;
  briefingDate: string | null;
  briefing: MorningRitualBriefing | null;
  playbackReadiness: MorningRitualPlaybackReadiness;
};

export type {
  MorningRitualBriefing,
  MorningRitualPlaybackReadiness,
} from "@/lib/jarvis/rituals/morning-ritual-briefing";

export type MorningRitualRootRoute = "command_center" | "wake";

export function resolveMorningRitualRootRoute(
  entry: Pick<MorningRitualEntry, "ritualStatus" | "playbackReadiness">,
): MorningRitualRootRoute {
  if (entry.ritualStatus === "started" || entry.ritualStatus === "completed") {
    return "wake";
  }

  if (entry.playbackReadiness === "ready") {
    return "wake";
  }

  return "command_center";
}

export function resolveMorningRitualDisplayName(
  preferredName: string | null | undefined,
  email: string | null | undefined,
): string {
  const trimmedPreferredName = preferredName?.trim();

  if (trimmedPreferredName) {
    return trimmedPreferredName;
  }

  const emailLocalPart = email?.split("@")[0]?.trim();

  if (emailLocalPart) {
    return emailLocalPart;
  }

  return "there";
}

function mapRitualToEntryState(
  ritual: Awaited<ReturnType<typeof getDailyRitual>>,
): Pick<MorningRitualEntry, "ritualState" | "ritualStatus" | "briefingDate"> {
  if (!ritual) {
    return {
      ritualState: "full_required",
      ritualStatus: "not_started",
      briefingDate: null,
    };
  }

  if (ritual.status === "started") {
    return {
      ritualState: "full_required",
      ritualStatus: "started",
      briefingDate: ritual.briefingDate,
    };
  }

  if (isValidCompletedDailyRitual(ritual)) {
    return {
      ritualState: "welcome_back",
      ritualStatus: "completed",
      briefingDate: ritual.briefingDate,
    };
  }

  return {
    ritualState: "full_required",
    ritualStatus: "not_started",
    briefingDate: null,
  };
}

export async function loadMorningRitualEntry({
  supabase,
  userId,
  email,
  now = new Date(),
}: {
  supabase: SupabaseClient;
  userId: string;
  email?: string | null;
  now?: Date;
}): Promise<MorningRitualEntry> {
  const { data: profile, error: profileError } = await supabase
    .from("jarvis_profiles")
    .select("preferred_name, timezone")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    throw new Error("Could not load user profile.");
  }

  const timezone = resolveTimeZone(profile?.timezone);
  const ritualDate = getLocalDateString(timezone, now);
  const ritual = await getDailyRitual(supabase, userId, ritualDate, now);
  const ritualFields = mapRitualToEntryState(ritual);

  const briefingDateToLoad =
    ritualFields.ritualStatus === "started" && ritualFields.briefingDate
      ? ritualFields.briefingDate
      : ritualDate;

  const briefing = await loadMorningBriefingForRitualByDate({
    supabase,
    userId,
    briefingDate: briefingDateToLoad,
  });

  return {
    displayName: resolveMorningRitualDisplayName(profile?.preferred_name, email),
    timezone,
    ritualDate,
    ...ritualFields,
    briefing,
    playbackReadiness: resolveMorningRitualPlaybackReadiness(briefing),
  };
}
