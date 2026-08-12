import "server-only";

import {
  getCalendarFetchBounds,
  getLocalDateFromIso,
  resolveTimeZone,
} from "@/lib/jarvis/dashboard/command-center-utils";
import { listOutlookCalendar } from "@/lib/jarvis/tools/microsoft-tools";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { FitnessGlanceSnapshot } from "@/lib/jarvis/fitness/fitness-today-types";

type TaskRow = {
  status: string;
  completed_at: string | null;
};

export async function loadFitnessGlance(
  supabase: SupabaseClient,
  userId: string,
  timeZone: string,
  todayDate: string,
): Promise<FitnessGlanceSnapshot> {
  const [tasksResult, goalsResult, calendarResult] = await Promise.all([
    supabase
      .from("jarvis_visible_tasks")
      .select("status, completed_at")
      .eq("user_id", userId),
    supabase
      .from("goals")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active"),
    listOutlookCalendar(supabase, userId, {
      ...getCalendarFetchBounds(todayDate, timeZone),
      timeZone,
    }),
  ]);

  const taskRows = (tasksResult.data ?? []) as TaskRow[];
  const openTasks = taskRows.filter((task) => task.status !== "done").length;
  const completedToday = taskRows.filter(
    (task) =>
      task.status === "done" &&
      task.completed_at !== null &&
      getLocalDateFromIso(task.completed_at, timeZone) === todayDate,
  ).length;
  const totalTracked = openTasks + completedToday;

  let meetingsToday = 0;

  if (calendarResult.success) {
    meetingsToday = calendarResult.events.filter((event) => {
      if (event.isCancelled) {
        return false;
      }

      const eventDate = getLocalDateFromIso(event.start, timeZone);
      return eventDate === todayDate;
    }).length;
  }

  return {
    openTasks,
    completedToday,
    totalTracked,
    meetingsToday,
    activeGoals: goalsResult.count ?? 0,
  };
}

export async function loadFitnessGlanceWithProfile(
  supabase: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<{ glance: FitnessGlanceSnapshot; timeZone: string; todayDate: string }> {
  const { data: profileRow } = await supabase
    .from("jarvis_profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();

  const timeZone = resolveTimeZone(profileRow?.timezone);
  const todayDate = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const glance = await loadFitnessGlance(supabase, userId, timeZone, todayDate);

  return { glance, timeZone, todayDate };
}
