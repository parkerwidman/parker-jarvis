import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getLocalDateString,
  resolveTimeZone,
} from "@/lib/jarvis/dashboard/command-center-utils";

export type DailyRitualStatus = "started" | "completed";

export type DailyRitual = {
  userId: string;
  ritualDate: string;
  timezone: string;
  status: DailyRitualStatus;
  briefingDate: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ResolveUserRitualDateResult = {
  timezone: string;
  ritualDate: string;
};

export type StartDailyRitualResult =
  | { success: true; ritual: DailyRitual; created: boolean }
  | { success: false; error: string };

export type CompleteDailyRitualResult =
  | { success: true; ritual: DailyRitual }
  | { success: false; error: string; code: "not_started" | "update_failed" };

export type BindDailyRitualBriefingResult =
  | { success: true; ritual: DailyRitual; bound: boolean }
  | {
      success: false;
      error: string;
      code:
        | "not_started"
        | "already_completed"
        | "briefing_already_bound"
        | "update_failed";
    };

export type StartDailyRitualWithBriefingOutcome =
  | "created"
  | "already_started"
  | "legacy_bound"
  | "already_completed";

export type StartDailyRitualWithBriefingResult =
  | {
      success: true;
      ritual: DailyRitual;
      outcome: StartDailyRitualWithBriefingOutcome;
    }
  | {
      success: false;
      error: string;
      code: "briefing_mismatch" | "unavailable";
    };

type DailyRitualRow = {
  user_id: string;
  ritual_date: string;
  timezone: string;
  status: DailyRitualStatus;
  briefing_date: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

const RITUAL_SELECT =
  "user_id, ritual_date, timezone, status, briefing_date, started_at, completed_at, created_at, updated_at";

const UNIQUE_VIOLATION = "23505";

function mapDailyRitualRow(row: DailyRitualRow): DailyRitual {
  return {
    userId: row.user_id,
    ritualDate: row.ritual_date,
    timezone: row.timezone,
    status: row.status,
    briefingDate: row.briefing_date,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadUserTimezone(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("jarvis_profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error("Could not load user timezone.");
  }

  return resolveTimeZone(data?.timezone);
}

export async function resolveUserRitualDate(
  supabase: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<ResolveUserRitualDateResult> {
  const timezone = await loadUserTimezone(supabase, userId);

  return {
    timezone,
    ritualDate: getLocalDateString(timezone, now),
  };
}

async function loadDailyRitualRow(
  supabase: SupabaseClient,
  userId: string,
  ritualDate: string,
): Promise<DailyRitualRow | null> {
  const { data, error } = await supabase
    .from("jarvis_daily_rituals")
    .select(RITUAL_SELECT)
    .eq("user_id", userId)
    .eq("ritual_date", ritualDate)
    .maybeSingle();

  if (error) {
    throw new Error("Could not load daily ritual.");
  }

  return (data as DailyRitualRow | null) ?? null;
}

export async function getDailyRitual(
  supabase: SupabaseClient,
  userId: string,
  ritualDate?: string,
  now = new Date(),
): Promise<DailyRitual | null> {
  const resolvedDate =
    ritualDate ?? (await resolveUserRitualDate(supabase, userId, now)).ritualDate;
  const row = await loadDailyRitualRow(supabase, userId, resolvedDate);

  return row ? mapDailyRitualRow(row) : null;
}

export async function startDailyRitual(
  supabase: SupabaseClient,
  userId: string,
  ritualDate?: string,
  now = new Date(),
): Promise<StartDailyRitualResult> {
  const { timezone, ritualDate: resolvedDate } = ritualDate
    ? { timezone: await loadUserTimezone(supabase, userId), ritualDate }
    : await resolveUserRitualDate(supabase, userId, now);

  const existing = await loadDailyRitualRow(supabase, userId, resolvedDate);

  if (existing) {
    return {
      success: true,
      ritual: mapDailyRitualRow(existing),
      created: false,
    };
  }

  const startedAt = now.toISOString();

  const { data: inserted, error: insertError } = await supabase
    .from("jarvis_daily_rituals")
    .insert({
      user_id: userId,
      ritual_date: resolvedDate,
      timezone,
      status: "started",
      briefing_date: null,
      started_at: startedAt,
      completed_at: null,
    })
    .select(RITUAL_SELECT)
    .maybeSingle();

  if (!insertError && inserted) {
    return {
      success: true,
      ritual: mapDailyRitualRow(inserted as DailyRitualRow),
      created: true,
    };
  }

  if (insertError?.code !== UNIQUE_VIOLATION) {
    return { success: false, error: "Could not start daily ritual." };
  }

  const authoritative = await loadDailyRitualRow(supabase, userId, resolvedDate);

  if (!authoritative) {
    return { success: false, error: "Could not start daily ritual." };
  }

  return {
    success: true,
    ritual: mapDailyRitualRow(authoritative),
    created: false,
  };
}

export async function completeDailyRitual(
  supabase: SupabaseClient,
  userId: string,
  ritualDate?: string,
  now = new Date(),
): Promise<CompleteDailyRitualResult> {
  const resolvedDate =
    ritualDate ?? (await resolveUserRitualDate(supabase, userId, now)).ritualDate;
  const existing = await loadDailyRitualRow(supabase, userId, resolvedDate);

  if (!existing) {
    return {
      success: false,
      error: "Daily ritual has not been started.",
      code: "not_started",
    };
  }

  if (existing.status === "completed") {
    return {
      success: true,
      ritual: mapDailyRitualRow(existing),
    };
  }

  const completedAt = now.toISOString();

  const { data: updated, error: updateError } = await supabase
    .from("jarvis_daily_rituals")
    .update({
      status: "completed",
      completed_at: completedAt,
    })
    .eq("user_id", userId)
    .eq("ritual_date", resolvedDate)
    .eq("status", "started")
    .select(RITUAL_SELECT)
    .maybeSingle();

  if (updateError) {
    return {
      success: false,
      error: "Could not complete daily ritual.",
      code: "update_failed",
    };
  }

  if (updated) {
    return {
      success: true,
      ritual: mapDailyRitualRow(updated as DailyRitualRow),
    };
  }

  const authoritative = await loadDailyRitualRow(supabase, userId, resolvedDate);

  if (authoritative?.status === "completed") {
    return {
      success: true,
      ritual: mapDailyRitualRow(authoritative),
    };
  }

  return {
    success: false,
    error: "Could not complete daily ritual.",
    code: "update_failed",
  };
}

export async function bindDailyRitualBriefing({
  supabase,
  userId,
  ritualDate,
  briefingDate,
}: {
  supabase: SupabaseClient;
  userId: string;
  ritualDate: string;
  briefingDate: string;
}): Promise<BindDailyRitualBriefingResult> {
  const existing = await loadDailyRitualRow(supabase, userId, ritualDate);

  if (!existing) {
    return {
      success: false,
      error: "Daily ritual has not been started.",
      code: "not_started",
    };
  }

  if (existing.status === "completed") {
    return {
      success: false,
      error: "Completed daily rituals cannot bind a briefing.",
      code: "already_completed",
    };
  }

  if (existing.briefing_date === briefingDate) {
    return {
      success: true,
      ritual: mapDailyRitualRow(existing),
      bound: false,
    };
  }

  if (existing.briefing_date && existing.briefing_date !== briefingDate) {
    return {
      success: false,
      error: "Daily ritual already has a different briefing bound.",
      code: "briefing_already_bound",
    };
  }

  const { data: updated, error: updateError } = await supabase
    .from("jarvis_daily_rituals")
    .update({ briefing_date: briefingDate })
    .eq("user_id", userId)
    .eq("ritual_date", ritualDate)
    .eq("status", "started")
    .is("briefing_date", null)
    .select(RITUAL_SELECT)
    .maybeSingle();

  if (updateError) {
    return {
      success: false,
      error: "Could not bind daily ritual briefing.",
      code: "update_failed",
    };
  }

  if (updated) {
    return {
      success: true,
      ritual: mapDailyRitualRow(updated as DailyRitualRow),
      bound: true,
    };
  }

  const authoritative = await loadDailyRitualRow(supabase, userId, ritualDate);

  if (!authoritative) {
    return {
      success: false,
      error: "Daily ritual has not been started.",
      code: "not_started",
    };
  }

  if (authoritative.status === "completed") {
    return {
      success: false,
      error: "Completed daily rituals cannot bind a briefing.",
      code: "already_completed",
    };
  }

  if (authoritative.briefing_date === briefingDate) {
    return {
      success: true,
      ritual: mapDailyRitualRow(authoritative),
      bound: false,
    };
  }

  if (authoritative.briefing_date) {
    return {
      success: false,
      error: "Daily ritual already has a different briefing bound.",
      code: "briefing_already_bound",
    };
  }

  return {
    success: false,
    error: "Could not bind daily ritual briefing.",
    code: "update_failed",
  };
}

function classifyExistingRitualForBriefing(
  existing: DailyRitualRow,
  briefingDate: string,
):
  | { action: "already_completed"; ritual: DailyRitual }
  | { action: "already_started"; ritual: DailyRitual }
  | { action: "briefing_mismatch" }
  | { action: "legacy_bind" } {
  const ritual = mapDailyRitualRow(existing);

  if (existing.status === "completed") {
    return { action: "already_completed", ritual };
  }

  if (existing.briefing_date === briefingDate) {
    return { action: "already_started", ritual };
  }

  if (existing.briefing_date && existing.briefing_date !== briefingDate) {
    return { action: "briefing_mismatch" };
  }

  return { action: "legacy_bind" };
}

export async function startDailyRitualWithBriefing({
  supabase,
  userId,
  ritualDate,
  briefingDate,
  now = new Date(),
}: {
  supabase: SupabaseClient;
  userId: string;
  ritualDate: string;
  briefingDate: string;
  now?: Date;
}): Promise<StartDailyRitualWithBriefingResult> {
  const existing = await loadDailyRitualRow(supabase, userId, ritualDate);

  if (existing) {
    const classification = classifyExistingRitualForBriefing(
      existing,
      briefingDate,
    );

    if (classification.action === "already_completed") {
      return {
        success: true,
        ritual: classification.ritual,
        outcome: "already_completed",
      };
    }

    if (classification.action === "already_started") {
      return {
        success: true,
        ritual: classification.ritual,
        outcome: "already_started",
      };
    }

    if (classification.action === "briefing_mismatch") {
      return {
        success: false,
        error: "Daily ritual is already bound to a different briefing.",
        code: "briefing_mismatch",
      };
    }

    const bindResult = await bindDailyRitualBriefing({
      supabase,
      userId,
      ritualDate,
      briefingDate,
    });

    if (!bindResult.success) {
      if (bindResult.code === "briefing_already_bound") {
        return {
          success: false,
          error: "Daily ritual is already bound to a different briefing.",
          code: "briefing_mismatch",
        };
      }

      if (bindResult.code === "already_completed") {
        const authoritative = await loadDailyRitualRow(
          supabase,
          userId,
          ritualDate,
        );

        if (authoritative?.status === "completed") {
          return {
            success: true,
            ritual: mapDailyRitualRow(authoritative),
            outcome: "already_completed",
          };
        }
      }

      return {
        success: false,
        error: "Could not bind daily ritual briefing.",
        code: "unavailable",
      };
    }

    return {
      success: true,
      ritual: bindResult.ritual,
      outcome: bindResult.bound ? "legacy_bound" : "already_started",
    };
  }

  const timezone = await loadUserTimezone(supabase, userId);
  const startedAt = now.toISOString();

  const { data: inserted, error: insertError } = await supabase
    .from("jarvis_daily_rituals")
    .insert({
      user_id: userId,
      ritual_date: ritualDate,
      timezone,
      status: "started",
      briefing_date: briefingDate,
      started_at: startedAt,
      completed_at: null,
    })
    .select(RITUAL_SELECT)
    .maybeSingle();

  if (!insertError && inserted) {
    return {
      success: true,
      ritual: mapDailyRitualRow(inserted as DailyRitualRow),
      outcome: "created",
    };
  }

  if (insertError?.code !== UNIQUE_VIOLATION) {
    return {
      success: false,
      error: "Could not start daily ritual.",
      code: "unavailable",
    };
  }

  const authoritative = await loadDailyRitualRow(supabase, userId, ritualDate);

  if (!authoritative) {
    return {
      success: false,
      error: "Could not start daily ritual.",
      code: "unavailable",
    };
  }

  const classification = classifyExistingRitualForBriefing(
    authoritative,
    briefingDate,
  );

  if (classification.action === "already_completed") {
    return {
      success: true,
      ritual: classification.ritual,
      outcome: "already_completed",
    };
  }

  if (classification.action === "already_started") {
    return {
      success: true,
      ritual: classification.ritual,
      outcome: "already_started",
    };
  }

  if (classification.action === "briefing_mismatch") {
    return {
      success: false,
      error: "Daily ritual is already bound to a different briefing.",
      code: "briefing_mismatch",
    };
  }

  const bindResult = await bindDailyRitualBriefing({
    supabase,
    userId,
    ritualDate,
    briefingDate,
  });

  if (!bindResult.success) {
    if (bindResult.code === "briefing_already_bound") {
      return {
        success: false,
        error: "Daily ritual is already bound to a different briefing.",
        code: "briefing_mismatch",
      };
    }

    return {
      success: false,
      error: "Could not bind daily ritual briefing.",
      code: "unavailable",
    };
  }

  return {
    success: true,
    ritual: bindResult.ritual,
    outcome: bindResult.bound ? "legacy_bound" : "already_started",
  };
}
