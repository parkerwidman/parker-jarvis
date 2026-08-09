import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BLOCK_STALE_STATE_ERROR,
  BLOCKER_EDIT_STALE_STATE_ERROR,
  GOAL_TASK_BLOCKED_REASON_MAX_LENGTH,
  loadGoalTaskMutationContext,
  parseAuthenticatedUserId,
  parseGoalTaskId,
  readOwnedGoalTaskState,
} from "./goal-task-mutation-shared";

export type SetGoalTaskBlockStateResult =
  | {
      success: true;
      taskId: string;
      blockedAt: string | null;
      blockedReason: string | null;
    }
  | { success: false; error: string };

function normalizeBlockReason(reason: string): string | null {
  const trimmed = reason.trim();
  return trimmed.length === 0 ? null : trimmed;
}

async function resolveFirstBlockMiss(
  supabase: SupabaseClient,
  userId: string,
  taskId: string,
): Promise<SetGoalTaskBlockStateResult> {
  const current = await readOwnedGoalTaskState(supabase, userId, taskId);

  if (!current) {
    return { success: false, error: "Task not found." };
  }

  if (current.status === "done") {
    return {
      success: false,
      error: "Completed tasks cannot be marked blocked.",
    };
  }

  return { success: false, error: BLOCK_STALE_STATE_ERROR };
}

async function resolveBlockerEditMiss(
  supabase: SupabaseClient,
  userId: string,
  taskId: string,
): Promise<SetGoalTaskBlockStateResult> {
  const current = await readOwnedGoalTaskState(supabase, userId, taskId);

  if (!current) {
    return { success: false, error: "Task not found." };
  }

  return { success: false, error: BLOCKER_EDIT_STALE_STATE_ERROR };
}

export async function setJarvisGoalTaskBlockState(
  supabase: SupabaseClient,
  userId: unknown,
  taskId: unknown,
  blocked: unknown,
  reason: unknown,
): Promise<SetGoalTaskBlockStateResult> {
  const parsedUserId = parseAuthenticatedUserId(userId);

  if (!parsedUserId) {
    return { success: false, error: "You must be signed in to update this task." };
  }

  const parsedTaskId = parseGoalTaskId(taskId);

  if (!parsedTaskId) {
    return { success: false, error: "Invalid task." };
  }

  if (typeof blocked !== "boolean") {
    return { success: false, error: "Invalid block state." };
  }

  const loaded = await loadGoalTaskMutationContext(supabase, parsedUserId, parsedTaskId);

  if (!("taskId" in loaded)) {
    return { success: false, error: loaded.error };
  }

  const task = loaded;

  if (!blocked) {
    if (reason !== null && typeof reason !== "string") {
      return { success: false, error: "Invalid blocker reason." };
    }

    if (!task.blockedAt && !task.blockedReason) {
      return {
        success: true,
        taskId: task.taskId,
        blockedAt: null,
        blockedReason: null,
      };
    }

    const { data, error } = await supabase
      .from("tasks")
      .update({
        blocked_at: null,
        blocked_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.taskId)
      .eq("user_id", parsedUserId)
      .select("id, blocked_at, blocked_reason")
      .maybeSingle();

    if (error || !data) {
      return { success: false, error: "Could not update task. Try again." };
    }

    return {
      success: true,
      taskId: data.id,
      blockedAt: data.blocked_at,
      blockedReason: data.blocked_reason,
    };
  }

  if (typeof reason !== "string") {
    return { success: false, error: "Blocker reason is required." };
  }

  const normalizedReason = normalizeBlockReason(reason);

  if (!normalizedReason) {
    return { success: false, error: "Blocker reason is required." };
  }

  if (normalizedReason.length > GOAL_TASK_BLOCKED_REASON_MAX_LENGTH) {
    return { success: false, error: "Blocker reason is too long." };
  }

  const isDone = task.status === "done";

  if (isDone && !task.blockedAt) {
    return {
      success: false,
      error: "Completed tasks cannot be marked blocked.",
    };
  }

  if (task.blockedAt) {
    if (normalizedReason === task.blockedReason) {
      return {
        success: true,
        taskId: task.taskId,
        blockedAt: task.blockedAt,
        blockedReason: task.blockedReason,
      };
    }

    const { data, error } = await supabase
      .from("tasks")
      .update({
        blocked_reason: normalizedReason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.taskId)
      .eq("user_id", parsedUserId)
      .not("blocked_at", "is", null)
      .select("id, blocked_at, blocked_reason")
      .maybeSingle();

    if (error) {
      return { success: false, error: "Could not update task. Try again." };
    }

    if (!data) {
      return resolveBlockerEditMiss(supabase, parsedUserId, task.taskId);
    }

    return {
      success: true,
      taskId: data.id,
      blockedAt: data.blocked_at,
      blockedReason: data.blocked_reason,
    };
  }

  const blockedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("tasks")
    .update({
      blocked_at: blockedAt,
      blocked_reason: normalizedReason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", task.taskId)
    .eq("user_id", parsedUserId)
    .neq("status", "done")
    .is("blocked_at", null)
    .select("id, blocked_at, blocked_reason, status, completed_at")
    .maybeSingle();

  if (error) {
    return { success: false, error: "Could not update task. Try again." };
  }

  if (!data) {
    return resolveFirstBlockMiss(supabase, parsedUserId, task.taskId);
  }

  return {
    success: true,
    taskId: data.id,
    blockedAt: data.blocked_at,
    blockedReason: data.blocked_reason,
  };
}
