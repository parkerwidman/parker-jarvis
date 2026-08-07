"use server";

import { createClient } from "@/lib/supabase/server";
import { completeTask } from "@/lib/jarvis/tools/task-tools";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const TASK_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CompletePriorityTaskResult =
  | { ok: true }
  | { ok: false; error: string };

export async function completePriorityTask(
  taskId: string,
): Promise<CompletePriorityTaskResult> {
  const normalizedTaskId = taskId.trim();

  if (!TASK_ID_REGEX.test(normalizedTaskId)) {
    return { ok: false, error: "Invalid task." };
  }

  const supabase = await createClient();
  const { data, error: authError } = await supabase.auth.getClaims();

  if (authError || !data?.claims) {
    return { ok: false, error: "You must be signed in to complete a task." };
  }

  const userId =
    typeof data.claims.sub === "string" ? data.claims.sub.trim() : "";

  if (!userId) {
    return { ok: false, error: "You must be signed in to complete a task." };
  }

  const result = await completeTask(supabase, userId, {
    taskId: normalizedTaskId,
  });

  if (!result.success) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/");
  revalidatePath("/tasks");

  return { ok: true };
}

export async function completeTaskFromDashboard(formData: FormData) {
  const taskId = (formData.get("taskId") as string) ?? "";

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      taskId,
    )
  ) {
    redirect("/");
  }

  const supabase = await createClient();

  const { data, error: authError } = await supabase.auth.getClaims();

  if (authError || !data?.claims) {
    redirect("/login");
  }

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
    redirect("/?error=Could%20not%20complete%20task");
  }

  revalidatePath("/");
  revalidatePath("/tasks");
  redirect("/");
}
