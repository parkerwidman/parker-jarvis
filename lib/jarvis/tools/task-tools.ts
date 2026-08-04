import { ensureLifeAreaForModule } from "@/lib/jarvis/life-areas/ensure-life-area-for-module";
import { isLifeAreaModuleKey } from "@/lib/jarvis/life-areas/module-registry";
import type { SupabaseClient } from "@supabase/supabase-js";

const VALID_PRIORITIES = new Set(["low", "medium", "high"]);

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TASK_SELECT =
  "id, title, status, priority, due_at, completed_at, created_at";

export type TaskRecord = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type ListTasksResult =
  | { success: true; tasks: TaskRecord[] }
  | { success: false; error: string };

export type CreateTaskResult =
  | { success: true; task: TaskRecord }
  | { success: false; error: string };

export type CompleteTaskResult =
  | { success: true; task: TaskRecord }
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

function compareTasks(a: TaskRecord, b: TaskRecord): number {
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

export async function listTasks(
  supabase: SupabaseClient,
  userId: string,
  options?: {
    lifeAreaModuleKey?: string;
    unfinishedOnly?: boolean;
  },
): Promise<ListTasksResult> {
  let query = supabase.from("tasks").select(TASK_SELECT).eq("user_id", userId);

  const moduleKey = options?.lifeAreaModuleKey?.trim();

  if (moduleKey) {
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

    query = query.eq("life_area_id", lifeAreaResult.lifeAreaId);
  }

  if (options?.unfinishedOnly) {
    query = query.neq("status", "done");
  }

  const { data, error } = await query;

  if (error) {
    return { success: false, error: "Could not list tasks." };
  }

  const tasks = [...(data ?? [])].sort(compareTasks).slice(0, 100);

  return { success: true, tasks };
}

export async function createTask(
  supabase: SupabaseClient,
  userId: string,
  input: {
    title: string;
    priority?: string;
    dueDate?: string;
    lifeAreaModuleKey?: string;
  },
): Promise<CreateTaskResult> {
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

  let life_area_id: string | null = null;
  const moduleKey = input.lifeAreaModuleKey?.trim();

  if (moduleKey) {
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

    life_area_id = lifeAreaResult.lifeAreaId;
  }

  const insertRow: {
    title: string;
    priority: string;
    due_at: string | null;
    life_area_id?: string;
  } = {
    title,
    priority,
    due_at,
  };

  if (life_area_id) {
    insertRow.life_area_id = life_area_id;
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert(insertRow)
    .select(TASK_SELECT)
    .single();

  if (error || !data) {
    return { success: false, error: "Could not create task." };
  }

  return { success: true, task: data };
}

export async function completeTask(
  supabase: SupabaseClient,
  userId: string,
  input: { taskId: string },
): Promise<CompleteTaskResult> {
  const taskId = input.taskId.trim();

  if (!UUID_REGEX.test(taskId)) {
    return { success: false, error: "Task ID must be a valid UUID." };
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
