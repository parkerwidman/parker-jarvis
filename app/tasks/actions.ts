"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const VALID_PRIORITIES = new Set(["low", "medium", "high"]);

export async function createTask(formData: FormData) {
  const title = ((formData.get("title") as string) ?? "").trim();
  const rawPriority = ((formData.get("priority") as string) ?? "").trim();
  const priority = VALID_PRIORITIES.has(rawPriority) ? rawPriority : "medium";

  if (!title || title.length > 200) {
    redirect("/tasks?error=Title must be between 1 and 200 characters");
  }

  const supabase = await createClient();

  const { data, error: authError } = await supabase.auth.getClaims();

  if (authError || !data?.claims) {
    redirect("/login");
  }

  const { error } = await supabase.from("tasks").insert({ title, priority });

  if (error) {
    redirect("/tasks?error=Could not create task");
  }

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
    redirect("/tasks?error=Could not complete task");
  }

  revalidatePath("/tasks");
  redirect("/tasks");
}
