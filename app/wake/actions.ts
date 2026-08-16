"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { applyMorningRitualBypassCookie } from "@/lib/jarvis/rituals/morning-ritual-bypass";

export async function continueToJarvisFromRitual(formData: FormData) {
  const ritualDate = String(formData.get("ritualDate") ?? "");
  const cookieStore = await cookies();

  if (!applyMorningRitualBypassCookie(cookieStore, ritualDate)) {
    redirect("/wake");
  }

  redirect("/");
}
