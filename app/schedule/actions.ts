"use server";

import {
  createScheduleBlock,
  deleteScheduleBlock,
  saveScheduleBlockEdit,
} from "@/lib/jarvis/schedule/schedule-mutations";
import type {
  ScheduleBlockEditContext,
  ScheduleBlockFormValues,
  ScheduleCreateKind,
  ScheduleDeleteScope,
  ScheduleEditScope,
  ScheduleMutationResult,
  ScheduleOneTimeCreateInput,
  ScheduleRecurringCreateInput,
} from "@/lib/jarvis/schedule/schedule-mutation-types";
import {
  validateRecurringCreateInput,
  validateScheduleBlockForm,
} from "@/lib/jarvis/schedule/schedule-validation";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type ScheduleActionResult = ScheduleMutationResult;

async function requireAuthenticatedUser(): Promise<
  | { ok: true; userId: string; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return { ok: false, error: "You must be signed in to update your schedule." };
  }

  const userId =
    typeof data.claims.sub === "string" ? data.claims.sub : null;

  if (!userId) {
    return { ok: false, error: "You must be signed in to update your schedule." };
  }

  return { ok: true, userId, supabase };
}

function revalidateSchedulePage() {
  revalidatePath("/schedule");
}

export async function saveScheduleBlockAction(input: {
  context: ScheduleBlockEditContext;
  form: ScheduleBlockFormValues;
  scope: ScheduleEditScope;
  scheduleStartDate: string;
  scheduleEndDate: string;
}): Promise<ScheduleActionResult> {
  const auth = await requireAuthenticatedUser();

  if (!auth.ok) {
    return auth;
  }

  const validationError = validateScheduleBlockForm(input.form, {
    startDate: input.scheduleStartDate,
    endDate: input.scheduleEndDate,
  });

  if (validationError) {
    return { ok: false, error: validationError };
  }

  const result = await saveScheduleBlockEdit(
    auth.supabase,
    input.context,
    input.form,
    input.scope,
  );

  if (result.ok) {
    revalidateSchedulePage();
  }

  return result;
}

export async function deleteScheduleBlockAction(input: {
  context: ScheduleBlockEditContext;
  scope: ScheduleDeleteScope;
}): Promise<ScheduleActionResult> {
  const auth = await requireAuthenticatedUser();

  if (!auth.ok) {
    return auth;
  }

  const result = await deleteScheduleBlock(
    auth.supabase,
    input.context,
    input.scope,
  );

  if (result.ok) {
    revalidateSchedulePage();
  }

  return result;
}

export async function createScheduleBlockAction(input: {
  kind: ScheduleCreateKind;
  form: ScheduleRecurringCreateInput | ScheduleOneTimeCreateInput;
  scheduleStartDate: string;
  scheduleEndDate: string;
}): Promise<ScheduleActionResult> {
  const auth = await requireAuthenticatedUser();

  if (!auth.ok) {
    return auth;
  }

  const bounds = {
    startDate: input.scheduleStartDate,
    endDate: input.scheduleEndDate,
  };

  const validationError =
    input.kind === "recurring"
      ? validateRecurringCreateInput(
          input.form as ScheduleRecurringCreateInput,
          bounds,
        )
      : validateScheduleBlockForm(input.form, bounds);

  if (validationError) {
    return { ok: false, error: validationError };
  }

  const result = await createScheduleBlock(
    auth.supabase,
    input.kind,
    input.form,
  );

  if (result.ok) {
    revalidateSchedulePage();
  }

  return result;
}
