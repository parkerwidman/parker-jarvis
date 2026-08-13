import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  mapJarvisScheduleRow,
  type ScheduleRow,
} from "@/lib/jarvis/schedule/schedule-row-mappers";
import type { JarvisSchedule } from "@/lib/jarvis/schedule/schedule-types";

const SCHEDULE_SELECT =
  "id, user_id, name, description, start_date, end_date, timezone, status, created_at, updated_at";

export async function loadUserSchedules(
  supabase: SupabaseClient,
  userId: string,
): Promise<JarvisSchedule[]> {
  const { data, error } = await supabase
    .from("jarvis_schedules")
    .select(SCHEDULE_SELECT)
    .eq("user_id", userId)
    .order("start_date", { ascending: false });

  if (error || !data) {
    return [];
  }

  return (data as ScheduleRow[]).map(mapJarvisScheduleRow);
}
