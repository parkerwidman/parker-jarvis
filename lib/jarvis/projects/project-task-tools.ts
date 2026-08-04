import "server-only";

import { ensureLifeAreaForModule } from "@/lib/jarvis/life-areas/ensure-life-area-for-module";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProjectRecord } from "./project-tools";

const VALID_PRIORITIES = new Set(["low", "medium", "high"]);

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PROJECT_SELECT =
  "id, user_id, life_area_id, name, description, status, priority, due_at, created_at, updated_at";

const TASK_SELECT =
  "id, title, status, priority, due_at, completed_at, created_at, project_id, life_area_id";

export type TrustedMelusiProject = ProjectRecord & {
  life_area_id: string;
};

export type ProjectTaskRecord = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  project_id: string | null;
  life_area_id: string | null;
};

export type LoadTrustedMelusiProjectResult =
  | { success: true; project: TrustedMelusiProject }
  | { success: false; error: string };

export type ListProjectTasksResult =
  | { success: true; tasks: ProjectTaskRecord[] }
  | { success: false; error: string };

export type CreateProjectTaskResult =
  | { success: true; task: ProjectTaskRecord }
  | { success: false; error: string };

export type CompleteProjectTaskResult =
  | { success: true; task: ProjectTaskRecord }
  | { success: false; error: string };

export type ResolveMelusiProjectResult =
  | { success: true; project: TrustedMelusiProject }
  | {
      success: false;
      error: string;
      matches?: Array<{ name: string; status: string; priority: string }>;
    };

function parseDueDate(raw: string): string | null {
  const trimmed = raw.trim();

  if (!trimmed || !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const [year, month, day] = trimmed.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toISOString();
}

function compareTasks(a: ProjectTaskRecord, b: ProjectTaskRecord): number {
  const aDone = a.status === "done";
  const bDone = b.status === "done";

  if (aDone !== bDone) {
    return aDone ? 1 : -1;
  }

  const aDue = a.due_at ? new Date(a.due_at).getTime() : null;
  const bDue = b.due_at ? new Date(b.due_at).getTime() : null;

  if (aDue !== null && bDue !== null && aDue !== bDue) {
    return aDue - bDue;
  }

  if (aDue !== null && bDue === null) {
    return -1;
  }

  if (aDue === null && bDue !== null) {
    return 1;
  }

  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export async function loadTrustedMelusiProject(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
): Promise<LoadTrustedMelusiProjectResult> {
  if (!UUID_REGEX.test(projectId)) {
    return { success: false, error: "Invalid project." };
  }

  const lifeAreaResult = await ensureLifeAreaForModule(
    supabase,
    userId,
    "melusi",
  );

  if (!lifeAreaResult.success) {
    return { success: false, error: "Project not found." };
  }

  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("id", projectId)
    .eq("user_id", userId)
    .eq("life_area_id", lifeAreaResult.lifeAreaId)
    .maybeSingle();

  if (error || !data?.life_area_id) {
    return { success: false, error: "Project not found." };
  }

  return {
    success: true,
    project: data as TrustedMelusiProject,
  };
}

async function findMelusiProjectsByName(
  supabase: SupabaseClient,
  userId: string,
  lifeAreaId: string,
  projectName: string,
): Promise<TrustedMelusiProject[]> {
  const normalizedName = projectName.trim().toLowerCase();

  if (!normalizedName) {
    return [];
  }

  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("user_id", userId)
    .eq("life_area_id", lifeAreaId);

  if (error) {
    return [];
  }

  return (data ?? []).filter(
    (project): project is TrustedMelusiProject =>
      Boolean(project.life_area_id) &&
      project.name.trim().toLowerCase() === normalizedName,
  );
}

export async function resolveMelusiProject(
  supabase: SupabaseClient,
  userId: string,
  input: {
    projectId?: string;
    projectName?: string;
  },
): Promise<ResolveMelusiProjectResult> {
  const lifeAreaResult = await ensureLifeAreaForModule(
    supabase,
    userId,
    "melusi",
  );

  if (!lifeAreaResult.success) {
    return { success: false, error: lifeAreaResult.error };
  }

  const projectId = input.projectId?.trim() ?? "";
  const projectName = input.projectName?.trim() ?? "";

  if (!projectId && !projectName) {
    return {
      success: false,
      error: "Provide a project id or project name.",
    };
  }

  if (projectId) {
    return loadTrustedMelusiProject(supabase, userId, projectId);
  }

  const matches = await findMelusiProjectsByName(
    supabase,
    userId,
    lifeAreaResult.lifeAreaId,
    projectName,
  );

  if (matches.length === 0) {
    return { success: false, error: "No matching project was found." };
  }

  if (matches.length > 1) {
    return {
      success: false,
      error: "Multiple projects match that name. Ask Parker to clarify.",
      matches: matches.map((project) => ({
        name: project.name,
        status: project.status,
        priority: project.priority,
      })),
    };
  }

  return { success: true, project: matches[0] };
}

export async function listProjectTasks(
  supabase: SupabaseClient,
  userId: string,
  project: TrustedMelusiProject,
  options?: {
    unfinishedOnly?: boolean;
  },
): Promise<ListProjectTasksResult> {
  let query = supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("user_id", userId)
    .eq("project_id", project.id)
    .eq("life_area_id", project.life_area_id);

  if (options?.unfinishedOnly) {
    query = query.neq("status", "done");
  }

  const { data, error } = await query;

  if (error) {
    return { success: false, error: "Could not list project tasks." };
  }

  const tasks = [...(data ?? [])].sort(compareTasks).slice(0, 100);

  return { success: true, tasks };
}

export async function createProjectTask(
  supabase: SupabaseClient,
  userId: string,
  project: TrustedMelusiProject,
  input: {
    title: string;
    priority?: string;
    dueDate?: string;
  },
): Promise<CreateProjectTaskResult> {
  const title = input.title.trim();
  const priority = input.priority?.trim() ?? "medium";
  const rawDueDate = input.dueDate?.trim() ?? "";

  if (!title || title.length > 200) {
    return {
      success: false,
      error: "Title must be between 1 and 200 characters.",
    };
  }

  if (!VALID_PRIORITIES.has(priority)) {
    return {
      success: false,
      error: "Priority must be low, medium, or high.",
    };
  }

  let due_at: string | null = null;

  if (rawDueDate) {
    due_at = parseDueDate(rawDueDate);

    if (!due_at) {
      return {
        success: false,
        error: "Due date must be in YYYY-MM-DD format.",
      };
    }
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title,
      priority,
      due_at,
      project_id: project.id,
      life_area_id: project.life_area_id,
    })
    .select(TASK_SELECT)
    .single();

  if (error || !data) {
    return { success: false, error: "Could not create task." };
  }

  return { success: true, task: data };
}

export async function completeProjectTask(
  supabase: SupabaseClient,
  userId: string,
  project: TrustedMelusiProject,
  taskId: string,
): Promise<CompleteProjectTaskResult> {
  if (!UUID_REGEX.test(taskId)) {
    return { success: false, error: "Invalid task." };
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("tasks")
    .update({
      status: "done",
      completed_at: now,
      updated_at: now,
    })
    .eq("id", taskId)
    .eq("user_id", userId)
    .eq("project_id", project.id)
    .eq("life_area_id", project.life_area_id)
    .select(TASK_SELECT)
    .single();

  if (error || !data) {
    return {
      success: false,
      error: "Task not found or could not be completed.",
    };
  }

  return { success: true, task: data };
}
