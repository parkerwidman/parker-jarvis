import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const GOAL_TASK_NOTES_MAX_LENGTH = 2000;
export const GOAL_TASK_BLOCKED_REASON_MAX_LENGTH = 500;
export const GOAL_TASK_TITLE_MAX_LENGTH = 200;
export const GOAL_LEVEL_NAME_MAX_LENGTH = 200;

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const BLOCK_STALE_STATE_ERROR =
  "Task changed before it could be blocked. Refresh and try again.";

export const BLOCKER_EDIT_STALE_STATE_ERROR =
  "Task changed before the blocker could be updated. Refresh and try again.";

export type GoalTaskMutationContext = {
  taskId: string;
  goalId: string;
  goalLevelId: string;
  status: string;
  completedAt: string | null;
  blockedAt: string | null;
  blockedReason: string | null;
  notes: string | null;
};

export type GoalTaskMutationFailure = {
  success: false;
  error: string;
  code?: string;
};

export function parseAuthenticatedUserId(userId: unknown): string | null {
  if (typeof userId !== "string") {
    return null;
  }

  const normalized = userId.trim();

  if (!UUID_REGEX.test(normalized)) {
    return null;
  }

  return normalized;
}

export function parseGoalTaskId(taskId: unknown): string | null {
  if (typeof taskId !== "string") {
    return null;
  }

  const normalized = taskId.trim();

  if (!UUID_REGEX.test(normalized)) {
    return null;
  }

  return normalized;
}

export function parseGoalLevelId(levelId: unknown): string | null {
  return parseGoalTaskId(levelId);
}

export function parseGoalId(goalId: unknown): string | null {
  return parseGoalTaskId(goalId);
}

export type GoalLevelMutationContext = {
  levelId: string;
  goalId: string;
  goalStatus: string;
  levelName: string;
};

export async function loadGoalLevelMutationContext(
  supabase: SupabaseClient,
  userId: string,
  levelId: string,
): Promise<GoalLevelMutationContext | GoalTaskMutationFailure> {
  const { data: level, error } = await supabase
    .from("jarvis_goal_levels")
    .select("id, goal_id, name")
    .eq("id", levelId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { success: false, error: "Could not update level. Try again." };
  }

  if (!level) {
    return { success: false, error: "Level not found.", code: "level_not_found" };
  }

  const { data: goal, error: goalError } = await supabase
    .from("jarvis_goals")
    .select("id, status")
    .eq("id", level.goal_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (goalError) {
    return { success: false, error: "Could not update level. Try again." };
  }

  if (!goal) {
    return { success: false, error: "Goal not found.", code: "goal_not_found" };
  }

  if (goal.status === "archived") {
    return {
      success: false,
      error: "Archived goals cannot be updated.",
      code: "goal_archived",
    };
  }

  return {
    levelId: level.id,
    goalId: level.goal_id,
    goalStatus: goal.status,
    levelName: level.name,
  };
}

export async function loadGoalTaskMutationContext(
  supabase: SupabaseClient,
  userId: string,
  taskId: string,
): Promise<GoalTaskMutationContext | GoalTaskMutationFailure> {
  const { data: task, error } = await supabase
    .from("tasks")
    .select(
      "id, goal_id, goal_level_id, status, completed_at, blocked_at, blocked_reason, notes",
    )
    .eq("id", taskId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { success: false, error: "Could not update task. Try again." };
  }

  if (!task) {
    return { success: false, error: "Task not found.", code: "task_not_found" };
  }

  if (!task.goal_id) {
    return {
      success: false,
      error: "This task is not part of a Jarvis goal.",
      code: "not_goal_task",
    };
  }

  if (!task.goal_level_id) {
    return {
      success: false,
      error: "This goal task has an invalid attachment.",
      code: "malformed_goal_task",
    };
  }

  const { data: goal, error: goalError } = await supabase
    .from("jarvis_goals")
    .select("id, status")
    .eq("id", task.goal_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (goalError) {
    return { success: false, error: "Could not update task. Try again." };
  }

  if (!goal) {
    return { success: false, error: "Goal not found.", code: "goal_not_found" };
  }

  if (goal.status === "archived") {
    return {
      success: false,
      error: "Archived goals cannot be updated.",
      code: "goal_archived",
    };
  }

  const { data: level, error: levelError } = await supabase
    .from("jarvis_goal_levels")
    .select("id, goal_id")
    .eq("id", task.goal_level_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (levelError) {
    return { success: false, error: "Could not update task. Try again." };
  }

  if (!level || level.goal_id !== task.goal_id) {
    return {
      success: false,
      error: "This goal task has an invalid attachment.",
      code: "malformed_goal_task",
    };
  }

  return {
    taskId: task.id,
    goalId: task.goal_id,
    goalLevelId: task.goal_level_id,
    status: task.status,
    completedAt: task.completed_at,
    blockedAt: task.blocked_at,
    blockedReason: task.blocked_reason,
    notes: task.notes,
  };
}

export async function readOwnedGoalTaskState(
  supabase: SupabaseClient,
  userId: string,
  taskId: string,
): Promise<{ status: string; blockedAt: string | null } | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select("status, blocked_at")
    .eq("id", taskId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    status: data.status,
    blockedAt: data.blocked_at,
  };
}
