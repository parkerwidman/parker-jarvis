"use server";

import {
  mapPlaidReviewResolveErrorToUserMessage,
  PLAID_REVIEW_RESOLVE_ACTIONS,
  resolvePlaidTransactionMatchReviewItem,
  type PlaidReviewResolveAction,
} from "@/lib/jarvis/integrations/plaid/plaid-transaction-match-review-resolve-service";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PlaidReviewResolutionActionResult =
  | { success: true; code: "matched_existing" | "imported_new" }
  | { success: false; error: string };

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

function parseReviewItemId(formData: FormData): string | null {
  const reviewItemId = (formData.get("reviewItemId") as string) ?? "";
  return UUID_REGEX.test(reviewItemId) ? reviewItemId : null;
}

function parseCandidateId(formData: FormData): string | null {
  const candidateId = (formData.get("candidateId") as string) ?? "";
  return UUID_REGEX.test(candidateId) ? candidateId : null;
}

function parseAction(formData: FormData): PlaidReviewResolveAction | null {
  const action = (formData.get("action") as string) ?? "";
  return PLAID_REVIEW_RESOLVE_ACTIONS.includes(action as PlaidReviewResolveAction)
    ? (action as PlaidReviewResolveAction)
    : null;
}

function parseConfirmation(formData: FormData): boolean {
  return formData.get("confirmed") === "true";
}

async function resolveReviewItem(
  formData: FormData,
): Promise<PlaidReviewResolutionActionResult> {
  const reviewItemId = parseReviewItemId(formData);
  const action = parseAction(formData);

  if (!reviewItemId || !action) {
    return {
      success: false,
      error: mapPlaidReviewResolveErrorToUserMessage("invalid_input"),
    };
  }

  if (!parseConfirmation(formData)) {
    return {
      success: false,
      error: "Confirm this decision before continuing.",
    };
  }

  const candidateId =
    action === "match_existing" ? parseCandidateId(formData) : null;

  if (action === "match_existing" && !candidateId) {
    return {
      success: false,
      error: mapPlaidReviewResolveErrorToUserMessage("invalid_input"),
    };
  }

  const userId = await getAuthenticatedUserId();
  const supabase = await createClient();
  const result = await resolvePlaidTransactionMatchReviewItem(supabase, {
    userId,
    reviewItemId,
    action,
    candidateId,
  });

  if (!result.success) {
    return {
      success: false,
      error: mapPlaidReviewResolveErrorToUserMessage(result.code),
    };
  }

  revalidatePath("/finance/plaid-review");
  revalidatePath("/finance");
  revalidatePath("/connections/plaid");

  return { success: true, code: result.code };
}

export async function matchPlaidReviewCandidate(
  formData: FormData,
): Promise<PlaidReviewResolutionActionResult> {
  formData.set("action", "match_existing");
  return resolveReviewItem(formData);
}

export async function importPlaidReviewAsNew(
  formData: FormData,
): Promise<PlaidReviewResolutionActionResult> {
  formData.set("action", "import_new");
  return resolveReviewItem(formData);
}
