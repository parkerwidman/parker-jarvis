import "server-only";

import type {
  CommandCenterApproval,
  CommandCenterBriefing,
  CommandCenterCalendarEvent,
  CommandCenterGoal,
  CommandCenterPlan,
  CommandCenterTask,
} from "@/lib/jarvis/dashboard/load-command-center";
import {
  formatDurationMinutes,
  getLocalDateFromIso,
  minutesUntil,
} from "@/lib/jarvis/dashboard/command-center-utils";

const PRIORITY_WEIGHT: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export type DashboardTaskRecord = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  life_area_id: string | null;
};

export type FocusTask = CommandCenterTask & {
  lifeAreaName: string | null;
  selectionReason: string;
  nextAction: string | null;
};

export type TaskGroups = {
  next: CommandCenterTask[];
  later: CommandCenterTask[];
  additionalOverdueCount: number;
  completedTodayCount: number;
  dueTodayTotal: number;
};

export type ScheduleEventStatus = "current" | "next" | "upcoming" | "past";

export type ScheduleTimelineItem =
  | {
      kind: "event";
      event: CommandCenterCalendarEvent;
      status: ScheduleEventStatus;
      hasConflict: boolean;
      location: string | null;
    }
  | {
      kind: "open";
      label: string;
      until?: string;
    }
  | {
      kind: "tomorrow";
      event: CommandCenterCalendarEvent;
      label: string;
    };

export type DashboardSchedule = {
  connected: boolean;
  items: ScheduleTimelineItem[];
  emptyMessage: string | null;
};

export type DashboardGoal = CommandCenterGoal & {
  progressLabel: string;
  targetDateLabel: string | null;
  nextAction: string | null;
  milestoneLabel: string | null;
};

export type AttentionSeverity = "urgent" | "warning" | "informational";

export type AttentionItem = {
  id: string;
  severity: AttentionSeverity;
  message: string;
  href: string | null;
};

function isTaskOverdue(
  task: DashboardTaskRecord,
  todayLocal: string,
  timeZone: string,
): boolean {
  if (!task.due_at) {
    return false;
  }

  return getLocalDateFromIso(task.due_at, timeZone) < todayLocal;
}

function isTaskDueToday(
  task: DashboardTaskRecord,
  todayLocal: string,
  timeZone: string,
): boolean {
  if (!task.due_at) {
    return false;
  }

  return getLocalDateFromIso(task.due_at, timeZone) === todayLocal;
}

function compareDashboardTasks(
  a: DashboardTaskRecord,
  b: DashboardTaskRecord,
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
  task: DashboardTaskRecord,
  todayLocal: string,
  timeZone: string,
  lifeAreaName: string | null,
): CommandCenterTask {
  return {
    id: task.id,
    title: task.title,
    priority: task.priority,
    dueAt: task.due_at,
    overdue: isTaskOverdue(task, todayLocal, timeZone),
    dueToday: isTaskDueToday(task, todayLocal, timeZone),
    lifeAreaName,
  };
}

function getFocusSelectionReason(
  task: DashboardTaskRecord,
  todayLocal: string,
  timeZone: string,
  matchedProfileFocus: boolean,
): string {
  if (matchedProfileFocus) {
    return "Matches your current focus";
  }

  if (isTaskOverdue(task, todayLocal, timeZone) && task.priority === "high") {
    return "Overdue high-priority task";
  }

  if (isTaskOverdue(task, todayLocal, timeZone)) {
    return "Overdue task";
  }

  if (isTaskDueToday(task, todayLocal, timeZone)) {
    return "Due today with highest priority";
  }

  if (task.priority === "high") {
    return "Highest-priority open task";
  }

  return "Next open task in your queue";
}

function selectFocusTask(
  unfinishedTasks: DashboardTaskRecord[],
  todayLocal: string,
  timeZone: string,
  lifeAreaNames: Map<string, string>,
  activeGoalLifeAreaIds: Set<string>,
  currentFocus: string | null,
): FocusTask | null {
  if (unfinishedTasks.length === 0) {
    return null;
  }

  const sorted = [...unfinishedTasks].sort((a, b) =>
    compareDashboardTasks(a, b, todayLocal, timeZone),
  );

  const normalizedFocus = currentFocus?.trim().toLowerCase() ?? "";

  let selected = sorted[0];
  let matchedProfileFocus = false;

  if (normalizedFocus.length > 0) {
    const focusMatch = sorted.find(
      (task) => task.title.trim().toLowerCase() === normalizedFocus,
    );

    if (focusMatch) {
      selected = focusMatch;
      matchedProfileFocus = true;
    }
  }

  if (!matchedProfileFocus) {
    const overdueHigh = sorted.find(
      (task) => isTaskOverdue(task, todayLocal, timeZone) && task.priority === "high",
    );

    if (overdueHigh) {
      selected = overdueHigh;
    } else {
      const overdue = sorted.find((task) => isTaskOverdue(task, todayLocal, timeZone));

      if (overdue) {
        selected = overdue;
      } else {
        const dueToday = sorted.filter((task) =>
          isTaskDueToday(task, todayLocal, timeZone),
        );

        if (dueToday.length > 0) {
          selected = dueToday[0];
        } else {
          const highPriority = sorted.find((task) => task.priority === "high");

          if (highPriority) {
            selected = highPriority;
          } else {
            const goalLinked = sorted.find(
              (task) =>
                task.life_area_id !== null &&
                activeGoalLifeAreaIds.has(task.life_area_id),
            );

            selected = goalLinked ?? sorted[0];
          }
        }
      }
    }
  }

  const lifeAreaName =
    selected.life_area_id !== null
      ? (lifeAreaNames.get(selected.life_area_id) ?? null)
      : null;

  return {
    ...toCommandCenterTask(selected, todayLocal, timeZone, lifeAreaName),
    lifeAreaName,
    selectionReason: getFocusSelectionReason(
      selected,
      todayLocal,
      timeZone,
      matchedProfileFocus,
    ),
    nextAction: selected.title,
  };
}

function buildTaskGroups(
  unfinishedTasks: DashboardTaskRecord[],
  focusTaskId: string | null,
  todayLocal: string,
  timeZone: string,
  lifeAreaNames: Map<string, string>,
): TaskGroups {
  const sorted = [...unfinishedTasks]
    .filter((task) => task.id !== focusTaskId)
    .sort((a, b) => compareDashboardTasks(a, b, todayLocal, timeZone));

  const overdueTasks = sorted.filter((task) => isTaskOverdue(task, todayLocal, timeZone));
  const shownOverdue = overdueTasks.slice(0, 2);
  const remainingOverdue = Math.max(0, overdueTasks.length - shownOverdue.length);

  const nonOverdueQueue = sorted.filter(
    (task) => !isTaskOverdue(task, todayLocal, timeZone),
  );

  const nextCandidates = [
    ...shownOverdue,
    ...nonOverdueQueue.filter((task) => {
      if (shownOverdue.some((overdue) => overdue.id === task.id)) {
        return false;
      }

      return (
        isTaskDueToday(task, todayLocal, timeZone) ||
        task.priority === "high" ||
        task.due_at !== null
      );
    }),
    ...nonOverdueQueue,
  ];

  const seen = new Set<string>();
  const uniqueNext: DashboardTaskRecord[] = [];

  for (const task of nextCandidates) {
    if (seen.has(task.id)) {
      continue;
    }

    seen.add(task.id);
    uniqueNext.push(task);

    if (uniqueNext.length >= 3) {
      break;
    }
  }

  const laterCandidates = sorted.filter(
    (task) => !uniqueNext.some((nextTask) => nextTask.id === task.id),
  );

  const later = laterCandidates
    .slice(0, Math.max(0, 4 - uniqueNext.length))
    .map((task) =>
    toCommandCenterTask(
      task,
      todayLocal,
      timeZone,
      task.life_area_id ? (lifeAreaNames.get(task.life_area_id) ?? null) : null,
    ),
  );

  const next = uniqueNext.map((task) =>
    toCommandCenterTask(
      task,
      todayLocal,
      timeZone,
      task.life_area_id ? (lifeAreaNames.get(task.life_area_id) ?? null) : null,
    ),
  );

  const dueTodayTotal = unfinishedTasks.filter((task) =>
    isTaskDueToday(task, todayLocal, timeZone),
  ).length;

  return {
    next,
    later,
    additionalOverdueCount: remainingOverdue,
    completedTodayCount: 0,
    dueTodayTotal,
  };
}

function eventsOverlap(
  a: CommandCenterCalendarEvent,
  b: CommandCenterCalendarEvent,
): boolean {
  if (a.isAllDay || b.isAllDay) {
    return false;
  }

  const aStart = new Date(a.start).getTime();
  const aEnd = new Date(a.end).getTime();
  const bStart = new Date(b.start).getTime();
  const bEnd = new Date(b.end).getTime();

  return aStart < bEnd && bStart < aEnd;
}

function buildScheduleTimeline(
  events: CommandCenterCalendarEvent[],
  todayDate: string,
  timeZone: string,
  now = new Date(),
): ScheduleTimelineItem[] {
  const todayEvents = events
    .filter((event) => {
      const eventDate = getLocalDateFromIso(event.start, timeZone);
      return eventDate === todayDate;
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const tomorrowDate = (() => {
    const [year, month, day] = todayDate.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + 1, 12, 0, 0));
    return date.toISOString().slice(0, 10);
  })();

  const tomorrowEvents = events
    .filter((event) => getLocalDateFromIso(event.start, timeZone) === tomorrowDate)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const items: ScheduleTimelineItem[] = [];
  const nowMs = now.getTime();

  let currentEventId: string | null = null;
  let nextEventId: string | null = null;

  for (const event of todayEvents) {
    if (event.isAllDay) {
      continue;
    }

    const startMs = new Date(event.start).getTime();
    const endMs = new Date(event.end).getTime();

    if (startMs <= nowMs && endMs > nowMs) {
      currentEventId = event.id;
    } else if (startMs > nowMs && nextEventId === null) {
      nextEventId = event.id;
    }
  }

  for (let index = 0; index < todayEvents.length; index += 1) {
    const event = todayEvents[index];
    const hasConflict = todayEvents.some(
      (other) => other.id !== event.id && eventsOverlap(event, other),
    );

    let status: ScheduleEventStatus = "upcoming";

    if (event.isAllDay) {
      status = "upcoming";
    } else {
      const startMs = new Date(event.start).getTime();
      const endMs = new Date(event.end).getTime();

      if (startMs <= nowMs && endMs > nowMs) {
        status = "current";
      } else if (event.id === nextEventId) {
        status = "next";
      } else if (endMs <= nowMs) {
        status = "past";
      }
    }

    items.push({
      kind: "event",
      event,
      status,
      hasConflict,
      location: null,
    });

    const nextEvent = todayEvents[index + 1];

    if (!nextEvent || event.isAllDay || nextEvent.isAllDay) {
      continue;
    }

    const gapStart = new Date(event.end).getTime();
    const gapEnd = new Date(nextEvent.start).getTime();
    const gapMinutes = Math.round((gapEnd - gapStart) / 60000);

    if (gapMinutes >= 15 && gapStart >= nowMs - 60000) {
      items.push({
        kind: "open",
        label: formatDurationMinutes(gapMinutes),
        until: nextEvent.start,
      });
    }
  }

  const futureEvents = todayEvents.filter((event) => {
    if (event.isAllDay) {
      return true;
    }

    return new Date(event.start).getTime() > nowMs;
  });

  if (currentEventId === null && nextEventId === null && futureEvents.length > 0) {
    const firstFuture = futureEvents[0];

    if (!firstFuture.isAllDay) {
      const minutes = minutesUntil(firstFuture.start, now);

      if (minutes > 0) {
        items.unshift({
          kind: "open",
          label: `Next event in ${minutes} minute${minutes === 1 ? "" : "s"}`,
        });
      }
    }
  } else if (currentEventId !== null) {
    const current = todayEvents.find((event) => event.id === currentEventId);

    if (current && !current.isAllDay) {
      const next = todayEvents.find((event) => event.id === nextEventId);

      if (next && !next.isAllDay) {
        const openMinutes = Math.round(
          (new Date(next.start).getTime() - nowMs) / 60000,
        );

        if (openMinutes >= 15) {
          items.splice(
            items.findIndex(
              (item) => item.kind === "event" && item.event.id === nextEventId,
            ),
            0,
            {
              kind: "open",
              label: `Open until ${new Date(next.start).toLocaleString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                timeZone,
              })}`,
              until: next.start,
            },
          );
        }
      }
    }
  }

  if (tomorrowEvents.length > 0) {
    const firstTomorrow = tomorrowEvents[0];
    items.push({
      kind: "tomorrow",
      event: firstTomorrow,
      label: "Tomorrow",
    });
  }

  return items;
}

function compareGoals(
  a: CommandCenterGoal & {
    progress: number;
    target_date: string | null;
    updated_at: string;
    life_area_id: string | null;
  },
  b: CommandCenterGoal & {
    progress: number;
    target_date: string | null;
    updated_at: string;
    life_area_id: string | null;
  },
  todayLocal: string,
  goalLifeAreaTaskCounts: Map<string, number>,
): number {
  const aPriority = PRIORITY_WEIGHT[a.priority] ?? 1;
  const bPriority = PRIORITY_WEIGHT[b.priority] ?? 1;

  if (aPriority !== bPriority) {
    return aPriority - bPriority;
  }

  const aTarget = a.target_date ?? "9999-12-31";
  const bTarget = b.target_date ?? "9999-12-31";

  if (aTarget !== bTarget) {
    return aTarget.localeCompare(bTarget);
  }

  const aTasks = a.life_area_id ? (goalLifeAreaTaskCounts.get(a.life_area_id) ?? 0) : 0;
  const bTasks = b.life_area_id ? (goalLifeAreaTaskCounts.get(b.life_area_id) ?? 0) : 0;

  if (aTasks !== bTasks) {
    return bTasks - aTasks;
  }

  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
}

function buildGoalProgressLabel(progress: number, activeTaskCount: number): string {
  if (progress > 0) {
    return `${progress}% complete`;
  }

  if (activeTaskCount > 0) {
    return `${activeTaskCount} active task${activeTaskCount === 1 ? "" : "s"}`;
  }

  return "In progress";
}

function buildDashboardGoals(
  goalRows: Array<{
    id: string;
    title: string;
    priority: string;
    life_area_id: string | null;
    progress: number;
    target_date: string | null;
    updated_at: string;
    success_definition: string | null;
  }>,
  lifeAreaNames: Map<string, string>,
  goalLifeAreaTaskCounts: Map<string, number>,
  todayLocal: string,
  lifeAreaNextTask: Map<string, string>,
): DashboardGoal[] {
  const enriched = goalRows.map((goal) => ({
    ...goal,
    lifeAreaName:
      goal.life_area_id !== null
        ? (lifeAreaNames.get(goal.life_area_id) ?? null)
        : null,
  }));

  return [...enriched]
    .sort((a, b) =>
      compareGoals(a, b, todayLocal, goalLifeAreaTaskCounts),
    )
    .slice(0, 3)
    .map((goal) => {
      const activeTaskCount = goal.life_area_id
        ? (goalLifeAreaTaskCounts.get(goal.life_area_id) ?? 0)
        : 0;

      const nextAction = goal.life_area_id
        ? (lifeAreaNextTask.get(goal.life_area_id) ?? null)
        : null;

      return {
        id: goal.id,
        title: goal.title,
        priority: goal.priority,
        lifeAreaName: goal.lifeAreaName,
        progressLabel: buildGoalProgressLabel(goal.progress, activeTaskCount),
        targetDateLabel: goal.target_date
          ? new Date(`${goal.target_date}T12:00:00Z`).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              timeZone: "UTC",
            })
          : null,
        nextAction,
        milestoneLabel: null,
      };
    });
}

function buildAttentionItems(input: {
  unfinishedTasks: DashboardTaskRecord[];
  todayLocal: string;
  timeZone: string;
  approvals: CommandCenterApproval[];
  outlookConnected: boolean;
  outlookNeedsReconnect: boolean;
  calendarEvents: CommandCenterCalendarEvent[];
  briefing: CommandCenterBriefing | null;
  plan: CommandCenterPlan | null;
  dashboardGoals: DashboardGoal[];
}): AttentionItem[] {
  const items: AttentionItem[] = [];

  const overdueHigh = input.unfinishedTasks.filter(
    (task) =>
      isTaskOverdue(task, input.todayLocal, input.timeZone) &&
      task.priority === "high",
  );

  if (overdueHigh.length > 0) {
    items.push({
      id: "overdue-high",
      severity: "urgent",
      message: `${overdueHigh.length} high-priority overdue task${overdueHigh.length === 1 ? "" : "s"} need attention`,
      href: "/tasks",
    });
  }

  const conflicts = input.calendarEvents.filter((event, index, all) =>
    all.some((other) => other.id !== event.id && eventsOverlap(event, other)),
  );

  if (conflicts.length > 0) {
    items.push({
      id: "calendar-conflict",
      severity: "warning",
      message: "Calendar conflict detected today",
      href: "/connections/microsoft",
    });
  }

  const approvalRequired = input.approvals.find(
    (approval) => approval.riskLevel === "approval_required",
  );

  if (approvalRequired) {
    items.push({
      id: `approval-${approvalRequired.id}`,
      severity: "warning",
      message: `Approval waiting: ${approvalRequired.title}`,
      href: "/approvals",
    });
  } else if (input.approvals.length > 0) {
    items.push({
      id: "approvals-pending",
      severity: "informational",
      message: `${input.approvals.length} approval${input.approvals.length === 1 ? "" : "s"} waiting for review`,
      href: "/approvals",
    });
  }

  if (input.outlookNeedsReconnect) {
    items.push({
      id: "outlook-reconnect",
      severity: "warning",
      message: "Microsoft calendar connection needs reconnecting",
      href: "/connections/microsoft",
    });
  } else if (!input.outlookConnected) {
    items.push({
      id: "outlook-disconnected",
      severity: "informational",
      message: "Connect Microsoft to see your schedule",
      href: "/connections/microsoft",
    });
  }

  if (input.briefing?.status === "failed") {
    items.push({
      id: "brief-failed",
      severity: "warning",
      message: "Morning Brief failed to generate today",
      href: "/briefings",
    });
  }

  if (input.plan?.status === "failed") {
    items.push({
      id: "plan-failed",
      severity: "informational",
      message: "Daily Plan failed to generate today",
      href: "/plans",
    });
  }

  const goalWithoutAction = input.dashboardGoals.find(
    (goal) => goal.nextAction === null,
  );

  if (goalWithoutAction) {
    items.push({
      id: `goal-no-action-${goalWithoutAction.id}`,
      severity: "informational",
      message: `Goal "${goalWithoutAction.title}" has no next action assigned`,
      href: "/assistant",
    });
  }

  const severityOrder: Record<AttentionSeverity, number> = {
    urgent: 0,
    warning: 1,
    informational: 2,
  };

  return items
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, 3);
}

export function buildHeaderStatus(input: {
  currentFocus: string | null;
  focusTask: FocusTask | null;
  priorityTaskCount: number;
  todayEventCount: number;
}): string {
  if (input.currentFocus?.trim()) {
    return `Your main focus is ${input.currentFocus.trim()}.`;
  }

  if (input.focusTask) {
    return `Your top priority is ${input.focusTask.title}.`;
  }

  const parts: string[] = [];

  if (input.priorityTaskCount > 0) {
    parts.push(
      `${input.priorityTaskCount} priority task${input.priorityTaskCount === 1 ? "" : "s"}`,
    );
  }

  if (input.todayEventCount > 0) {
    parts.push(
      `${input.todayEventCount} scheduled event${input.todayEventCount === 1 ? "" : "s"} today`,
    );
  }

  if (parts.length > 0) {
    return `You have ${parts.join(" and ")}.`;
  }

  return "Your dashboard is clear for now.";
}

export function buildCommandCenterView(input: {
  unfinishedTasks: DashboardTaskRecord[];
  allTasks: DashboardTaskRecord[];
  todayLocal: string;
  timeZone: string;
  lifeAreaNames: Map<string, string>;
  goalRows: Array<{
    id: string;
    title: string;
    priority: string;
    life_area_id: string | null;
    progress: number;
    target_date: string | null;
    updated_at: string;
    success_definition: string | null;
  }>;
  calendarEvents: CommandCenterCalendarEvent[];
  outlookConnected: boolean;
  outlookNeedsReconnect: boolean;
  approvals: CommandCenterApproval[];
  briefing: CommandCenterBriefing | null;
  plan: CommandCenterPlan | null;
  currentFocus: string | null;
  now?: Date;
}): {
  focusTask: FocusTask | null;
  taskGroups: TaskGroups;
  schedule: DashboardSchedule;
  goals: DashboardGoal[];
  attentionItems: AttentionItem[];
  headerStatus: string;
} {
  const activeGoalLifeAreaIds = new Set(
    input.goalRows
      .map((goal) => goal.life_area_id)
      .filter((id): id is string => id !== null),
  );

  const goalLifeAreaTaskCounts = new Map<string, number>();
  const lifeAreaNextTask = new Map<string, string>();

  const sortedUnfinished = [...input.unfinishedTasks].sort((a, b) =>
    compareDashboardTasks(a, b, input.todayLocal, input.timeZone),
  );

  for (const task of sortedUnfinished) {
    if (!task.life_area_id) {
      continue;
    }

    goalLifeAreaTaskCounts.set(
      task.life_area_id,
      (goalLifeAreaTaskCounts.get(task.life_area_id) ?? 0) + 1,
    );

    if (!lifeAreaNextTask.has(task.life_area_id)) {
      lifeAreaNextTask.set(task.life_area_id, task.title);
    }
  }

  const focusTask = selectFocusTask(
    input.unfinishedTasks,
    input.todayLocal,
    input.timeZone,
    input.lifeAreaNames,
    activeGoalLifeAreaIds,
    input.currentFocus,
  );

  const taskGroups = buildTaskGroups(
    input.unfinishedTasks,
    focusTask?.id ?? null,
    input.todayLocal,
    input.timeZone,
    input.lifeAreaNames,
  );

  taskGroups.completedTodayCount = input.allTasks.filter(
    (task) =>
      task.status === "done" &&
      task.completed_at !== null &&
      getLocalDateFromIso(task.completed_at, input.timeZone) === input.todayLocal,
  ).length;

  const todayEvents = input.calendarEvents.filter(
    (event) => getLocalDateFromIso(event.start, input.timeZone) === input.todayLocal,
  );

  const scheduleItems = buildScheduleTimeline(
    input.calendarEvents,
    input.todayLocal,
    input.timeZone,
    input.now,
  );

  const schedule: DashboardSchedule = {
    connected: input.outlookConnected,
    items: scheduleItems,
    emptyMessage: input.outlookConnected
      ? todayEvents.length === 0
        ? "No events scheduled for today."
        : null
      : "Outlook is not connected. Connect Microsoft to see your schedule.",
  };

  const goals = buildDashboardGoals(
    input.goalRows,
    input.lifeAreaNames,
    goalLifeAreaTaskCounts,
    input.todayLocal,
    lifeAreaNextTask,
  );

  const attentionItems = buildAttentionItems({
    unfinishedTasks: input.unfinishedTasks,
    todayLocal: input.todayLocal,
    timeZone: input.timeZone,
    approvals: input.approvals,
    outlookConnected: input.outlookConnected,
    outlookNeedsReconnect: input.outlookNeedsReconnect,
    calendarEvents: todayEvents,
    briefing: input.briefing,
    plan: input.plan,
    dashboardGoals: goals,
  });

  const priorityTaskCount = input.unfinishedTasks.filter(
    (task) =>
      task.priority === "high" ||
      isTaskDueToday(task, input.todayLocal, input.timeZone) ||
      isTaskOverdue(task, input.todayLocal, input.timeZone),
  ).length;

  const headerStatus = buildHeaderStatus({
    currentFocus: input.currentFocus,
    focusTask,
    priorityTaskCount,
    todayEventCount: todayEvents.length,
  });

  return {
    focusTask,
    taskGroups,
    schedule,
    goals,
    attentionItems,
    headerStatus,
  };
}
