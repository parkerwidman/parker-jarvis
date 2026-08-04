import "server-only";

import { ensureLifeAreaForModule } from "@/lib/jarvis/life-areas/ensure-life-area-for-module";
import {
  isLifeAreaModuleKey,
  type LifeAreaModuleKey,
} from "@/lib/jarvis/life-areas/module-registry";
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

export type AssistantProjectSummary = {
  name: string;
  status: string;
  priority: string;
  dueDate: string | null;
  description: string | null;
};

export type ListProjectsForModuleResult =
  | { success: true; projects: AssistantProjectSummary[] }
  | { success: false; error: string };

export type CreateProjectForModuleResult =
  | { success: true; project: AssistantProjectSummary }
  | { success: false; error: string };

export type UpdateProjectStatusForModuleResult =
  | { success: true; project: AssistantProjectSummary }
  | {
      success: false;
      error: string;
      matches?: AssistantProjectSummary[];
    };

function toAssistantProjectSummary(
  project: ProjectRecord,
): AssistantProjectSummary {
  return {
    name: project.name,
    status: project.status,
    priority: project.priority,
    dueDate: project.due_at ? project.due_at.slice(0, 10) : null,
    description: project.description,
  };
}

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
  options?: {
    status?: string;
    priority?: string;
    includeArchived?: boolean;
  },
): Promise<ListProjectsResult> {
  if (!UUID_REGEX.test(lifeAreaId)) {
    return { success: false, error: "Invalid life area." };
  }

  const statusFilter = options?.status?.trim();
  const priorityFilter = options?.priority?.trim();

  if (statusFilter && !VALID_STATUSES.has(statusFilter)) {
    return { success: false, error: "Invalid project status filter." };
  }

  if (priorityFilter && !VALID_PRIORITIES.has(priorityFilter)) {
    return { success: false, error: "Invalid project priority filter." };
  }

  let query = supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("user_id", userId)
    .eq("life_area_id", lifeAreaId);

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  } else if (!options?.includeArchived) {
    query = query.neq("status", "archived");
  }

  if (priorityFilter) {
    query = query.eq("priority", priorityFilter);
  }

  const { data, error } = await query;

  if (error) {
    return { success: false, error: "Could not list projects." };
  }

  return { success: true, projects: data ?? [] };
}

async function findProjectsByName(
  supabase: SupabaseClient,
  userId: string,
  lifeAreaId: string,
  projectName: string,
): Promise<ProjectRecord[]> {
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
    (project) => project.name.trim().toLowerCase() === normalizedName,
  );
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

export async function listProjectsForModule(
  supabase: SupabaseClient,
  userId: string,
  moduleKey: LifeAreaModuleKey,
  options?: {
    status?: string;
    priority?: string;
    includeArchived?: boolean;
  },
): Promise<ListProjectsForModuleResult> {
  if (!isLifeAreaModuleKey(moduleKey)) {
    return { success: false, error: "Invalid life area module." };
  }

  const lifeAreaResult = await ensureLifeAreaForModule(
    supabase,
    userId,
    moduleKey,
  );

  if (!lifeAreaResult.success) {
    return lifeAreaResult;
  }

  const result = await listProjectsForLifeArea(
    supabase,
    userId,
    lifeAreaResult.lifeAreaId,
    options,
  );

  if (!result.success) {
    return result;
  }

  return {
    success: true,
    projects: result.projects.map(toAssistantProjectSummary),
  };
}

export async function createProjectForModule(
  supabase: SupabaseClient,
  userId: string,
  moduleKey: LifeAreaModuleKey,
  input: {
    name: string;
    description?: string;
    priority?: string;
    dueDate?: string;
  },
): Promise<CreateProjectForModuleResult> {
  if (!isLifeAreaModuleKey(moduleKey)) {
    return { success: false, error: "Invalid life area module." };
  }

  const lifeAreaResult = await ensureLifeAreaForModule(
    supabase,
    userId,
    moduleKey,
  );

  if (!lifeAreaResult.success) {
    return lifeAreaResult;
  }

  const result = await createProject(supabase, {
    userId,
    lifeAreaId: lifeAreaResult.lifeAreaId,
    name: input.name,
    description: input.description,
    priority: input.priority,
    dueDate: input.dueDate,
  });

  if (!result.success) {
    return result;
  }

  return {
    success: true,
    project: toAssistantProjectSummary(result.project),
  };
}

export async function updateProjectStatusForModule(
  supabase: SupabaseClient,
  userId: string,
  moduleKey: LifeAreaModuleKey,
  input: {
    projectId?: string;
    projectName?: string;
    status: string;
  },
): Promise<UpdateProjectStatusForModuleResult> {
  if (!isLifeAreaModuleKey(moduleKey)) {
    return { success: false, error: "Invalid life area module." };
  }

  const lifeAreaResult = await ensureLifeAreaForModule(
    supabase,
    userId,
    moduleKey,
  );

  if (!lifeAreaResult.success) {
    return lifeAreaResult;
  }

  const lifeAreaId = lifeAreaResult.lifeAreaId;
  const status = input.status.trim();
  const projectId = input.projectId?.trim() ?? "";
  const projectName = input.projectName?.trim() ?? "";

  if (!VALID_STATUSES.has(status)) {
    return { success: false, error: "Invalid project status." };
  }

  if (!projectId && !projectName) {
    return {
      success: false,
      error: "Provide a project id or project name.",
    };
  }

  let resolvedProjectId = projectId;

  if (!resolvedProjectId) {
    const matches = await findProjectsByName(
      supabase,
      userId,
      lifeAreaId,
      projectName,
    );

    if (matches.length === 0) {
      return { success: false, error: "No matching project was found." };
    }

    if (matches.length > 1) {
      return {
        success: false,
        error: "Multiple projects match that name. Ask Parker to clarify.",
        matches: matches.map(toAssistantProjectSummary),
      };
    }

    resolvedProjectId = matches[0].id;
  }

  const result = await updateProjectStatus(supabase, {
    userId,
    lifeAreaId,
    projectId: resolvedProjectId,
    status,
  });

  if (!result.success) {
    return result;
  }

  return {
    success: true,
    project: toAssistantProjectSummary(result.project),
  };
}
