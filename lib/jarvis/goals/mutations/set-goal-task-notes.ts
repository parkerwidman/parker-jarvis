import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GOAL_TASK_NOTES_MAX_LENGTH,
  loadGoalTaskMutationContext,
  parseAuthenticatedUserId,
  parseGoalTaskId,
} from "./goal-task-mutation-shared";

export type SetGoalTaskNotesResult =
  | { success: true; taskId: string; notes: string | null }
  | { success: false; error: string };

function normalizeNotes(notes: string): string | null {
  const trimmed = notes.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export async function setJarvisGoalTaskNotes(
  supabase: SupabaseClient,
  userId: unknown,
  taskId: unknown,
  notes: unknown,
): Promise<SetGoalTaskNotesResult> {
  const parsedUserId = parseAuthenticatedUserId(userId);

  if (!parsedUserId) {
    return { success: false, error: "You must be signed in to update this task." };
  }

  const parsedTaskId = parseGoalTaskId(taskId);

  if (!parsedTaskId) {
    return { success: false, error: "Invalid task." };
  }

  if (typeof notes !== "string") {
    return { success: false, error: "Invalid note." };
  }

  const normalizedNotes = normalizeNotes(notes);

  if (normalizedNotes !== null && normalizedNotes.length > GOAL_TASK_NOTES_MAX_LENGTH) {
    return { success: false, error: "Note is too long." };
  }

  const loaded = await loadGoalTaskMutationContext(supabase, parsedUserId, parsedTaskId);

  if (!("taskId" in loaded)) {
    return { success: false, error: loaded.error };
  }

  const task = loaded;

  if (normalizedNotes === task.notes) {
    return { success: true, taskId: task.taskId, notes: task.notes };
  }

  const { data, error } = await supabase
    .from("tasks")
    .update({
      notes: normalizedNotes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", task.taskId)
    .eq("user_id", parsedUserId)
    .select("id, notes")
    .maybeSingle();

  if (error || !data) {
    return { success: false, error: "Could not update task. Try again." };
  }

  return { success: true, taskId: data.id, notes: data.notes };
}
