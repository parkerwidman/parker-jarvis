"use server";

import { revalidateAfterTaskCompletion } from "@/lib/jarvis/goals/revalidate-goal-pages";
import { createClient } from "@/lib/supabase/server";
import { completeTask as completeTaskUnified } from "@/lib/jarvis/tools/task-tools";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const VALID_PRIORITIES = new Set(["low", "medium", "high"]);

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

export async function createTask(formData: FormData) {
  const title = ((formData.get("title") as string) ?? "").trim();
  const rawPriority = ((formData.get("priority") as string) ?? "").trim();
  const priority = VALID_PRIORITIES.has(rawPriority) ? rawPriority : "medium";
  const rawDueDate = ((formData.get("dueDate") as string) ?? "").trim();
  const due_at = parseDueDate(rawDueDate);

  if (!title || title.length > 200) {
    redirect("/tasks?error=Title must be between 1 and 200 characters");
  }

  const supabase = await createClient();

  const { data, error: authError } = await supabase.auth.getClaims();

  if (authError || !data?.claims) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("tasks")
    .insert({ title, priority, due_at });

  if (error) {
    redirect("/tasks?error=Could not create task");
  }

  revalidatePath("/");
  revalidatePath("/tasks");
  redirect("/tasks");
}

export async function completeTask(formData: FormData) {
  const taskId = (formData.get("taskId") as string) ?? "";

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      taskId,
    )
  ) {
    redirect("/tasks");
  }

  const supabase = await createClient();

  const { data, error: authError } = await supabase.auth.getClaims();

  if (authError || !data?.claims) {
    redirect("/login");
  }

  const userId =
    typeof data.claims.sub === "string" ? data.claims.sub.trim() : "";

  if (!userId) {
    redirect("/login");
  }

  const result = await completeTaskUnified(supabase, userId, { taskId });

  if (!result.success) {
    redirect(`/tasks?error=${encodeURIComponent(result.error)}`);
  }

  revalidateAfterTaskCompletion(result.goalTaskCompleted);
  redirect("/tasks");
}
