"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
