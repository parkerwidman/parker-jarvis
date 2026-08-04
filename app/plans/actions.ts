"use server";

import type { PlanItem } from "@/lib/jarvis/plans/generate-daily-plan";
import { generateDailyPlan } from "@/lib/jarvis/plans/generate-daily-plan";
import {
  buildDailyPlanCalendarNotes,
  buildDailyPlanItemKey,
  isBlockingCalendarRequestStatus,
  isProposableSuggestedPlanItem,
  parseDailyPlanItemKeyFromPayload,
} from "@/lib/jarvis/plans/plan-item-calendar";
import { proposeOutlookCalendarEvent } from "@/lib/jarvis/tools/action-request-tools";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parsePlanItems(raw: unknown): PlanItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter(
    (item): item is PlanItem =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as PlanItem).startTime === "string" &&
      typeof (item as PlanItem).title === "string",
  );
}

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

export async function proposeDailyPlanItemForCalendarAction(formData: FormData) {
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

  const dailyPlanId = (formData.get("dailyPlanId") as string) ?? "";
  const itemIndexRaw = (formData.get("itemIndex") as string) ?? "";

  if (!UUID_REGEX.test(dailyPlanId)) {
    redirect("/approvals?error=invalid");
  }

  const itemIndex = Number.parseInt(itemIndexRaw, 10);

  if (!Number.isInteger(itemIndex) || itemIndex < 0) {
    redirect("/approvals?error=invalid");
  }

  const { data: plan, error: planError } = await supabase
    .from("daily_plans")
    .select("id, timezone, plan_items, status")
    .eq("id", dailyPlanId)
    .eq("user_id", userId)
    .maybeSingle();

  if (planError || !plan || plan.status !== "completed") {
    redirect("/approvals?error=invalid");
  }

  const planItems = parsePlanItems(plan.plan_items);
  const item = planItems[itemIndex];

  if (!isProposableSuggestedPlanItem(item)) {
    redirect("/approvals?error=invalid");
  }

  const itemKey = buildDailyPlanItemKey(plan.id, item);

  const { data: existingRequests, error: existingError } = await supabase
    .from("action_requests")
    .select("status, payload")
    .eq("user_id", userId)
    .eq("action_type", "create_outlook_calendar_event")
    .in("status", ["pending", "approved", "executing", "completed"]);

  if (existingError) {
    redirect("/approvals?error=failed");
  }

  const hasDuplicate = (existingRequests ?? []).some((request) => {
    if (!isBlockingCalendarRequestStatus(request.status)) {
      return false;
    }

    return parseDailyPlanItemKeyFromPayload(request.payload) === itemKey;
  });

  if (hasDuplicate) {
    redirect("/approvals?error=duplicate");
  }

  const result = await proposeOutlookCalendarEvent(supabase, userId, {
    subject: item.title,
    startDateTime: item.startTime,
    endDateTime: item.endTime,
    timeZone: plan.timezone,
    locationName: null,
    notes: buildDailyPlanCalendarNotes(item),
    dailyPlanSource: {
      dailyPlanId: plan.id,
      dailyPlanItemKey: itemKey,
      reason: item.reason,
    },
  });

  revalidatePath("/plans");
  revalidatePath("/approvals");

  if (result.success) {
    redirect("/approvals?proposed=1");
  }

  redirect("/approvals?error=failed");
}
