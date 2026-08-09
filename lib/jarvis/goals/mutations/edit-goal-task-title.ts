import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GOAL_TASK_TITLE_MAX_LENGTH,
  loadGoalTaskMutationContext,
  parseAuthenticatedUserId,
  parseGoalTaskId,
} from "./goal-task-mutation-shared";

export type EditGoalTaskTitleResult =
  | { success: true; taskId: string; title: string }
  | { success: false; error: string };

function normalizeTitle(title: string): string | null {
  const trimmed = title.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function editJarvisGoalTaskTitle(
  supabase: SupabaseClient,
  userId: unknown,
  taskId: unknown,
  title: unknown,
): Promise<EditGoalTaskTitleResult> {
  const parsedUserId = parseAuthenticatedUserId(userId);

  if (!parsedUserId) {
    return { success: false, error: "You must be signed in to update this task." };
  }

  const parsedTaskId = parseGoalTaskId(taskId);

  if (!parsedTaskId) {
    return { success: false, error: "Invalid task." };
  }

  if (typeof title !== "string") {
    return { success: false, error: "Task title must be between 1 and 200 characters." };
  }

  const normalizedTitle = normalizeTitle(title);

  if (normalizedTitle === null) {
    return { success: false, error: "Task title must be between 1 and 200 characters." };
  }

  if (normalizedTitle.length > GOAL_TASK_TITLE_MAX_LENGTH) {
    return { success: false, error: "Task title must be between 1 and 200 characters." };
  }

  const loaded = await loadGoalTaskMutationContext(supabase, parsedUserId, parsedTaskId);

  if (!("taskId" in loaded)) {
    return { success: false, error: loaded.error };
  }

  const task = loaded;

  const { data: existingTask, error: readError } = await supabase
    .from("tasks")
    .select("title")
    .eq("id", task.taskId)
    .eq("user_id", parsedUserId)
    .maybeSingle();

  if (readError || !existingTask) {
    return { success: false, error: "Could not update task. Try again." };
  }

  if (existingTask.title === normalizedTitle) {
    return { success: true, taskId: task.taskId, title: normalizedTitle };
  }

  const { data, error } = await supabase
    .from("tasks")
    .update({
      title: normalizedTitle,
      updated_at: new Date().toISOString(),
    })
    .eq("id", task.taskId)
    .eq("user_id", parsedUserId)
    .select("id, title")
    .maybeSingle();

  if (error || !data) {
    return { success: false, error: "Could not update task. Try again." };
  }

  return { success: true, taskId: data.id, title: data.title };
}
