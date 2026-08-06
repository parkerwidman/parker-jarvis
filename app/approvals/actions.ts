"use server";

import { executeApprovedActionRequest } from "@/lib/jarvis/action-requests/approval-execution";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getAuthenticatedUserId(): Promise<string> {
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

  return userId;
}

function parseActionRequestId(formData: FormData): string | null {
  const actionRequestId = (formData.get("actionRequestId") as string) ?? "";

  if (!UUID_REGEX.test(actionRequestId)) {
    return null;
  }

  return actionRequestId;
}

export async function approveActionRequest(formData: FormData) {
  const actionRequestId = parseActionRequestId(formData);

  if (!actionRequestId) {
    redirect("/approvals");
  }

  const userId = await getAuthenticatedUserId();
  const supabase = await createClient();

  await executeApprovedActionRequest(supabase, userId, actionRequestId);

  revalidatePath("/approvals");
  revalidatePath("/");
  redirect("/approvals");
}

export async function rejectActionRequest(formData: FormData) {
  const actionRequestId = parseActionRequestId(formData);

  if (!actionRequestId) {
    redirect("/approvals");
  }

  const userId = await getAuthenticatedUserId();
  const supabase = await createClient();

  const now = new Date().toISOString();

  await supabase
    .from("action_requests")
    .update({
      status: "rejected",
      rejected_at: now,
    })
    .eq("id", actionRequestId)
    .eq("user_id", userId)
    .eq("status", "pending");

  revalidatePath("/approvals");
  redirect("/approvals");
}
