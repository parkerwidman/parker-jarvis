"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  isValidRitualDate,
  MORNING_RITUAL_BYPASS_COOKIE,
} from "@/lib/jarvis/rituals/morning-ritual-bypass";

export async function continueToJarvisFromRitual(formData: FormData) {
  const ritualDate = String(formData.get("ritualDate") ?? "");

  if (!isValidRitualDate(ritualDate)) {
    redirect("/wake");
  }

  const cookieStore = await cookies();
  cookieStore.set(MORNING_RITUAL_BYPASS_COOKIE, ritualDate, {
    path: "/",
    maxAge: 60 * 60 * 24,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });

  redirect("/");
}
