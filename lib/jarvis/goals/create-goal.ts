import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseGoalTargetDateInput, parseTaskDueDateInput } from "./goal-dates";
import type { JarvisGoalDomain, JarvisGoalType } from "./types";

export type GoalBuilderTaskInput =
  | string
  | {
      title: string;
      dueAt?: string | null;
    };

export type GoalBuilderLevelInput = {
  name: string;
  tasks: GoalBuilderTaskInput[];
};

export type GoalBuilderInput = {
  title: string;
  description?: string | null;
  notes?: string | null;
  targetDate?: string | null;
  domain: JarvisGoalDomain;
  levels: GoalBuilderLevelInput[];
};

export type ValidatedGoalBuilderInput = {
  title: string;
  description: string | null;
  notes: string | null;
  targetDate: string | null;
  domain: JarvisGoalDomain;
  levels: Array<{
    name: string;
    tasks: Array<{ title: string; dueAt: string | null }>;
  }>;
};

export type CreateJarvisGoalResult =
  | { success: true; goalId: string }
  | { success: false; error: string };

const GOAL_TITLE_MAX = 200;
const GOAL_DESCRIPTION_MAX = 2000;
const GOAL_NOTES_MAX = 2000;
const LEVEL_NAME_MAX = 200;
const TASK_TITLE_MAX = 200;

const RPC_ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: "You must be signed in to publish a goal.",
  invalid_title: "Goal title must be between 1 and 200 characters.",
  invalid_description: "Description must be 2000 characters or fewer.",
  invalid_notes: "Notes must be 2000 characters or fewer.",
  invalid_goal_type: "Invalid goal type.",
  invalid_domain: "Choose Personal or Melusi.",
  invalid_levels: "Add at least one roadmap level.",
  invalid_level_name: "Each level needs a name between 1 and 200 characters.",
  invalid_level_tasks: "Each level needs at least one task.",
  invalid_task_title: "Each task needs a title between 1 and 200 characters.",
};

type CreateJarvisGoalRpcResult = {
  success: boolean;
  code?: string;
  goal_id?: string;
};

function isJarvisGoalDomain(value: string): value is JarvisGoalDomain {
  return value === "personal" || value === "melusi";
}

function normalizeOptionalText(
  value: string | null | undefined,
  maxLength: number,
  errorCode: keyof typeof RPC_ERROR_MESSAGES,
):
  | { ok: true; value: string | null }
  | { ok: false; error: string } {
  const raw = value?.trim() ?? "";
  const normalized = raw.length > 0 ? raw : null;

  if (normalized !== null && normalized.length > maxLength) {
    return { ok: false, error: RPC_ERROR_MESSAGES[errorCode] };
  }

  return { ok: true, value: normalized };
}

function normalizeTaskInput(
  task: GoalBuilderTaskInput,
): { ok: true; value: { title: string; dueAt: string | null } } | { ok: false; error: string } {
  if (typeof task === "string") {
    const trimmedTask = task.trim();

    if (trimmedTask.length < 1 || trimmedTask.length > TASK_TITLE_MAX) {
      return { ok: false, error: RPC_ERROR_MESSAGES.invalid_task_title };
    }

    return { ok: true, value: { title: trimmedTask, dueAt: null } };
  }

  const trimmedTask = task.title.trim();

  if (trimmedTask.length < 1 || trimmedTask.length > TASK_TITLE_MAX) {
    return { ok: false, error: RPC_ERROR_MESSAGES.invalid_task_title };
  }

  const dueAt = task.dueAt ? parseTaskDueDateInput(task.dueAt) : null;

  return { ok: true, value: { title: trimmedTask, dueAt } };
}

export function validateGoalBuilderInput(
  input: GoalBuilderInput,
): { ok: true; value: ValidatedGoalBuilderInput } | { ok: false; error: string } {
  const title = input.title.trim();

  if (title.length < 1 || title.length > GOAL_TITLE_MAX) {
    return { ok: false, error: RPC_ERROR_MESSAGES.invalid_title };
  }

  const descriptionResult = normalizeOptionalText(
    input.description,
    GOAL_DESCRIPTION_MAX,
    "invalid_description",
  );

  if (!descriptionResult.ok) {
    return { ok: false, error: descriptionResult.error };
  }

  const notesResult = normalizeOptionalText(input.notes, GOAL_NOTES_MAX, "invalid_notes");

  if (!notesResult.ok) {
    return { ok: false, error: notesResult.error };
  }

  const targetDate = input.targetDate ? parseGoalTargetDateInput(input.targetDate) : null;

  if (input.targetDate && targetDate === null) {
    return { ok: false, error: "Target date must use YYYY-MM-DD format." };
  }

  if (!isJarvisGoalDomain(input.domain)) {
    return { ok: false, error: RPC_ERROR_MESSAGES.invalid_domain };
  }

  if (!Array.isArray(input.levels) || input.levels.length < 1) {
    return { ok: false, error: RPC_ERROR_MESSAGES.invalid_levels };
  }

  const levels: ValidatedGoalBuilderInput["levels"] = [];

  for (const level of input.levels) {
    const name = level.name.trim();

    if (name.length < 1 || name.length > LEVEL_NAME_MAX) {
      return { ok: false, error: RPC_ERROR_MESSAGES.invalid_level_name };
    }

    if (!Array.isArray(level.tasks) || level.tasks.length < 1) {
      return { ok: false, error: RPC_ERROR_MESSAGES.invalid_level_tasks };
    }

    const tasks: Array<{ title: string; dueAt: string | null }> = [];

    for (const task of level.tasks) {
      const normalizedTask = normalizeTaskInput(task);

      if (!normalizedTask.ok) {
        return { ok: false, error: normalizedTask.error };
      }

      tasks.push(normalizedTask.value);
    }

    levels.push({ name, tasks });
  }

  return {
    ok: true,
    value: {
      title,
      description: descriptionResult.value,
      notes: notesResult.value,
      targetDate,
      domain: input.domain,
      levels,
    },
  };
}

export function buildGoalLevelsPayload(
  levels: ValidatedGoalBuilderInput["levels"],
): Array<{ name: string; tasks: Array<{ title: string; due_at: string | null }> }> {
  return levels.map((level) => ({
    name: level.name,
    tasks: level.tasks.map((task) => ({
      title: task.title,
      due_at: task.dueAt,
    })),
  }));
}

function rpcErrorMessage(code: string | undefined): string {
  if (code && RPC_ERROR_MESSAGES[code]) {
    return RPC_ERROR_MESSAGES[code];
  }

  return "Could not publish goal. Try again.";
}

export async function createJarvisGoalWithRoadmap(
  supabase: SupabaseClient,
  goalType: JarvisGoalType,
  input: GoalBuilderInput,
): Promise<CreateJarvisGoalResult> {
  const validated = validateGoalBuilderInput(input);

  if (!validated.ok) {
    return { success: false, error: validated.error };
  }

  const { data, error } = await supabase.rpc("create_jarvis_goal_with_roadmap", {
    p_title: validated.value.title,
    p_description: validated.value.description,
    p_notes: validated.value.notes,
    p_target_date: validated.value.targetDate,
    p_goal_type: goalType,
    p_domain: validated.value.domain,
    p_levels: buildGoalLevelsPayload(validated.value.levels),
  });

  if (error) {
    return { success: false, error: "Could not publish goal. Try again." };
  }

  const result = data as CreateJarvisGoalRpcResult | null;

  if (!result?.success || !result.goal_id) {
    return { success: false, error: rpcErrorMessage(result?.code) };
  }

  return { success: true, goalId: result.goal_id };
}
