"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createTask(formData: FormData) {
  const title = ((formData.get("title") as string) ?? "").trim();

  if (!title || title.length > 200) {
    redirect("/tasks?error=Title must be between 1 and 200 characters");
  }

  const supabase = await createClient();

  const { data, error: authError } = await supabase.auth.getClaims();

  if (authError || !data?.claims) {
    redirect("/login");
  }

  const { error } = await supabase.from("tasks").insert({ title });

  if (error) {
    redirect("/tasks?error=Could not create task");
  }

  revalidatePath("/tasks");
  redirect("/tasks");
}
