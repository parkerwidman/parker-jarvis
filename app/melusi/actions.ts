"use server";

import { ensureMelusiLifeArea } from "@/lib/jarvis/life-areas/ensure-melusi-life-area";
import { getLifeAreaModule } from "@/lib/jarvis/life-areas/module-registry";
import {
  createProject,
  updateProjectStatus,
} from "@/lib/jarvis/projects/project-tools";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

export async function createMelusiProject(formData: FormData) {
  const name = ((formData.get("name") as string) ?? "").trim();
  const description = ((formData.get("description") as string) ?? "").trim();
  const rawPriority = ((formData.get("priority") as string) ?? "").trim();
  const priority = VALID_PRIORITIES.has(rawPriority) ? rawPriority : "medium";
  const rawDueDate = ((formData.get("dueDate") as string) ?? "").trim();

  const supabase = await createClient();
  const userId = await requireAuthenticatedUser(supabase);

  const lifeAreaResult = await ensureMelusiLifeArea(supabase, userId);

  if (!lifeAreaResult.success) {
    redirect("/melusi?error=Could not initialize Melusi module");
  }

  const result = await createProject(supabase, {
    userId,
    lifeAreaId: lifeAreaResult.lifeAreaId,
    name,
    description,
    priority,
    dueDate: rawDueDate,
  });

  revalidatePath("/melusi");
  revalidatePath("/");

  if (!result.success) {
    redirect(`/melusi?error=${encodeURIComponent(result.error)}`);
  }

  redirect("/melusi?created=1");
}

export async function updateMelusiProjectStatus(formData: FormData) {
  const projectId = ((formData.get("projectId") as string) ?? "").trim();
  const status = ((formData.get("status") as string) ?? "").trim();

  if (!UUID_REGEX.test(projectId)) {
    redirect("/melusi");
  }

  if (!VALID_STATUSES.has(status)) {
    redirect("/melusi?error=Invalid project status");
  }

  const supabase = await createClient();
  const userId = await requireAuthenticatedUser(supabase);
  const module = getLifeAreaModule("melusi");

  const { data: lifeAreaRow } = await supabase
    .from("life_areas")
    .select("id")
    .eq("user_id", userId)
    .eq("name", module.lifeAreaName)
    .maybeSingle();

  if (!lifeAreaRow?.id) {
    redirect("/melusi?error=Could not update project");
  }

  const result = await updateProjectStatus(supabase, {
    userId,
    lifeAreaId: lifeAreaRow.id,
    projectId,
    status,
  });

  revalidatePath("/melusi");
  revalidatePath(`/melusi/projects/${projectId}`);
  revalidatePath("/");

  if (!result.success) {
    redirect("/melusi?error=Could not update project");
  }

  redirect("/melusi?updated=1");
}

export async function completeMelusiTaskFromDashboard(formData: FormData) {
  const taskId = (formData.get("taskId") as string) ?? "";

  if (!UUID_REGEX.test(taskId)) {
    redirect("/melusi");
  }

  const supabase = await createClient();
  await requireAuthenticatedUser(supabase);

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("tasks")
    .update({
      status: "done",
      completed_at: now,
      updated_at: now,
    })
    .eq("id", taskId);

  if (error) {
    redirect("/melusi?error=Could%20not%20complete%20task");
  }

  revalidatePath("/melusi");
  revalidatePath("/");
  revalidatePath("/tasks");
  redirect("/melusi");
}
