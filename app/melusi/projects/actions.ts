"use server";

import {
  completeProjectTask,
  createProjectTask,
  loadTrustedMelusiProject,
} from "@/lib/jarvis/projects/project-task-tools";
import { createProjectUpdate } from "@/lib/jarvis/projects/project-update-tools";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const VALID_PRIORITIES = new Set(["low", "medium", "high"]);

const VALID_UPDATE_TYPES = new Set(["progress", "blocker", "decision", "note"]);

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireAuthenticatedUser(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/login");
  }

  const userId =
    typeof data.claims.sub === "string" ? data.claims.sub : null;

  if (!userId) {
    redirect("/login");
  }

  return userId;
}

function projectPath(projectId: string): string {
  return `/melusi/projects/${projectId}`;
}

export async function createMelusiProjectTask(formData: FormData) {
  const projectId = ((formData.get("projectId") as string) ?? "").trim();
  const title = ((formData.get("title") as string) ?? "").trim();
  const rawPriority = ((formData.get("priority") as string) ?? "").trim();
  const priority = VALID_PRIORITIES.has(rawPriority) ? rawPriority : "medium";
  const rawDueDate = ((formData.get("dueDate") as string) ?? "").trim();

  if (!UUID_REGEX.test(projectId)) {
    redirect("/melusi");
  }

  const supabase = await createClient();
  const userId = await requireAuthenticatedUser(supabase);

  const projectResult = await loadTrustedMelusiProject(
    supabase,
    userId,
    projectId,
  );

  if (!projectResult.success) {
    redirect("/melusi");
  }

  const result = await createProjectTask(
    supabase,
    userId,
    projectResult.project,
    {
      title,
      priority,
      dueDate: rawDueDate,
    },
  );

  revalidatePath(projectPath(projectId));
  revalidatePath("/melusi");
  revalidatePath("/");

  if (!result.success) {
    redirect(
      `${projectPath(projectId)}?error=${encodeURIComponent(result.error)}`,
    );
  }

  redirect(`${projectPath(projectId)}?created=1`);
}

export async function completeMelusiProjectTask(formData: FormData) {
  const projectId = ((formData.get("projectId") as string) ?? "").trim();
  const taskId = ((formData.get("taskId") as string) ?? "").trim();

  if (!UUID_REGEX.test(projectId) || !UUID_REGEX.test(taskId)) {
    redirect("/melusi");
  }

  const supabase = await createClient();
  const userId = await requireAuthenticatedUser(supabase);

  const projectResult = await loadTrustedMelusiProject(
    supabase,
    userId,
    projectId,
  );

  if (!projectResult.success) {
    redirect("/melusi");
  }

  const result = await completeProjectTask(
    supabase,
    userId,
    projectResult.project,
    taskId,
  );

  revalidatePath(projectPath(projectId));
  revalidatePath("/melusi");
  revalidatePath("/");

  if (!result.success) {
    redirect(
      `${projectPath(projectId)}?error=${encodeURIComponent(result.error)}`,
    );
  }

  redirect(`${projectPath(projectId)}?completed=1`);
}

export async function createMelusiProjectUpdate(formData: FormData) {
  const projectId = ((formData.get("projectId") as string) ?? "").trim();
  const rawUpdateType = ((formData.get("updateType") as string) ?? "").trim();
  const updateType = VALID_UPDATE_TYPES.has(rawUpdateType)
    ? rawUpdateType
    : "";
  const content = ((formData.get("content") as string) ?? "").trim();

  if (!UUID_REGEX.test(projectId)) {
    redirect("/melusi");
  }

  const supabase = await createClient();
  const userId = await requireAuthenticatedUser(supabase);

  const projectResult = await loadTrustedMelusiProject(
    supabase,
    userId,
    projectId,
  );

  if (!projectResult.success) {
    redirect("/melusi");
  }

  const result = await createProjectUpdate(
    supabase,
    userId,
    projectResult.project,
    {
      updateType,
      content,
    },
  );

  revalidatePath(projectPath(projectId));
  revalidatePath("/melusi");
  revalidatePath("/");

  if (!result.success) {
    redirect(
      `${projectPath(projectId)}?error=${encodeURIComponent(result.error)}`,
    );
  }

  redirect(`${projectPath(projectId)}?updateAdded=1`);
}
