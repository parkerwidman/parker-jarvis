import { ScheduleDashboard } from "@/components/schedule/schedule-dashboard";
import { JarvisAppShell } from "@/components/jarvis/jarvis-app-shell";
import { JarvisAlert, JarvisEmptyState, JarvisPageContent } from "@/components/jarvis/jarvis-ui";
import { resolveTimeZone } from "@/lib/jarvis/dashboard/command-center-utils";
import { ensureScheduleFoundation } from "@/lib/jarvis/schedule/ensure-schedule-foundation";
import { loadScheduleRange } from "@/lib/jarvis/schedule/load-schedule-range";
import { loadUserSchedules } from "@/lib/jarvis/schedule/load-user-schedules";
import {
  buildScheduleWeekViewModel,
  getWeekEnd,
  parseWeekQueryParam,
  resolveDefaultWeekStart,
  resolveSelectedScheduleId,
} from "@/lib/jarvis/schedule/schedule-week-view";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type SchedulePageProps = {
  searchParams: Promise<{
    week?: string;
    schedule?: string;
  }>;
};

function getLocalDateString(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export default async function SchedulePage({ searchParams }: SchedulePageProps) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();

  if (authError || !authData?.claims) {
    redirect("/login");
  }

  const userId =
    typeof authData.claims.sub === "string" ? authData.claims.sub : null;

  if (!userId) {
    redirect("/login");
  }

  const params = await searchParams;

  const { data: profile } = await supabase
    .from("jarvis_profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();

  const timeZone = resolveTimeZone(
    typeof profile?.timezone === "string" ? profile.timezone : null,
  );
  const todayLocal = getLocalDateString(timeZone);

  const foundation = await ensureScheduleFoundation(supabase, userId);

  if (!foundation.success) {
    return (
      <JarvisAppShell mainClassName="app-main--command-center">
        <JarvisPageContent className="jv-page-content--scroll">
          <JarvisAlert variant="error">
            Jarvis could not initialize your schedule. Please try again.
          </JarvisAlert>
        </JarvisPageContent>
      </JarvisAppShell>
    );
  }

  const schedules = await loadUserSchedules(supabase, userId);
  const selectedScheduleId = resolveSelectedScheduleId(
    params.schedule,
    schedules,
    foundation.schedule.id,
  );

  const selectedSchedule =
    schedules.find((schedule) => schedule.id === selectedScheduleId) ??
    foundation.schedule;

  const defaultWeekStart = resolveDefaultWeekStart(todayLocal, selectedSchedule);
  const weekStart = parseWeekQueryParam(params.week, defaultWeekStart);
  const weekEnd = getWeekEnd(weekStart);

  const range = await loadScheduleRange(supabase, {
    userId,
    startDate: weekStart,
    endDate: weekEnd,
    scheduleId: selectedScheduleId,
  });

  if (!range.success) {
    return (
      <JarvisAppShell mainClassName="app-main--command-center">
        <JarvisPageContent className="jv-page-content--scroll">
          <JarvisEmptyState
            title="Schedule unavailable"
            description="Jarvis could not load your schedule for this week."
          />
        </JarvisPageContent>
      </JarvisAppShell>
    );
  }

  const viewModel = buildScheduleWeekViewModel({
    weekStart,
    todayLocal,
    schedule: range.data.schedule,
    occurrences: range.data.occurrences,
  });

  return (
    <JarvisAppShell mainClassName="app-main--command-center">
      <ScheduleDashboard
        schedules={schedules.length > 0 ? schedules : [foundation.schedule]}
        selectedScheduleId={selectedScheduleId}
        todayLocal={todayLocal}
        viewModel={viewModel}
      />
    </JarvisAppShell>
  );
}
