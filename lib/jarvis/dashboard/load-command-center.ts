import "server-only";

import {
  buildCommandCenterView,
  type AttentionItem,
  type DashboardGoal,
  type DashboardSchedule,
  type FocusTask,
  type TaskGroups,
} from "@/lib/jarvis/dashboard/build-command-center-view";
import {
  formatLocalDateLabel,
  getCalendarFetchBounds,
  getLocalDateFromIso,
  getLocalDateString,
  resolveTimeZone,
} from "@/lib/jarvis/dashboard/command-center-utils";
import type { PlanItem } from "@/lib/jarvis/plans/generate-daily-plan";
import type { JarvisProfile, LifeArea } from "@/lib/jarvis/tools/memory-tools";
import {
  listOutlookCalendar,
  listOutlookInbox,
} from "@/lib/jarvis/tools/microsoft-tools";
import {
  resolveBriefPriorityText,
} from "@/lib/jarvis/briefings/morning-brief-display-metadata";
import { isMelusiLifeArea } from "@/lib/jarvis/dashboard/command-center-mode";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_APPROVALS = 5;
const MAX_PLAN_ITEMS = 6;
const MAX_BRIEF_PREVIEW_LINES = 4;
const MAX_INBOX_MESSAGES = 5;
const MAX_KANBAN_TASKS = 30;

type MorningBriefingRow = {
  id: string;
  briefing_date: string;
  status: string;
  content: string | null;
  safe_error_message: string | null;
  source_counts: unknown;
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
  progress: number;
  target_date: string | null;
  updated_at: string;
  success_definition: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
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
  lifeAreaName: string | null;
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
  locationName: string | null;
};

export type CommandCenterOutlook = {
  connected: boolean;
  needsReconnect: boolean;
  events: CommandCenterCalendarEvent[];
};

export type CommandCenterCounts = {
  unfinishedTasks: number;
  overdueTasks: number;
  pendingApprovals: number;
  activeGoals: number;
};

export type CommandCenterInboxMessage = {
  senderDisplay: string;
  subject: string;
  isRead: boolean;
};

export type CommandCenterInbox = {
  connected: boolean;
  needsReconnect: boolean;
  messages: CommandCenterInboxMessage[];
  unreadCount: number;
  emptyMessage: string | null;
};

export type CommandCenterKanbanTask = {
  id: string;
  title: string;
  status: string;
  lifeAreaName: string | null;
};

export type CommandCenterGoalProgress = {
  id: string;
  title: string;
  progress: number;
  lifeAreaName: string | null;
  progressLabel: string;
};

export type CommandCenterData = {
  preferredName: string | null;
  timezone: string;
  todayDate: string;
  todayDateLabel: string;
  headerStatus: string;
  briefing: CommandCenterBriefing | null;
  briefingTranscript: string | null;
  briefingPriorityText: string | null;
  plan: CommandCenterPlan | null;
  focusTask: FocusTask | null;
  taskGroups: TaskGroups;
  schedule: DashboardSchedule;
  goals: DashboardGoal[];
  goalItems: CommandCenterGoalProgress[];
  attentionItems: AttentionItem[];
  approvals: CommandCenterApproval[];
  outlook: CommandCenterOutlook;
  inbox: CommandCenterInbox;
  kanbanTasks: CommandCenterKanbanTask[];
  melusiLifeAreaIds: string[];
  counts: CommandCenterCounts;
};

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

export async function loadCommandCenter(
  supabase: SupabaseClient,
  userId: string,
): Promise<CommandCenterData> {
  const now = new Date();

  const { data: profileRow } = await supabase
    .from("jarvis_profiles")
    .select("user_id, preferred_name, timezone, current_focus")
    .eq("user_id", userId)
    .maybeSingle();

  const profile = (profileRow ?? null) as Pick<
    JarvisProfile,
    "user_id" | "preferred_name" | "timezone" | "current_focus"
  > | null;

  const timezone = resolveTimeZone(profile?.timezone);
  const todayDate = getLocalDateString(timezone, now);
  const todayDateLabel = formatLocalDateLabel(timezone, now);
  const preferredName = profile?.preferred_name?.trim() || null;
  const currentFocus = profile?.current_focus?.trim() || null;

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
      .select("id, briefing_date, status, content, safe_error_message, source_counts")
      .eq("user_id", userId)
      .eq("briefing_date", todayDate)
      .maybeSingle(),
    supabase
      .from("daily_plans")
      .select("id, plan_date, status, content, plan_items, safe_error_message")
      .eq("user_id", userId)
      .eq("plan_date", todayDate)
      .maybeSingle(),
    supabase
      .from("tasks")
      .select(
        "id, title, status, priority, due_at, completed_at, created_at, life_area_id",
      )
      .eq("user_id", userId),
    supabase
      .from("action_requests")
      .select("id, title, summary, risk_level, created_at")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(MAX_APPROVALS),
    supabase
      .from("goals")
      .select(
        "id, title, priority, status, life_area_id, progress, target_date, updated_at, success_definition",
      )
      .eq("user_id", userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false }),
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
  const taskRows = (tasksResult.data ?? []) as TaskRow[];
  const lifeAreas = (lifeAreasResult.data ?? []) as LifeArea[];
  const lifeAreaNames = new Map(lifeAreas.map((area) => [area.id, area.name]));

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

  const unfinishedTasks = taskRows.filter((task) => task.status !== "done");

  const approvalRows = (approvalsResult.data ?? []) as ActionRequestRow[];
  const approvals: CommandCenterApproval[] = approvalRows.map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    riskLevel: row.risk_level,
    createdAt: row.created_at,
  }));

  const goalRows = (goalsResult.data ?? []) as GoalRow[];

  const calendarBounds = getCalendarFetchBounds(todayDate, timezone);
  const [calendarResult, inboxResult] = await Promise.all([
    listOutlookCalendar(supabase, userId, {
      startDateTime: calendarBounds.startDateTime,
      endDateTime: calendarBounds.endDateTime,
      timeZone: timezone,
    }),
    listOutlookInbox(supabase, userId, { limit: MAX_INBOX_MESSAGES, unreadOnly: false }),
  ]);

  let outlook: CommandCenterOutlook = {
    connected: false,
    needsReconnect: false,
    events: [],
  };

  if (calendarResult.success) {
    outlook = {
      connected: true,
      needsReconnect: false,
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
          locationName: event.locationName,
        })),
    };
  } else if ("needsReconnect" in calendarResult && calendarResult.needsReconnect) {
    outlook = { connected: false, needsReconnect: true, events: [] };
  } else if ("needsConnection" in calendarResult && calendarResult.needsConnection) {
    outlook = { connected: false, needsReconnect: false, events: [] };
  } else {
    outlook = { connected: true, needsReconnect: false, events: [] };
  }

  const view = buildCommandCenterView({
    unfinishedTasks,
    allTasks: taskRows,
    todayLocal: todayDate,
    timeZone: timezone,
    lifeAreaNames,
    goalRows,
    calendarEvents: outlook.events,
    outlookConnected: outlook.connected,
    outlookNeedsReconnect: outlook.needsReconnect,
    approvals,
    briefing,
    plan,
    currentFocus,
    now,
  });

  const overdueTasksCount = unfinishedTasks.filter(
    (task) => task.due_at !== null && getLocalDateFromIso(task.due_at, timezone) < todayDate,
  ).length;

  const counts: CommandCenterCounts = {
    unfinishedTasks: unfinishedTasks.length,
    overdueTasks: overdueTasksCount,
    pendingApprovals: pendingCountResult.count ?? approvals.length,
    activeGoals: goalRows.length,
  };

  const briefingTranscript =
    briefingRow?.status === "completed" && briefingRow.content
      ? briefingRow.content.trim()
      : null;

  const briefingPriorityText = resolveBriefPriorityText({
    sourceCounts: briefingRow?.source_counts,
    transcript: briefingTranscript,
    currentFocus,
    focusTaskTitle: view.focusTask?.title ?? null,
  });

  let inbox: CommandCenterInbox = {
    connected: false,
    needsReconnect: false,
    messages: [],
    unreadCount: 0,
    emptyMessage: "Outlook is not connected. Connect Microsoft to see your inbox.",
  };

  if (inboxResult.success) {
    const messages = inboxResult.messages.map((message) => ({
      senderDisplay:
        message.senderName?.trim() ||
        message.senderAddress?.trim() ||
        "Unknown sender",
      subject: message.subject?.trim() || "(No subject)",
      isRead: message.isRead,
    }));

    inbox = {
      connected: true,
      needsReconnect: false,
      messages,
      unreadCount: messages.filter((message) => !message.isRead).length,
      emptyMessage:
        messages.length === 0 ? "No recent inbox messages." : null,
    };
  } else if ("needsReconnect" in inboxResult && inboxResult.needsReconnect) {
    inbox = {
      connected: false,
      needsReconnect: true,
      messages: [],
      unreadCount: 0,
      emptyMessage: "Microsoft 365 needs to be reconnected to show inbox.",
    };
  } else if ("needsConnection" in inboxResult && inboxResult.needsConnection) {
    inbox = {
      connected: false,
      needsReconnect: false,
      messages: [],
      unreadCount: 0,
      emptyMessage: "Outlook is not connected. Connect Microsoft to see your inbox.",
    };
  } else if (outlook.connected) {
    inbox = {
      connected: true,
      needsReconnect: false,
      messages: [],
      unreadCount: 0,
      emptyMessage: "Inbox could not be loaded right now.",
    };
  }

  const melusiLifeAreaIds = lifeAreas
    .filter((area) => isMelusiLifeArea(area.name))
    .map((area) => area.id);

  const kanbanTasks: CommandCenterKanbanTask[] = taskRows
    .filter((task) =>
      ["todo", "in_progress", "done"].includes(task.status),
    )
    .slice(0, MAX_KANBAN_TASKS)
    .map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      lifeAreaName:
        task.life_area_id !== null
          ? (lifeAreaNames.get(task.life_area_id) ?? null)
          : null,
    }));

  const goalItems: CommandCenterGoalProgress[] = goalRows.map((goal) => {
    const lifeAreaTaskCount = goal.life_area_id
      ? unfinishedTasks.filter((task) => task.life_area_id === goal.life_area_id)
          .length
      : 0;

    let progressLabel = "In progress";
    if (goal.progress > 0) {
      progressLabel = `${goal.progress}% complete`;
    } else if (lifeAreaTaskCount > 0) {
      progressLabel = `${lifeAreaTaskCount} active task${lifeAreaTaskCount === 1 ? "" : "s"}`;
    }

    return {
      id: goal.id,
      title: goal.title,
      progress: goal.progress,
      lifeAreaName:
        goal.life_area_id !== null
          ? (lifeAreaNames.get(goal.life_area_id) ?? null)
          : null,
      progressLabel,
    };
  });

  return {
    preferredName,
    timezone,
    todayDate,
    todayDateLabel,
    headerStatus: view.headerStatus,
    briefing,
    briefingTranscript,
    briefingPriorityText,
    plan,
    focusTask: view.focusTask,
    taskGroups: view.taskGroups,
    schedule: view.schedule,
    goals: view.goals,
    goalItems,
    attentionItems: view.attentionItems,
    approvals,
    outlook,
    inbox,
    kanbanTasks,
    melusiLifeAreaIds,
    counts,
  };
}
