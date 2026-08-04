import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const VALID_PRIORITIES = new Set(["low", "medium", "high"]);

const VALID_STATUSES = new Set([
  "idea",
  "active",
  "paused",
  "completed",
  "archived",
]);

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PROJECT_SELECT =
  "id, user_id, life_area_id, name, description, status, priority, due_at, created_at, updated_at";

export type ProjectRecord = {
  id: string;
  user_id: string;
  life_area_id: string | null;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ListProjectsResult =
  | { success: true; projects: ProjectRecord[] }
  | { success: false; error: string };

export type CreateProjectResult =
  | { success: true; project: ProjectRecord }
  | { success: false; error: string };

export type UpdateProjectStatusResult =
  | { success: true; project: ProjectRecord }
  | { success: false; error: string };

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

export async function listProjectsForLifeArea(
  supabase: SupabaseClient,
  userId: string,
  lifeAreaId: string,
): Promise<ListProjectsResult> {
  if (!UUID_REGEX.test(lifeAreaId)) {
    return { success: false, error: "Invalid life area." };
  }

  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("user_id", userId)
    .eq("life_area_id", lifeAreaId);

  if (error) {
    return { success: false, error: "Could not list projects." };
  }

  return { success: true, projects: data ?? [] };
}

export async function createProject(
  supabase: SupabaseClient,
  input: {
    userId: string;
    lifeAreaId: string;
    name: string;
    description?: string;
    priority?: string;
    dueDate?: string;
  },
): Promise<CreateProjectResult> {
  const name = input.name.trim();
  const description = input.description?.trim() ?? "";
  const priority = input.priority?.trim() ?? "medium";
  const rawDueDate = input.dueDate?.trim() ?? "";

  if (!UUID_REGEX.test(input.lifeAreaId)) {
    return { success: false, error: "Invalid life area." };
  }

  if (!name || name.length > 200) {
    return {
      success: false,
      error: "Name must be between 1 and 200 characters.",
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
    .from("projects")
    .insert({
      user_id: input.userId,
      life_area_id: input.lifeAreaId,
      name,
      description: description || null,
      priority,
      due_at,
      status: "active",
    })
    .select(PROJECT_SELECT)
    .single();

  if (error || !data) {
    return { success: false, error: "Could not create project." };
  }

  return { success: true, project: data };
}

export async function updateProjectStatus(
  supabase: SupabaseClient,
  input: {
    userId: string;
    lifeAreaId: string;
    projectId: string;
    status: string;
  },
): Promise<UpdateProjectStatusResult> {
  const status = input.status.trim();

  if (!UUID_REGEX.test(input.projectId) || !UUID_REGEX.test(input.lifeAreaId)) {
    return { success: false, error: "Invalid project." };
  }

  if (!VALID_STATUSES.has(status)) {
    return { success: false, error: "Invalid project status." };
  }

  const { data, error } = await supabase
    .from("projects")
    .update({ status })
    .eq("id", input.projectId)
    .eq("user_id", input.userId)
    .eq("life_area_id", input.lifeAreaId)
    .select(PROJECT_SELECT)
    .single();

  if (error || !data) {
    return {
      success: false,
      error: "Project not found or could not be updated.",
    };
  }

  return { success: true, project: data };
}
