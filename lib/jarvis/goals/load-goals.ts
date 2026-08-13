import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildGoalLevelViews,
  computeGoalProgressPercent,
  type RawGoalLevel,
  type RawGoalTask,
} from "./goal-roadmap";
import type {
  GoalView,
  GoalsPageCounts,
  GoalsPageData,
  JarvisGoalDomain,
  JarvisGoalStatus,
  JarvisGoalType,
} from "./types";

type JarvisGoalRow = {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  target_date: string | null;
  domain: JarvisGoalDomain;
  status: JarvisGoalStatus;
  sort_order: number;
  completed_at: string | null;
  created_at: string;
};

type JarvisGoalPriorityRow = {
  goal_id: string;
};

function groupTasksByLevelId(tasks: RawGoalTask[]): Map<string, RawGoalTask[]> {
  const grouped = new Map<string, RawGoalTask[]>();

  for (const task of tasks) {
    if (!task.goal_level_id) {
      continue;
    }

    const existing = grouped.get(task.goal_level_id) ?? [];
    existing.push(task);
    grouped.set(task.goal_level_id, existing);
  }

  return grouped;
}

function groupLevelsByGoalId(levels: RawGoalLevel[]): Map<string, RawGoalLevel[]> {
  const grouped = new Map<string, RawGoalLevel[]>();

  for (const level of levels) {
    const existing = grouped.get(level.goal_id) ?? [];
    existing.push(level);
    grouped.set(level.goal_id, existing);
  }

  return grouped;
}

function compareGoals(left: JarvisGoalRow, right: JarvisGoalRow): number {
  const leftCompleted = left.status === "completed" ? 1 : 0;
  const rightCompleted = right.status === "completed" ? 1 : 0;

  if (leftCompleted !== rightCompleted) {
    return leftCompleted - rightCompleted;
  }

  if (left.sort_order !== right.sort_order) {
    return left.sort_order - right.sort_order;
  }

  return left.created_at.localeCompare(right.created_at);
}

function buildGoalView(
  goal: JarvisGoalRow,
  levels: RawGoalLevel[],
  tasksByLevelId: Map<string, RawGoalTask[]>,
  priorityGoalId: string | null,
): GoalView {
  const progressPercent =
    goal.status === "completed"
      ? 100
      : computeGoalProgressPercent(levels, tasksByLevelId);

  const isCurrentPriority =
    goal.status === "active" &&
    priorityGoalId !== null &&
    priorityGoalId === goal.id;

  return {
    id: goal.id,
    title: goal.title,
    description: goal.description,
    notes: goal.notes,
    targetDate: goal.target_date,
    domain: goal.domain,
    status: goal.status,
    sortOrder: goal.sort_order,
    completedAt: goal.completed_at,
    progressPercent,
    levels: buildGoalLevelViews(levels, tasksByLevelId),
    isCurrentPriority,
    isTodayPriority: isCurrentPriority,
  };
}

function buildCounts(goals: GoalView[], priorityGoalId: string | null): GoalsPageCounts {
  const activeGoals = goals.filter((goal) => goal.status !== "completed");
  const completedGoals = goals.filter((goal) => goal.status === "completed");

  return {
    all: goals.length,
    active: activeGoals.length,
    completed: completedGoals.length,
    priority: priorityGoalId !== null && activeGoals.some((goal) => goal.id === priorityGoalId)
      ? 1
      : 0,
  };
}

export async function loadGoals(
  supabase: SupabaseClient,
  userId: string,
  goalType: JarvisGoalType,
  domain: JarvisGoalDomain,
): Promise<GoalsPageData> {
  const [priorityResult, goalsResult] = await Promise.all([
    supabase
      .from("jarvis_goal_priorities")
      .select("goal_id")
      .eq("user_id", userId)
      .eq("domain", domain)
      .eq("goal_type", goalType)
      .maybeSingle(),
    supabase
      .from("jarvis_goals")
      .select(
        "id, title, description, notes, target_date, domain, status, sort_order, completed_at, created_at",
      )
      .eq("user_id", userId)
      .eq("goal_type", goalType)
      .eq("domain", domain)
      .neq("status", "archived")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (priorityResult.error) {
    throw priorityResult.error;
  }

  if (goalsResult.error) {
    throw goalsResult.error;
  }

  const priorityRow = priorityResult.data as JarvisGoalPriorityRow | null;
  const priorityGoalId = priorityRow?.goal_id ?? null;
  const goalRows = (goalsResult.data ?? []) as JarvisGoalRow[];
  const goalIds = goalRows.map((goal) => goal.id);

  if (goalIds.length === 0) {
    const counts = buildCounts([], priorityGoalId);
    return {
      goalType,
      domain,
      priorityGoalId,
      todayPriorityGoalId: priorityGoalId,
      goals: [],
      counts,
    };
  }

  const [levelsResult, tasksResult] = await Promise.all([
    supabase
      .from("jarvis_goal_levels")
      .select("id, name, position, goal_id")
      .eq("user_id", userId)
      .in("goal_id", goalIds)
      .order("position", { ascending: true }),
    supabase
      .from("tasks")
      .select(
        "id, title, status, position, notes, due_at, blocked_at, blocked_reason, goal_level_id",
      )
      .eq("user_id", userId)
      .in("goal_id", goalIds)
      .order("position", { ascending: true, nullsFirst: false }),
  ]);

  if (levelsResult.error) {
    throw levelsResult.error;
  }

  if (tasksResult.error) {
    throw tasksResult.error;
  }

  const levelsByGoalId = groupLevelsByGoalId(
    (levelsResult.data ?? []) as RawGoalLevel[],
  );
  const tasksByLevelId = groupTasksByLevelId(
    (tasksResult.data ?? []) as RawGoalTask[],
  );

  const goals = goalRows
    .slice()
    .sort(compareGoals)
    .map((goal) =>
      buildGoalView(
        goal,
        levelsByGoalId.get(goal.id) ?? [],
        tasksByLevelId,
        priorityGoalId,
      ),
    );

  return {
    goalType,
    domain,
    priorityGoalId,
    todayPriorityGoalId: priorityGoalId,
    goals,
    counts: buildCounts(goals, priorityGoalId),
  };
}

export async function loadJarvisGoalPriorities(
  supabase: SupabaseClient,
  userId: string,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("jarvis_goal_priorities")
    .select("domain, goal_type, goal_id")
    .eq("user_id", userId);

  if (error) {
    throw error;
  }

  const priorities = new Map<string, string>();

  for (const row of data ?? []) {
    const entry = row as { domain: string; goal_type: string; goal_id: string };
    priorities.set(`${entry.domain}:${entry.goal_type}`, entry.goal_id);
  }

  return priorities;
}

export function resolvePriorityGoalId(
  priorities: Map<string, string>,
  domain: JarvisGoalDomain,
  goalType: JarvisGoalType,
): string | null {
  return priorities.get(`${domain}:${goalType}`) ?? null;
}
