import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  mapJarvisScheduleRow,
  type ScheduleRow,
} from "@/lib/jarvis/schedule/schedule-row-mappers";
import type { JarvisSchedule } from "@/lib/jarvis/schedule/schedule-types";

const SCHEDULE_SELECT =
  "id, user_id, name, description, start_date, end_date, timezone, status, created_at, updated_at";

export async function getActiveScheduleForDate(
  supabase: SupabaseClient,
  userId: string,
  localDate: string,
): Promise<ScheduleRow | null> {
  const { data, error } = await supabase
    .from("jarvis_schedules")
    .select(SCHEDULE_SELECT)
    .eq("user_id", userId)
    .eq("status", "active")
    .lte("start_date", localDate)
    .gte("end_date", localDate)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as ScheduleRow;
}

export async function getActiveJarvisScheduleForDate(
  supabase: SupabaseClient,
  userId: string,
  localDate: string,
): Promise<JarvisSchedule | null> {
  const row = await getActiveScheduleForDate(supabase, userId, localDate);

  if (!row) {
    return null;
  }

  return mapJarvisScheduleRow(row);
}
