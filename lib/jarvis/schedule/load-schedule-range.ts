import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getActiveScheduleForDate } from "@/lib/jarvis/schedule/get-active-schedule-for-date";
import {
  collectScheduleConflicts,
  resolveScheduleOccurrences,
} from "@/lib/jarvis/schedule/resolve-schedule-occurrences";
import {
  mapJarvisScheduleItemRow,
  mapJarvisScheduleOverrideRow,
  mapJarvisScheduleRow,
  type ScheduleItemRow,
  type ScheduleOverrideRow,
  type ScheduleRow,
} from "@/lib/jarvis/schedule/schedule-row-mappers";
import type { ScheduleRangeLoadResult } from "@/lib/jarvis/schedule/schedule-types";

const SCHEDULE_SELECT =
  "id, user_id, name, description, start_date, end_date, timezone, status, created_at, updated_at";

const ITEM_SELECT =
  "id, user_id, schedule_id, day_of_week, effective_start_date, effective_end_date, start_time, end_time, title, category, notes, metadata, sort_order, created_at, updated_at";

const OVERRIDE_SELECT =
  "id, user_id, schedule_id, schedule_item_id, occurrence_date, override_type, start_time, end_time, title, category, notes, metadata, created_at, updated_at";

export type LoadScheduleRangeParams = {
  userId: string;
  startDate: string;
  endDate: string;
  scheduleId?: string;
};

export type LoadScheduleRangeResult =
  | { success: true; data: ScheduleRangeLoadResult }
  | { success: false; error: string };

async function loadScheduleById(
  supabase: SupabaseClient,
  userId: string,
  scheduleId: string,
): Promise<ScheduleRow | null> {
  const { data, error } = await supabase
    .from("jarvis_schedules")
    .select(SCHEDULE_SELECT)
    .eq("user_id", userId)
    .eq("id", scheduleId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as ScheduleRow;
}

export async function loadScheduleRange(
  supabase: SupabaseClient,
  params: LoadScheduleRangeParams,
): Promise<LoadScheduleRangeResult> {
  const scheduleRow = params.scheduleId
    ? await loadScheduleById(supabase, params.userId, params.scheduleId)
    : await getActiveScheduleForDate(supabase, params.userId, params.startDate);

  if (!scheduleRow) {
    return { success: false, error: "No schedule found for the requested range." };
  }

  const schedule = mapJarvisScheduleRow(scheduleRow);

  const { data: itemRows, error: itemsError } = await supabase
    .from("jarvis_schedule_items")
    .select(ITEM_SELECT)
    .eq("user_id", params.userId)
    .eq("schedule_id", schedule.id)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  if (itemsError) {
    return { success: false, error: "Could not load schedule items." };
  }

  const { data: overrideRows, error: overridesError } = await supabase
    .from("jarvis_schedule_overrides")
    .select(OVERRIDE_SELECT)
    .eq("user_id", params.userId)
    .eq("schedule_id", schedule.id)
    .gte("occurrence_date", params.startDate)
    .lte("occurrence_date", params.endDate)
    .order("occurrence_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (overridesError) {
    return { success: false, error: "Could not load schedule overrides." };
  }

  const items = (itemRows ?? []).map((row) =>
    mapJarvisScheduleItemRow(row as ScheduleItemRow),
  );
  const overrides = (overrideRows ?? []).map((row) =>
    mapJarvisScheduleOverrideRow(row as ScheduleOverrideRow),
  );

  const occurrences = resolveScheduleOccurrences({
    schedule,
    items,
    overrides,
    startDate: params.startDate,
    endDate: params.endDate,
  });

  return {
    success: true,
    data: {
      schedule,
      items,
      overrides,
      occurrences,
      conflicts: collectScheduleConflicts(occurrences),
    },
  };
}
