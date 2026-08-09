"use server";

import {
  createJarvisGoalWithRoadmap,
  type GoalBuilderInput,
} from "@/lib/jarvis/goals/create-goal";
import { addJarvisGoalTask } from "@/lib/jarvis/goals/mutations/add-goal-task";
import { deleteJarvisGoalTask } from "@/lib/jarvis/goals/mutations/delete-goal-task";
import { editJarvisGoalTaskTitle } from "@/lib/jarvis/goals/mutations/edit-goal-task-title";
import { setJarvisGoalTaskCompletion } from "@/lib/jarvis/goals/mutations/set-goal-task-completion";
import { setJarvisGoalTaskBlockState } from "@/lib/jarvis/goals/mutations/set-goal-task-block-state";
import { setJarvisGoalTaskNotes } from "@/lib/jarvis/goals/mutations/set-goal-task-notes";
import {
  clearJarvisTodayPriorityGoal,
  setJarvisTodayPriorityGoal,
} from "@/lib/jarvis/goals/mutations/set-today-priority-goal";
import type { JarvisGoalType } from "@/lib/jarvis/goals/types";
import { GOAL_PAGE_CONFIG } from "@/lib/jarvis/goals/types";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type PublishGoalResult =
  | { ok: true; goalId: string }
  | { ok: false; error: string };

async function requireAuthenticatedUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return null;
  }

  return typeof data.claims.sub === "string" ? data.claims.sub : null;
}

function revalidateGoalPages(): void {
  for (const config of Object.values(GOAL_PAGE_CONFIG)) {
    revalidatePath(config.route);
  }
  revalidatePath("/");
  revalidatePath("/tasks");
}

async function publishJarvisGoal(
  goalType: JarvisGoalType,
  payload: GoalBuilderInput,
): Promise<PublishGoalResult> {
  const supabase = await createClient();
  const userId = await requireAuthenticatedUser(supabase);

  if (!userId) {
    return { ok: false, error: "You must be signed in to publish a goal." };
  }

  const result = await createJarvisGoalWithRoadmap(supabase, goalType, payload);

  if (!result.success) {
    return { ok: false, error: result.error };
  }

  revalidatePath(GOAL_PAGE_CONFIG[goalType].route);
  revalidatePath("/");

  return { ok: true, goalId: result.goalId };
}

export async function publishShortTermGoal(
  payload: GoalBuilderInput,
): Promise<PublishGoalResult> {
  return publishJarvisGoal("short_term", payload);
}

export async function publishThreeMonthGoal(
  payload: GoalBuilderInput,
): Promise<PublishGoalResult> {
  return publishJarvisGoal("three_month", payload);
}

export async function publishLongTermGoal(
  payload: GoalBuilderInput,
): Promise<PublishGoalResult> {
  return publishJarvisGoal("long_term", payload);
}

export type SetGoalTaskCompletionActionResult =
  | { ok: true; code: string }
  | { ok: false; error: string };

export async function setGoalTaskCompletion(
  taskId: string,
  completed: boolean,
): Promise<SetGoalTaskCompletionActionResult> {
  const supabase = await createClient();
  const userId = await requireAuthenticatedUser(supabase);

  if (!userId) {
    return { ok: false, error: "You must be signed in to update this task." };
  }

  const result = await setJarvisGoalTaskCompletion(supabase, taskId, completed);

  if (!result.success) {
    return { ok: false, error: result.error };
  }

  revalidateGoalPages();

  return { ok: true, code: result.code };
}

export type SetGoalTaskNotesActionResult =
  | { ok: true; taskId: string }
  | { ok: false; error: string };

export async function setGoalTaskNotes(
  taskId: unknown,
  notes: unknown,
): Promise<SetGoalTaskNotesActionResult> {
  const supabase = await createClient();
  const userId = await requireAuthenticatedUser(supabase);

  if (!userId) {
    return { ok: false, error: "You must be signed in to update this task." };
  }

  const result = await setJarvisGoalTaskNotes(supabase, userId, taskId, notes);

  if (!result.success) {
    return { ok: false, error: result.error };
  }

  revalidateGoalPages();

  return { ok: true, taskId: result.taskId };
}

export type SetGoalTaskBlockStateActionResult =
  | { ok: true; taskId: string }
  | { ok: false; error: string };

export async function setGoalTaskBlockState(
  taskId: unknown,
  blocked: unknown,
  reason: unknown,
): Promise<SetGoalTaskBlockStateActionResult> {
  const supabase = await createClient();
  const userId = await requireAuthenticatedUser(supabase);

  if (!userId) {
    return { ok: false, error: "You must be signed in to update this task." };
  }

  const result = await setJarvisGoalTaskBlockState(
    supabase,
    userId,
    taskId,
    blocked,
    reason,
  );

  if (!result.success) {
    return { ok: false, error: result.error };
  }

  revalidateGoalPages();

  return { ok: true, taskId: result.taskId };
}

export type SetTodayPriorityGoalActionResult =
  | { ok: true; goalId: string }
  | { ok: false; error: string };

export async function setTodayPriorityGoal(
  goalId: unknown,
): Promise<SetTodayPriorityGoalActionResult> {
  const supabase = await createClient();
  const userId = await requireAuthenticatedUser(supabase);

  if (!userId) {
    return { ok: false, error: "You must be signed in to update Today's Priority." };
  }

  const result = await setJarvisTodayPriorityGoal(supabase, userId, goalId);

  if (!result.success) {
    return { ok: false, error: result.error };
  }

  revalidateGoalPages();

  return { ok: true, goalId: result.goalId };
}

export type ClearTodayPriorityGoalActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function clearTodayPriorityGoal(): Promise<ClearTodayPriorityGoalActionResult> {
  const supabase = await createClient();
  const userId = await requireAuthenticatedUser(supabase);

  if (!userId) {
    return { ok: false, error: "You must be signed in to update Today's Priority." };
  }

  const result = await clearJarvisTodayPriorityGoal(supabase, userId);

  if (!result.success) {
    return { ok: false, error: result.error };
  }

  revalidateGoalPages();

  return { ok: true };
}

export type AddGoalTaskActionResult =
  | { ok: true; taskId: string; goalId: string }
  | { ok: false; error: string };

export async function addGoalTask(
  levelId: unknown,
  title: unknown,
): Promise<AddGoalTaskActionResult> {
  const supabase = await createClient();
  const userId = await requireAuthenticatedUser(supabase);

  if (!userId) {
    return { ok: false, error: "You must be signed in to add a task." };
  }

  const result = await addJarvisGoalTask(supabase, levelId, title);

  if (!result.success) {
    return { ok: false, error: result.error };
  }

  revalidateGoalPages();

  return { ok: true, taskId: result.taskId, goalId: result.goalId };
}

export type EditGoalTaskTitleActionResult =
  | { ok: true; taskId: string }
  | { ok: false; error: string };

export async function editGoalTaskTitle(
  taskId: unknown,
  title: unknown,
): Promise<EditGoalTaskTitleActionResult> {
  const supabase = await createClient();
  const userId = await requireAuthenticatedUser(supabase);

  if (!userId) {
    return { ok: false, error: "You must be signed in to update this task." };
  }

  const result = await editJarvisGoalTaskTitle(supabase, userId, taskId, title);

  if (!result.success) {
    return { ok: false, error: result.error };
  }

  revalidateGoalPages();

  return { ok: true, taskId: result.taskId };
}

export type DeleteGoalTaskActionResult =
  | { ok: true; taskId: string; goalId: string }
  | { ok: false; error: string };

export async function deleteGoalTask(
  taskId: unknown,
): Promise<DeleteGoalTaskActionResult> {
  const supabase = await createClient();
  const userId = await requireAuthenticatedUser(supabase);

  if (!userId) {
    return { ok: false, error: "You must be signed in to delete this task." };
  }

  const result = await deleteJarvisGoalTask(supabase, taskId);

  if (!result.success) {
    return { ok: false, error: result.error };
  }

  revalidateGoalPages();

  return { ok: true, taskId: result.taskId, goalId: result.goalId };
}
