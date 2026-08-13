import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildActionableGoalTaskIndex,
  filterUnfinishedPlanningTasks,
  type ActionableGoalTaskContext,
  type PlanningGoalLevelRecord,
  type PlanningGoalRecord,
  type PlanningGoalTaskRecord,
} from "@/lib/jarvis/goals/actionable-goal-tasks";

export type DailyPlanGoalRecord = PlanningGoalRecord;

export type DailyPlanRawTaskRow = PlanningGoalTaskRecord & {
  priority: string;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  life_area_id: string | null;
  project_id: string | null;
};

export type DailyPlanTaskGoalContext = ActionableGoalTaskContext;

export type DailyPlanTask = {
  id: string;
  title: string;
  priority: string;
  due_at: string | null;
  overdue: boolean;
  dueToday: boolean;
  projectName?: string;
  goalContext: DailyPlanTaskGoalContext | null;
};

export type DailyPlanGoalSection = {
  goalId: string;
  goalTitle: string;
  levelTitle: string;
  isTodayPriority: boolean;
  tasks: DailyPlanTask[];
};

export type DailyPlanPlanningContext = {
  planningTasks: DailyPlanTask[];
  todayPriorityGoal: DailyPlanGoalSection | null;
  otherActionableGoals: DailyPlanGoalSection[];
  standaloneTasks: DailyPlanTask[];
  todayPriorityGoalId: string | null;
  eligibleCurrentFocusTaskId: string | null;
};

const PRIORITY_WEIGHT: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function getLocalDateFromIso(isoString: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoString));
}

export async function listDailyPlanTasks(
  supabase: SupabaseClient,
  userId: string,
): Promise<
  { success: true; tasks: DailyPlanRawTaskRow[] } | { success: false; error: string }
> {
  const { data, error } = await supabase
    .from("jarvis_visible_tasks")
    .select(
      "id, title, status, priority, due_at, completed_at, created_at, life_area_id, project_id, goal_id, goal_level_id, blocked_at, position",
    )
    .eq("user_id", userId)
    .neq("status", "done");

  if (error) {
    return { success: false, error: "Could not list tasks." };
  }

  return { success: true, tasks: (data ?? []) as DailyPlanRawTaskRow[] };
}

export async function loadDailyPlanProfilePlanningFields(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ todayPriorityGoalId: string | null; currentFocus: string | null }> {
  const { data, error } = await supabase
    .from("jarvis_profiles")
    .select("today_priority_goal_id, current_focus")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return { todayPriorityGoalId: null, currentFocus: null };
  }

  const row = data as {
    today_priority_goal_id: string | null;
    current_focus: string | null;
  };

  return {
    todayPriorityGoalId: row.today_priority_goal_id ?? null,
    currentFocus: row.current_focus?.trim() || null,
  };
}

export async function loadDailyPlanGoalRoadmap(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  goals: DailyPlanGoalRecord[];
  levels: PlanningGoalLevelRecord[];
}> {
  const { data: goalsData, error: goalsError } = await supabase
    .from("jarvis_goals")
    .select("id, title, goal_type, status")
    .eq("user_id", userId)
    .eq("goal_type", "short_term")
    .eq("status", "active");

  if (goalsError) {
    return { goals: [], levels: [] };
  }

  const goals = (goalsData ?? []) as DailyPlanGoalRecord[];

  if (goals.length === 0) {
    return { goals: [], levels: [] };
  }

  const goalIds = goals.map((goal) => goal.id);
  const { data: levelsData, error: levelsError } = await supabase
    .from("jarvis_goal_levels")
    .select("id, name, position, goal_id")
    .eq("user_id", userId)
    .in("goal_id", goalIds);

  if (levelsError) {
    return { goals, levels: [] };
  }

  return {
    goals,
    levels: (levelsData ?? []) as PlanningGoalLevelRecord[],
  };
}

export function buildDailyPlanActionableIndex(input: {
  goals: DailyPlanGoalRecord[];
  levels: PlanningGoalLevelRecord[];
  goalTasks: PlanningGoalTaskRecord[];
  todayPriorityGoalId: string | null;
}) {
  const priorityGoalIds = input.todayPriorityGoalId
    ? new Set([input.todayPriorityGoalId])
    : new Set<string>();

  return buildActionableGoalTaskIndex({
    goals: input.goals,
    levels: input.levels.filter((level) =>
      input.goals.some((goal) => goal.id === level.goal_id),
    ),
    goalTasks: input.goalTasks,
    priorityGoalIds,
  });
}

export function filterDailyPlanPlanningTasks<T extends PlanningGoalTaskRecord>(
  tasks: T[],
  actionableIndex: Map<string, ActionableGoalTaskContext>,
): T[] {
  return filterUnfinishedPlanningTasks(tasks, actionableIndex);
}

export function compareDailyPlanTasks(a: DailyPlanTask, b: DailyPlanTask): number {
  if (a.overdue !== b.overdue) {
    return a.overdue ? -1 : 1;
  }

  if (a.dueToday !== b.dueToday) {
    return a.dueToday ? -1 : 1;
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

  return a.title.localeCompare(b.title);
}

export function prepareDailyPlanTasks(
  tasks: DailyPlanRawTaskRow[],
  timeZone: string,
  planDate: string,
  actionableIndex: Map<string, ActionableGoalTaskContext>,
  projectNameByTaskId: Record<string, string> = {},
): DailyPlanTask[] {
  return tasks.map((task) => {
    const dueLocal = task.due_at
      ? getLocalDateFromIso(task.due_at, timeZone)
      : null;

    const projectName = projectNameByTaskId[task.id];

    return {
      id: task.id,
      title: task.title,
      priority: task.priority,
      due_at: task.due_at,
      overdue: dueLocal !== null && dueLocal < planDate,
      dueToday: dueLocal === planDate,
      ...(projectName ? { projectName } : {}),
      goalContext: actionableIndex.get(task.id) ?? null,
    };
  });
}

export function resolveEligibleCurrentFocusTaskId(
  planningTasks: DailyPlanTask[],
  currentFocus: string | null,
): string | null {
  const normalizedFocus = currentFocus?.trim().toLowerCase() ?? "";

  if (normalizedFocus.length === 0) {
    return null;
  }

  const match = planningTasks.find(
    (task) => task.title.trim().toLowerCase() === normalizedFocus,
  );

  return match?.id ?? null;
}

function buildGoalSection(
  goalId: string,
  goalsById: Map<string, DailyPlanGoalRecord>,
  tasksByGoalId: Map<string, DailyPlanTask[]>,
  isTodayPriority: boolean,
): DailyPlanGoalSection | null {
  const goal = goalsById.get(goalId);
  const goalTasks = tasksByGoalId.get(goalId) ?? [];

  if (!goal || goalTasks.length === 0) {
    return null;
  }

  const goalContext = goalTasks[0].goalContext;

  if (!goalContext) {
    return null;
  }

  return {
    goalId,
    goalTitle: goalContext.goalTitle,
    levelTitle: goalContext.levelTitle,
    isTodayPriority,
    tasks: [...goalTasks].sort(compareDailyPlanTasks),
  };
}

export function buildDailyPlanPlanningContext(input: {
  planningTasks: DailyPlanTask[];
  goals: DailyPlanGoalRecord[];
  todayPriorityGoalId: string | null;
  currentFocus: string | null;
}): DailyPlanPlanningContext {
  const goalsById = new Map(input.goals.map((goal) => [goal.id, goal]));
  const standaloneTasks = input.planningTasks
    .filter((task) => !task.goalContext)
    .sort(compareDailyPlanTasks);
  const tasksByGoalId = new Map<string, DailyPlanTask[]>();

  for (const task of input.planningTasks) {
    const goalId = task.goalContext?.goalId;

    if (!goalId) {
      continue;
    }

    const existing = tasksByGoalId.get(goalId) ?? [];
    existing.push(task);
    tasksByGoalId.set(goalId, existing);
  }

  const todayPriorityGoal =
    input.todayPriorityGoalId !== null
      ? buildGoalSection(
          input.todayPriorityGoalId,
          goalsById,
          tasksByGoalId,
          true,
        )
      : null;

  const otherActionableGoals: DailyPlanGoalSection[] = [];

  for (const goal of input.goals) {
    if (goal.id === input.todayPriorityGoalId) {
      continue;
    }

    const section = buildGoalSection(goal.id, goalsById, tasksByGoalId, false);

    if (section) {
      otherActionableGoals.push(section);
    }
  }

  return {
    planningTasks: input.planningTasks,
    todayPriorityGoal,
    otherActionableGoals,
    standaloneTasks,
    todayPriorityGoalId: input.todayPriorityGoalId,
    eligibleCurrentFocusTaskId: resolveEligibleCurrentFocusTaskId(
      input.planningTasks,
      input.currentFocus,
    ),
  };
}

function formatDailyPlanTaskLine(task: DailyPlanTask): string {
  const suffixes: string[] = [`id: ${task.id}`];

  if (task.overdue) {
    suffixes.push("overdue");
  } else if (task.dueToday) {
    suffixes.push("due today");
  }

  if (task.priority === "high") {
    suffixes.push("high priority");
  }

  if (task.projectName) {
    suffixes.push(`project: ${task.projectName}`);
  }

  return `- ${task.title} (${suffixes.join(", ")})`;
}

function formatGoalSection(section: DailyPlanGoalSection): string[] {
  return [
    `Goal: ${section.goalTitle}`,
    `Current level: ${section.levelTitle}`,
    "Actionable tasks:",
    ...section.tasks.map((task) => formatDailyPlanTaskLine(task)),
  ];
}

export function buildDailyPlanGoalPlanningPromptSections(
  planningContext: DailyPlanPlanningContext,
): string[] {
  const sections: string[] = [];

  if (planningContext.eligibleCurrentFocusTaskId) {
    const focusTask = planningContext.planningTasks.find(
      (task) => task.id === planningContext.eligibleCurrentFocusTaskId,
    );

    if (focusTask) {
      sections.push("ELIGIBLE CURRENT FOCUS TASK (highest scheduling priority)");
      sections.push(formatDailyPlanTaskLine(focusTask));
    }
  }

  if (planningContext.todayPriorityGoal) {
    sections.push("");
    sections.push("TODAY'S PRIORITY GOAL WORK");
    sections.push(...formatGoalSection(planningContext.todayPriorityGoal));
  }

  if (planningContext.otherActionableGoals.length > 0) {
    sections.push("");
    sections.push("OTHER ACTIONABLE GOAL WORK");

    for (const goalSection of planningContext.otherActionableGoals) {
      sections.push(...formatGoalSection(goalSection));
    }
  }

  if (planningContext.standaloneTasks.length > 0) {
    sections.push("");
    sections.push("STANDALONE TASKS");
    sections.push(
      ...planningContext.standaloneTasks.map((task) => formatDailyPlanTaskLine(task)),
    );
  }

  return sections;
}

export function buildDailyPlanTaskAllowlist(
  planningTasks: DailyPlanTask[],
): Set<string> {
  return new Set(planningTasks.map((task) => task.id));
}

export function buildDailyPlanPriorityInstructionSection(
  planningContext: DailyPlanPlanningContext,
  currentFocus: string | null,
): string {
  const lines: string[] = [
    "## Task scheduling priority hierarchy",
    "1. Eligible exact current focus task, when listed in the prompt, outranks all other task-backed work.",
    "2. Today's Priority Goal actionable tasks when that section is present.",
    "3. Overdue tasks, tasks due today, then high-priority tasks.",
    "4. Other actionable planning work from the prompt sections.",
    "- Use only task ids from the eligible planning sections when setting source to task.",
    "- Never invent task ids or schedule tasks not listed in the eligible planning sections.",
    "- Urgent standalone tasks remain eligible even when Today's Priority Goal work exists.",
  ];

  if (currentFocus && !planningContext.eligibleCurrentFocusTaskId) {
    lines.push(
      `- Profile current focus "${currentFocus}" is context only. It is not an eligible task id and must not become a task-backed block unless an exact eligible task match appears in the planning sections.`,
    );
  }

  if (planningContext.eligibleCurrentFocusTaskId) {
    const focusTask = planningContext.planningTasks.find(
      (task) => task.id === planningContext.eligibleCurrentFocusTaskId,
    );

    if (focusTask) {
      lines.push(
        `- Eligible current focus match: ${focusTask.title} (id: ${focusTask.id}). Schedule this before other task-backed work when appropriate.`,
      );
    }
  }

  if (
    planningContext.todayPriorityGoalId !== null &&
    planningContext.todayPriorityGoal === null
  ) {
    lines.push(
      "- Today's Priority Goal has no actionable current-level tasks right now. Do not boost it in scheduling.",
    );
  }

  return lines.join("\n");
}
