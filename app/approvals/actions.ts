"use server";

import { createOutlookCalendarEvent } from "@/lib/jarvis/tools/microsoft-tools";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const GENERIC_EXECUTION_ERROR =
  "The calendar event could not be created. Please try again or reconnect Microsoft 365.";

type OutlookCalendarEventPayload = {
  subject?: string;
  startDateTime?: string;
  endDateTime?: string;
  timeZone?: string;
  locationName?: string | null;
  notes?: string | null;
};

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

function parseCalendarPayload(payload: unknown): OutlookCalendarEventPayload | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  return payload as OutlookCalendarEventPayload;
}

export async function approveActionRequest(formData: FormData) {
  const actionRequestId = parseActionRequestId(formData);

  if (!actionRequestId) {
    redirect("/approvals");
  }

  const userId = await getAuthenticatedUserId();
  const supabase = await createClient();

  const { data: actionRequest, error: readError } = await supabase
    .from("action_requests")
    .select(
      "id, user_id, action_type, status, payload, expires_at",
    )
    .eq("id", actionRequestId)
    .eq("user_id", userId)
    .maybeSingle();

  if (readError || !actionRequest) {
    redirect("/approvals");
  }

  if (actionRequest.status !== "pending") {
    redirect("/approvals");
  }

  if (
    typeof actionRequest.expires_at === "string" &&
    new Date(actionRequest.expires_at).getTime() <= Date.now()
  ) {
    await supabase
      .from("action_requests")
      .update({ status: "expired" })
      .eq("id", actionRequestId)
      .eq("user_id", userId)
      .eq("status", "pending");

    revalidatePath("/approvals");
    redirect("/approvals");
  }

  if (actionRequest.action_type !== "create_outlook_calendar_event") {
    redirect("/approvals");
  }

  const { data: executingRequest, error: executingError } = await supabase
    .from("action_requests")
    .update({ status: "executing" })
    .eq("id", actionRequestId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (executingError || !executingRequest) {
    redirect("/approvals");
  }

  const payload = parseCalendarPayload(actionRequest.payload);

  if (
    !payload ||
    typeof payload.subject !== "string" ||
    typeof payload.startDateTime !== "string" ||
    typeof payload.endDateTime !== "string"
  ) {
    const now = new Date().toISOString();

    await supabase
      .from("action_requests")
      .update({
        status: "failed",
        approved_at: now,
        executed_at: now,
        safe_error_message: GENERIC_EXECUTION_ERROR,
      })
      .eq("id", actionRequestId)
      .eq("user_id", userId);

    revalidatePath("/approvals");
    revalidatePath("/");
    redirect("/approvals");
  }

  const result = await createOutlookCalendarEvent(supabase, userId, {
    actionRequestId,
    subject: payload.subject,
    startDateTime: payload.startDateTime,
    endDateTime: payload.endDateTime,
    locationName:
      typeof payload.locationName === "string" ? payload.locationName : null,
    notes: typeof payload.notes === "string" ? payload.notes : null,
  });

  const now = new Date().toISOString();

  if (result.success) {
    await supabase
      .from("action_requests")
      .update({
        status: "completed",
        approved_at: now,
        executed_at: now,
        result: {
          eventId: result.eventId,
          subject: result.subject,
          start: result.start,
          end: result.end,
          webLink: result.webLink,
        },
        safe_error_message: null,
      })
      .eq("id", actionRequestId)
      .eq("user_id", userId);
  } else {
    await supabase
      .from("action_requests")
      .update({
        status: "failed",
        approved_at: now,
        executed_at: now,
        safe_error_message: GENERIC_EXECUTION_ERROR,
      })
      .eq("id", actionRequestId)
      .eq("user_id", userId);
  }

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
