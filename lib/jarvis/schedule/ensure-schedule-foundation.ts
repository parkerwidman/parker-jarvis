import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveTimeZone } from "@/lib/jarvis/dashboard/command-center-utils";
import {
  FALL_2026_BASELINE_END_DATE,
  FALL_2026_BASELINE_SCHEDULE_NAME,
  FALL_2026_BASELINE_START_DATE,
  serializeBaselineItemsForBootstrap,
} from "@/lib/jarvis/schedule/fall-2026-baseline-template";
import {
  mapJarvisScheduleRow,
  type ScheduleRow,
} from "@/lib/jarvis/schedule/schedule-row-mappers";
import type { JarvisSchedule } from "@/lib/jarvis/schedule/schedule-types";

const SCHEDULE_SELECT =
  "id, user_id, name, description, start_date, end_date, timezone, status, created_at, updated_at";

export type EnsureScheduleFoundationResult =
  | {
      success: true;
      schedule: JarvisSchedule;
      seeded: boolean;
      itemCount: number;
    }
  | { success: false; error: string };

type BootstrapRpcResult = {
  success?: boolean;
  seeded?: boolean;
  schedule_id?: string;
  item_count?: number;
  code?: string;
};

async function loadScheduleById(
  supabase: SupabaseClient,
  userId: string,
  scheduleId: string,
): Promise<JarvisSchedule | null> {
  const { data, error } = await supabase
    .from("jarvis_schedules")
    .select(SCHEDULE_SELECT)
    .eq("user_id", userId)
    .eq("id", scheduleId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return mapJarvisScheduleRow(data as ScheduleRow);
}

async function resolveProfileTimezone(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data } = await supabase
    .from("jarvis_profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();

  return resolveTimeZone(
    typeof data?.timezone === "string" ? data.timezone : null,
  );
}

export async function ensureScheduleFoundation(
  supabase: SupabaseClient,
  userId: string,
): Promise<EnsureScheduleFoundationResult> {
  const timezone = await resolveProfileTimezone(supabase, userId);

  const { data, error } = await supabase.rpc("bootstrap_jarvis_schedule_with_items", {
    p_name: FALL_2026_BASELINE_SCHEDULE_NAME,
    p_description: "Initial Fall 2026 weekly life structure.",
    p_start_date: FALL_2026_BASELINE_START_DATE,
    p_end_date: FALL_2026_BASELINE_END_DATE,
    p_timezone: timezone,
    p_status: "active",
    p_items: serializeBaselineItemsForBootstrap(),
  });

  if (error) {
    return {
      success: false,
      error: "Could not initialize the schedule foundation.",
    };
  }

  const result = data as BootstrapRpcResult;

  if (!result?.success || typeof result.schedule_id !== "string") {
    return {
      success: false,
      error: "Could not initialize the schedule foundation.",
    };
  }

  const schedule = await loadScheduleById(supabase, userId, result.schedule_id);

  if (!schedule) {
    return {
      success: false,
      error: "Could not load the initialized schedule.",
    };
  }

  return {
    success: true,
    schedule,
    seeded: result.seeded === true,
    itemCount: typeof result.item_count === "number" ? result.item_count : 0,
  };
}
