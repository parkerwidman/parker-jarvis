"use server";

import {
  archiveMelusiThread,
  createMelusiThread,
} from "@/lib/jarvis/agents/agent-thread-tools";
import { isValidThreadId } from "@/lib/jarvis/agents/types";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

export async function createMelusiResearchThread(formData: FormData) {
  const title = ((formData.get("title") as string) ?? "").trim();

  const supabase = await createClient();
  const userId = await requireAuthenticatedUser(supabase);

  const result = await createMelusiThread(
    supabase,
    userId,
    "research",
    title || "Research",
  );

  revalidatePath("/melusi/threads");
  revalidatePath("/melusi");

  if (!result.success) {
    redirect(`/melusi/threads?error=${encodeURIComponent(result.error)}`);
  }

  redirect(`/melusi/threads/${result.thread.id}`);
}

export async function createMelusiCampaignThread(formData: FormData) {
  const title = ((formData.get("title") as string) ?? "").trim();

  const supabase = await createClient();
  const userId = await requireAuthenticatedUser(supabase);

  const result = await createMelusiThread(
    supabase,
    userId,
    "campaign",
    title || "Campaign",
  );

  revalidatePath("/melusi/threads");
  revalidatePath("/melusi");

  if (!result.success) {
    redirect(`/melusi/threads?error=${encodeURIComponent(result.error)}`);
  }

  redirect(`/melusi/threads/${result.thread.id}`);
}

export async function archiveMelusiThreadAction(formData: FormData) {
  const threadId = ((formData.get("threadId") as string) ?? "").trim();

  if (!isValidThreadId(threadId)) {
    redirect("/melusi/threads");
  }

  const supabase = await createClient();
  const userId = await requireAuthenticatedUser(supabase);

  const result = await archiveMelusiThread(supabase, userId, threadId);

  revalidatePath("/melusi/threads");
  revalidatePath("/melusi");

  if (!result.success) {
    redirect(`/melusi/threads?error=${encodeURIComponent(result.error)}`);
  }

  redirect("/melusi/threads?archived=1");
}
