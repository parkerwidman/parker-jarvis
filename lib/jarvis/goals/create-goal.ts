import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { JarvisGoalDomain, JarvisGoalType } from "./types";

export type GoalBuilderLevelInput = {
  name: string;
  tasks: string[];
};

export type GoalBuilderInput = {
  title: string;
  description?: string | null;
  domain: JarvisGoalDomain;
  levels: GoalBuilderLevelInput[];
};

export type ValidatedGoalBuilderInput = {
  title: string;
  description: string | null;
  domain: JarvisGoalDomain;
  levels: Array<{
    name: string;
    tasks: string[];
  }>;
};

export type CreateJarvisGoalResult =
  | { success: true; goalId: string }
  | { success: false; error: string };

const GOAL_TITLE_MAX = 200;
const GOAL_DESCRIPTION_MAX = 2000;
const LEVEL_NAME_MAX = 200;
const TASK_TITLE_MAX = 200;

const RPC_ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: "You must be signed in to publish a goal.",
  invalid_title: "Goal title must be between 1 and 200 characters.",
  invalid_description: "Description must be 2000 characters or fewer.",
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

export function validateGoalBuilderInput(
  input: GoalBuilderInput,
): { ok: true; value: ValidatedGoalBuilderInput } | { ok: false; error: string } {
  const title = input.title.trim();

  if (title.length < 1 || title.length > GOAL_TITLE_MAX) {
    return { ok: false, error: RPC_ERROR_MESSAGES.invalid_title };
  }

  const descriptionRaw = input.description?.trim() ?? "";
  const description = descriptionRaw.length > 0 ? descriptionRaw : null;

  if (description !== null && description.length > GOAL_DESCRIPTION_MAX) {
    return { ok: false, error: RPC_ERROR_MESSAGES.invalid_description };
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

    const tasks: string[] = [];

    for (const taskTitle of level.tasks) {
      const trimmedTask = taskTitle.trim();

      if (trimmedTask.length < 1) {
        return { ok: false, error: RPC_ERROR_MESSAGES.invalid_task_title };
      }

      if (trimmedTask.length > TASK_TITLE_MAX) {
        return { ok: false, error: RPC_ERROR_MESSAGES.invalid_task_title };
      }

      tasks.push(trimmedTask);
    }

    levels.push({ name, tasks });
  }

  return {
    ok: true,
    value: {
      title,
      description,
      domain: input.domain,
      levels,
    },
  };
}

export function buildGoalLevelsPayload(
  levels: ValidatedGoalBuilderInput["levels"],
): Array<{ name: string; tasks: string[] }> {
  return levels.map((level) => ({
    name: level.name,
    tasks: level.tasks,
  }));
}

export function computeGapPositions(count: number): number[] {
  return Array.from({ length: count }, (_, index) => (index + 1) * 10);
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
