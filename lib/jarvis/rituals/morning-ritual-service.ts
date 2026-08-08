import "server-only";

import { isValidBriefingDate } from "@/lib/jarvis/audio/storage-path";
import {
  isMorningBriefingReadyForRitualStart,
  type MorningBriefingRowForRitual,
} from "@/lib/jarvis/rituals/morning-ritual-briefing";
import {
  completeDailyRitual,
  getDailyRitual,
  resolveUserRitualDate,
  startDailyRitualWithBriefing,
  type DailyRitual,
} from "@/lib/jarvis/rituals/daily-ritual";
import type { SupabaseClient } from "@supabase/supabase-js";

const RITUAL_START_BRIEFING_SELECT =
  "briefing_date, status, content, audio_status, audio_generated_at, audio_content_hash, audio_timeline, audio_timeline_content_hash, audio_duration_ms, audio_timeline_generated_at, audio_timeline_model, audio_timeline_error_code, recommended_mode, recommendation_sentence_index";

export type SafeDailyRitualState = {
  ritualDate: string;
  timezone: string;
  status: "started" | "completed";
  briefingDate: string | null;
  startedAt: string;
  completedAt: string | null;
};

export type StartMorningRitualResult =
  | {
      success: true;
      result: "started";
      ritual: SafeDailyRitualState;
      created: boolean;
      bound: boolean;
    }
  | {
      success: true;
      result: "already_started";
      ritual: SafeDailyRitualState;
    }
  | {
      success: true;
      result: "already_completed";
      ritual: SafeDailyRitualState;
    }
  | {
      success: false;
      error: string;
      code:
        | "invalid_request"
        | "not_found"
        | "briefing_not_ready"
        | "briefing_mismatch"
        | "unavailable";
    };

export type CompleteMorningRitualResult =
  | {
      success: true;
      result: "completed";
      ritual: SafeDailyRitualState;
    }
  | {
      success: true;
      result: "already_completed";
      ritual: SafeDailyRitualState;
    }
  | {
      success: false;
      error: string;
      code:
        | "invalid_request"
        | "not_started"
        | "briefing_mismatch"
        | "unavailable";
    };

export function toSafeDailyRitualState(ritual: DailyRitual): SafeDailyRitualState {
  return {
    ritualDate: ritual.ritualDate,
    timezone: ritual.timezone,
    status: ritual.status,
    briefingDate: ritual.briefingDate,
    startedAt: ritual.startedAt,
    completedAt: ritual.completedAt,
  };
}

async function loadOwnedMorningBriefingRow(
  supabase: SupabaseClient,
  userId: string,
  briefingDate: string,
): Promise<MorningBriefingRowForRitual | null> {
  const { data, error } = await supabase
    .from("morning_briefings")
    .select(RITUAL_START_BRIEFING_SELECT)
    .eq("user_id", userId)
    .eq("briefing_date", briefingDate)
    .maybeSingle();

  if (error) {
    throw new Error("Could not load morning briefing.");
  }

  return (data as MorningBriefingRowForRitual | null) ?? null;
}

export async function startMorningRitual({
  supabase,
  userId,
  briefingDate,
  now = new Date(),
}: {
  supabase: SupabaseClient;
  userId: string;
  briefingDate: string;
  now?: Date;
}): Promise<StartMorningRitualResult> {
  if (!isValidBriefingDate(briefingDate)) {
    return {
      success: false,
      error: "Invalid briefing date.",
      code: "invalid_request",
    };
  }

  let briefingRow: MorningBriefingRowForRitual | null;

  try {
    briefingRow = await loadOwnedMorningBriefingRow(
      supabase,
      userId,
      briefingDate,
    );
  } catch {
    return {
      success: false,
      error: "Morning briefing is unavailable.",
      code: "unavailable",
    };
  }

  if (!briefingRow) {
    return {
      success: false,
      error: "Morning briefing was not found.",
      code: "not_found",
    };
  }

  if (!isMorningBriefingReadyForRitualStart(briefingRow)) {
    return {
      success: false,
      error: "Morning briefing is not ready for ritual playback.",
      code: "briefing_not_ready",
    };
  }

  let ritualDate: string;

  try {
    ({ ritualDate } = await resolveUserRitualDate(supabase, userId, now));
  } catch {
    return {
      success: false,
      error: "Daily ritual is unavailable.",
      code: "unavailable",
    };
  }

  if (briefingDate !== ritualDate) {
    return {
      success: false,
      error: "Morning briefing date must match today's ritual date.",
      code: "briefing_mismatch",
    };
  }

  let startResult;

  try {
    startResult = await startDailyRitualWithBriefing({
      supabase,
      userId,
      ritualDate,
      briefingDate,
      now,
    });
  } catch {
    return {
      success: false,
      error: "Daily ritual is unavailable.",
      code: "unavailable",
    };
  }

  if (!startResult.success) {
    return {
      success: false,
      error: startResult.error,
      code: startResult.code,
    };
  }

  if (startResult.outcome === "already_completed") {
    return {
      success: true,
      result: "already_completed",
      ritual: toSafeDailyRitualState(startResult.ritual),
    };
  }

  if (startResult.outcome === "already_started") {
    return {
      success: true,
      result: "already_started",
      ritual: toSafeDailyRitualState(startResult.ritual),
    };
  }

  return {
    success: true,
    result: "started",
    ritual: toSafeDailyRitualState(startResult.ritual),
    created: startResult.outcome === "created",
    bound:
      startResult.outcome === "created" || startResult.outcome === "legacy_bound",
  };
}

export async function completeMorningRitual({
  supabase,
  userId,
  briefingDate,
  now = new Date(),
}: {
  supabase: SupabaseClient;
  userId: string;
  briefingDate: string;
  now?: Date;
}): Promise<CompleteMorningRitualResult> {
  if (!isValidBriefingDate(briefingDate)) {
    return {
      success: false,
      error: "Invalid briefing date.",
      code: "invalid_request",
    };
  }

  let ritualDate: string;

  try {
    ({ ritualDate } = await resolveUserRitualDate(supabase, userId, now));
  } catch {
    return {
      success: false,
      error: "Daily ritual is unavailable.",
      code: "unavailable",
    };
  }

  let existing: DailyRitual | null;

  try {
    existing = await getDailyRitual(supabase, userId, ritualDate, now);
  } catch {
    return {
      success: false,
      error: "Daily ritual is unavailable.",
      code: "unavailable",
    };
  }

  if (!existing) {
    return {
      success: false,
      error: "Daily ritual has not been started.",
      code: "not_started",
    };
  }

  if (existing.briefingDate !== briefingDate) {
    return {
      success: false,
      error: "Daily ritual is bound to a different briefing.",
      code: "briefing_mismatch",
    };
  }

  if (existing.status === "completed") {
    return {
      success: true,
      result: "already_completed",
      ritual: toSafeDailyRitualState(existing),
    };
  }

  const completeResult = await completeDailyRitual(
    supabase,
    userId,
    ritualDate,
    now,
  );

  if (!completeResult.success) {
    return {
      success: false,
      error: "Could not complete daily ritual.",
      code: "unavailable",
    };
  }

  return {
    success: true,
    result: "completed",
    ritual: toSafeDailyRitualState(completeResult.ritual),
  };
}
