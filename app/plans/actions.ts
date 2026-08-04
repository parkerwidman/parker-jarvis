"use server";

import { generateDailyPlan } from "@/lib/jarvis/plans/generate-daily-plan";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function generateDailyPlanAction() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/login");
  }

  const userId =
    typeof data.claims.sub === "string" ? data.claims.sub : null;

  if (!userId) {
    redirect("/login");
  }

  const result = await generateDailyPlan(supabase, userId);

  revalidatePath("/plans");
  revalidatePath("/");

  if (result.success) {
    redirect("/plans?generated=1");
  }

  redirect("/plans?error=1");
}
