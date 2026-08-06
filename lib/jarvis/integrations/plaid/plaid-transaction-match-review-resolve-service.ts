import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const PLAID_REVIEW_RESOLVE_ACTIONS = [
  "match_existing",
  "import_new",
] as const;

export type PlaidReviewResolveAction =
  (typeof PLAID_REVIEW_RESOLVE_ACTIONS)[number];

export type PlaidReviewResolveResult =
  | { success: true; code: "matched_existing" | "imported_new" }
  | { success: false; code: string };

export function mapPlaidReviewResolveErrorToUserMessage(_code: string): string {
  return "This review item could not be resolved. Refresh the page and try again.";
}

export async function resolvePlaidTransactionMatchReviewItem(
  supabase: SupabaseClient,
  input: {
    userId: string;
    reviewItemId: string;
    action: PlaidReviewResolveAction;
    candidateId?: string | null;
  },
): Promise<PlaidReviewResolveResult> {
  const { data, error } = await supabase.rpc(
    "resolve_plaid_transaction_match_review_item",
    {
      p_user_id: input.userId,
      p_review_item_id: input.reviewItemId,
      p_action: input.action,
      p_candidate_id:
        input.action === "match_existing" ? (input.candidateId ?? null) : null,
    },
  );

  if (error) {
    return { success: false, code: "rpc_error" };
  }

  if (
    typeof data !== "object" ||
    data === null ||
    typeof (data as { success?: unknown }).success !== "boolean"
  ) {
    return { success: false, code: "invalid_response" };
  }

  const response = data as {
    success: boolean;
    code?: string;
  };

  if (!response.success) {
    return {
      success: false,
      code: typeof response.code === "string" ? response.code : "resolve_failed",
    };
  }

  if (
    response.code === "matched_existing" ||
    response.code === "imported_new"
  ) {
    return { success: true, code: response.code };
  }

  return { success: false, code: "invalid_response" };
}
