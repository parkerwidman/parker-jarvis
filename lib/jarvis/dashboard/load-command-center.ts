import "server-only";

import type { PlanItem } from "@/lib/jarvis/plans/generate-daily-plan";
import type { JarvisProfile, LifeArea } from "@/lib/jarvis/tools/memory-tools";
import { listOutlookCalendar } from "@/lib/jarvis/tools/microsoft-tools";
import { listTasks, type TaskRecord } from "@/lib/jarvis/tools/task-tools";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_TIMEZONE = "America/Chicago";
const MAX_TASKS = 6;
const MAX_APPROVALS = 5;
const MAX_PLAN_ITEMS = 6;
const MAX_BRIEF_PREVIEW_LINES = 4;

const PRIORITY_WEIGHT: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

type MorningBriefingRow = {
  id: string;
  briefing_date: string;
  status: string;
  content: string | null;
  safe_error_message: string | null;
};

type DailyPlanRow = {
  id: string;
  plan_date: string;
  status: string;
  content: string | null;
  plan_items: unknown;
  safe_error_message: string | null;
};

type ActionRequestRow = {
  id: string;
  title: string;
  summary: string;
  risk_level: string;
  created_at: string;
};

type GoalRow = {
  id: string;
  title: string;
  priority: string;
  status: string;
  life_area_id: string | null;
};

export type CommandCenterBriefing = {
  id: string;
  status: string;
  preview: string | null;
  safeErrorMessage: string | null;
};

export type CommandCenterPlanItem = {
  title: string;
  startTime: string;
  endTime: string;
  isFixed: boolean;
  type: string;
};

export type CommandCenterPlan = {
  id: string;
  status: string;
  items: CommandCenterPlanItem[];
  safeErrorMessage: string | null;
};

export type CommandCenterTask = {
  id: string;
  title: string;
  priority: string;
  dueAt: string | null;
  overdue: boolean;
  dueToday: boolean;
};

export type CommandCenterApproval = {
  id: string;
  title: string;
  summary: string;
  riskLevel: string;
  createdAt: string;
};

export type CommandCenterGoal = {
  id: string;
  title: string;
  priority: string;
  lifeAreaName: string | null;
};

export type CommandCenterCalendarEvent = {
  id: string;
  subject: string;
  start: string;
  end: string;
  localStart: string;
  localEnd: string;
  isAllDay: boolean;
};

export type CommandCenterOutlook = {
  connected: boolean;
  events: CommandCenterCalendarEvent[];
};

export type CommandCenterCounts = {
  unfinishedTasks: number;
  overdueTasks: number;
  pendingApprovals: number;
  activeGoals: number;
};

export type CommandCenterData = {
  preferredName: string | null;
  timezone: string;
  todayDate: string;
  todayDateLabel: string;
  briefing: CommandCenterBriefing | null;
  plan: CommandCenterPlan | null;
  tasks: CommandCenterTask[];
  approvals: CommandCenterApproval[];
  goals: CommandCenterGoal[];
  outlook: CommandCenterOutlook;
  counts: CommandCenterCounts;
};

function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

function resolveTimeZone(profileTimezone: string | null | undefined): string {
  const candidate = profileTimezone?.trim();

  if (candidate && isValidTimeZone(candidate)) {
    return candidate;
  }

  return DEFAULT_TIMEZONE;
}

function getLocalDateString(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function getLocalDateFromIso(isoString: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoString));
}

function formatLocalDateLabel(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);
}

function parsePlanItems(raw: unknown): PlanItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter(
    (item): item is PlanItem =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as PlanItem).startTime === "string" &&
      typeof (item as PlanItem).title === "string",
  );
}

function extractBriefPreview(content: string): string {
  const previewLines: string[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    previewLines.push(trimmed);

    if (previewLines.length >= MAX_BRIEF_PREVIEW_LINES) {
      break;
    }
  }

  if (previewLines.length > 0) {
    return previewLines.join("\n");
  }

  const fallback = content.trim();
  return fallback.length > 280 ? `${fallback.slice(0, 277)}…` : fallback;
}

function isTaskOverdue(task: TaskRecord, todayLocal: string, timeZone: string): boolean {
  if (!task.due_at) {
    return false;
  }

  const dueLocal = getLocalDateFromIso(task.due_at, timeZone);
  return dueLocal < todayLocal;
}

function isTaskDueToday(task: TaskRecord, todayLocal: string, timeZone: string): boolean {
  if (!task.due_at) {
    return false;
  }

  return getLocalDateFromIso(task.due_at, timeZone) === todayLocal;
}

function compareDashboardTasks(
  a: TaskRecord,
  b: TaskRecord,
  todayLocal: string,
  timeZone: string,
): number {
  const aOverdue = isTaskOverdue(a, todayLocal, timeZone);
  const bOverdue = isTaskOverdue(b, todayLocal, timeZone);

  if (aOverdue !== bOverdue) {
    return aOverdue ? -1 : 1;
  }

  const aDueToday = isTaskDueToday(a, todayLocal, timeZone);
  const bDueToday = isTaskDueToday(b, todayLocal, timeZone);

  if (aDueToday !== bDueToday) {
    return aDueToday ? -1 : 1;
  }

  const aPriority = PRIORITY_WEIGHT[a.priority] ?? 1;
  const bPriority = PRIORITY_WEIGHT[b.priority] ?? 1;

  if (aPriority !== bPriority) {
    return aPriority - bPriority;
  }

  const aDue = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY;
  const bDue = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY;

  if (aDue !== bDue) {
    return aDue - bDue;
  }

  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function toCommandCenterTask(
  task: TaskRecord,
  todayLocal: string,
  timeZone: string,
): CommandCenterTask {
  return {
    id: task.id,
    title: task.title,
    priority: task.priority,
    dueAt: task.due_at,
    overdue: isTaskOverdue(task, todayLocal, timeZone),
    dueToday: isTaskDueToday(task, todayLocal, timeZone),
  };
}

function mapLifeAreaName(
  lifeAreaId: string | null,
  lifeAreas: LifeArea[],
): string | null {
  if (!lifeAreaId) {
    return null;
  }

  const match = lifeAreas.find((area) => area.id === lifeAreaId);
  return match?.name ?? null;
}

export async function loadCommandCenter(
  supabase: SupabaseClient,
  userId: string,
): Promise<CommandCenterData> {
  const now = new Date();

  const { data: profileRow } = await supabase
    .from("jarvis_profiles")
    .select("user_id, preferred_name, timezone")
    .eq("user_id", userId)
    .maybeSingle();

  const profile = (profileRow ?? null) as Pick<
    JarvisProfile,
    "user_id" | "preferred_name" | "timezone"
  > | null;

  const timezone = resolveTimeZone(profile?.timezone);
  const todayDate = getLocalDateString(timezone, now);
  const todayDateLabel = formatLocalDateLabel(timezone, now);
  const preferredName = profile?.preferred_name?.trim() || null;

  const [
    briefingResult,
    planResult,
    tasksResult,
    approvalsResult,
    goalsResult,
    lifeAreasResult,
    pendingCountResult,
  ] = await Promise.all([
    supabase
      .from("morning_briefings")
      .select("id, briefing_date, status, content, safe_error_message")
      .eq("user_id", userId)
      .eq("briefing_date", todayDate)
      .maybeSingle(),
    supabase
      .from("daily_plans")
      .select("id, plan_date, status, content, plan_items, safe_error_message")
      .eq("user_id", userId)
      .eq("plan_date", todayDate)
      .maybeSingle(),
    listTasks(supabase, userId),
    supabase
      .from("action_requests")
      .select("id, title, summary, risk_level, created_at")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(MAX_APPROVALS),
    supabase
      .from("goals")
      .select("id, title, priority, status, life_area_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    supabase
      .from("life_areas")
      .select("id, name, active, created_at")
      .eq("user_id", userId)
      .eq("active", true),
    supabase
      .from("action_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "pending"),
  ]);

  const briefingRow = (briefingResult.data ?? null) as MorningBriefingRow | null;
  const planRow = (planResult.data ?? null) as DailyPlanRow | null;

  const briefing: CommandCenterBriefing | null = briefingRow
    ? {
        id: briefingRow.id,
        status: briefingRow.status,
        preview:
          briefingRow.status === "completed" && briefingRow.content
            ? extractBriefPreview(briefingRow.content)
            : null,
        safeErrorMessage: briefingRow.safe_error_message,
      }
    : null;

  const planItems = parsePlanItems(planRow?.plan_items)
    .sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    )
    .slice(0, MAX_PLAN_ITEMS);

  const plan: CommandCenterPlan | null = planRow
    ? {
        id: planRow.id,
        status: planRow.status,
        items: planItems.map((item) => ({
          title: item.title,
          startTime: item.startTime,
          endTime: item.endTime,
          isFixed: item.isFixed,
          type: item.type,
        })),
        safeErrorMessage: planRow.safe_error_message,
      }
    : null;

  const unfinishedTasks =
    tasksResult.success === true
      ? tasksResult.tasks.filter((task) => task.status !== "done")
      : [];

  const dashboardTasks = [...unfinishedTasks]
    .sort((a, b) => compareDashboardTasks(a, b, todayDate, timezone))
    .slice(0, MAX_TASKS)
    .map((task) => toCommandCenterTask(task, todayDate, timezone));

  const overdueTasksCount = unfinishedTasks.filter((task) =>
    isTaskOverdue(task, todayDate, timezone),
  ).length;

  const approvalRows = (approvalsResult.data ?? []) as ActionRequestRow[];
  const approvals: CommandCenterApproval[] = approvalRows.map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    riskLevel: row.risk_level,
    createdAt: row.created_at,
  }));

  const lifeAreas = (lifeAreasResult.data ?? []) as LifeArea[];
  const goalRows = (goalsResult.data ?? []) as GoalRow[];
  const goals: CommandCenterGoal[] = goalRows.map((goal) => ({
    id: goal.id,
    title: goal.title,
    priority: goal.priority,
    lifeAreaName: mapLifeAreaName(goal.life_area_id, lifeAreas),
  }));

  const endDateTime = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const calendarResult = await listOutlookCalendar(supabase, userId, {
    startDateTime: now.toISOString(),
    endDateTime,
    timeZone: timezone,
  });

  let outlook: CommandCenterOutlook = {
    connected: false,
    events: [],
  };

  if (calendarResult.success) {
    outlook = {
      connected: true,
      events: calendarResult.events
        .filter((event) => !event.isCancelled)
        .map((event) => ({
          id: event.id,
          subject: event.subject,
          start: event.start,
          end: event.end,
          localStart: event.localStart,
          localEnd: event.localEnd,
          isAllDay: event.isAllDay,
        })),
    };
  } else if (
    !("needsConnection" in calendarResult) &&
    !("needsReconnect" in calendarResult)
  ) {
    outlook = { connected: true, events: [] };
  }

  const counts: CommandCenterCounts = {
    unfinishedTasks: unfinishedTasks.length,
    overdueTasks: overdueTasksCount,
    pendingApprovals: pendingCountResult.count ?? approvals.length,
    activeGoals: goals.length,
  };

  return {
    preferredName,
    timezone,
    todayDate,
    todayDateLabel,
    briefing,
    plan,
    tasks: dashboardTasks,
    approvals,
    goals,
    outlook,
    counts,
  };
}
