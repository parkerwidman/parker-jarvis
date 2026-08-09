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
  GoalsPageData,
  JarvisGoalDomain,
  JarvisGoalStatus,
  JarvisGoalType,
} from "./types";

type JarvisGoalRow = {
  id: string;
  title: string;
  description: string | null;
  domain: JarvisGoalDomain;
  status: JarvisGoalStatus;
  sort_order: number;
  completed_at: string | null;
  created_at: string;
};

type JarvisProfileRow = {
  today_priority_goal_id: string | null;
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
  todayPriorityGoalId: string | null,
  goalType: JarvisGoalType,
): GoalView {
  const progressPercent =
    goal.status === "completed"
      ? 100
      : computeGoalProgressPercent(levels, tasksByLevelId);

  return {
    id: goal.id,
    title: goal.title,
    description: goal.description,
    domain: goal.domain,
    status: goal.status,
    sortOrder: goal.sort_order,
    completedAt: goal.completed_at,
    progressPercent,
    levels: buildGoalLevelViews(levels, tasksByLevelId),
    isTodayPriority:
      goalType === "short_term" &&
      goal.status === "active" &&
      todayPriorityGoalId !== null &&
      todayPriorityGoalId === goal.id,
  };
}

export async function loadGoals(
  supabase: SupabaseClient,
  userId: string,
  goalType: JarvisGoalType,
): Promise<GoalsPageData> {
  const [profileResult, goalsResult] = await Promise.all([
    supabase
      .from("jarvis_profiles")
      .select("today_priority_goal_id")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("jarvis_goals")
      .select(
        "id, title, description, domain, status, sort_order, completed_at, created_at",
      )
      .eq("user_id", userId)
      .eq("goal_type", goalType)
      .neq("status", "archived")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (profileResult.error) {
    throw profileResult.error;
  }

  if (goalsResult.error) {
    throw goalsResult.error;
  }

  const profile = profileResult.data as JarvisProfileRow | null;
  const goalRows = (goalsResult.data ?? []) as JarvisGoalRow[];
  const goalIds = goalRows.map((goal) => goal.id);

  if (goalIds.length === 0) {
    return {
      goalType,
      todayPriorityGoalId: profile?.today_priority_goal_id ?? null,
      goals: [],
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
        "id, title, status, position, notes, blocked_at, blocked_reason, goal_level_id",
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
  const todayPriorityGoalId = profile?.today_priority_goal_id ?? null;

  const goals = goalRows
    .slice()
    .sort(compareGoals)
    .map((goal) =>
      buildGoalView(
        goal,
        levelsByGoalId.get(goal.id) ?? [],
        tasksByLevelId,
        todayPriorityGoalId,
        goalType,
      ),
    );

  return {
    goalType,
    todayPriorityGoalId,
    goals,
  };
}
