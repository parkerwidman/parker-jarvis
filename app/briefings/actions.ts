"use server";

import { generateMorningBrief } from "@/lib/jarvis/briefings/generate-morning-brief";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function generateMorningBriefAction() {
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

  await generateMorningBrief(supabase, userId);

  revalidatePath("/briefings");
  revalidatePath("/");
  redirect("/briefings");
}
