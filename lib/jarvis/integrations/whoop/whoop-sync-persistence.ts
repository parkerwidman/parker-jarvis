import "server-only";

import { createAutomationClient } from "@/lib/supabase/automation";
import {
  WHOOP_SYNC_STALE_MS,
} from "@/lib/jarvis/integrations/whoop/whoop-sync-config";
import { buildWhoopSyncStaleClaimOrFilter } from "@/lib/jarvis/integrations/whoop/whoop-sync-claim-filter";
import {
  WHOOP_SYNC_ERROR_CODES,
  type WhoopSyncErrorCode,
} from "@/lib/jarvis/integrations/whoop/whoop-sync-errors";
import type {
  WhoopBodyMeasurementRow,
  WhoopCycleRow,
  WhoopRecoveryRow,
  WhoopSleepRow,
  WhoopWorkoutRow,
} from "@/lib/jarvis/integrations/whoop/whoop-types";

type MetricInsert<T> = Omit<T, "id" | "created_at" | "updated_at">;

function getAutomationClient() {
  return createAutomationClient();
}

export type WhoopSyncClaimResult =
  | { claimed: true; connectionId: string; whoopUserId: number }
  | { claimed: false; reason: "not_connected" | "in_progress" };

export async function claimWhoopSync(userId: string): Promise<WhoopSyncClaimResult> {
  const supabase = getAutomationClient();

  const { data: connection, error: connectionError } = await supabase
    .from("whoop_connections")
    .select("id, status, whoop_user_id, sync_in_progress_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (
    connectionError ||
    !connection ||
    connection.status !== "connected" ||
    typeof connection.whoop_user_id !== "number"
  ) {
    return { claimed: false, reason: "not_connected" };
  }

  const staleBefore = new Date(Date.now() - WHOOP_SYNC_STALE_MS).toISOString();
  const now = new Date().toISOString();
  const claimOrFilter = buildWhoopSyncStaleClaimOrFilter(staleBefore);

  const { data: claimed, error: claimError } = await supabase
    .from("whoop_connections")
    .update({ sync_in_progress_at: now })
    .eq("id", connection.id)
    .eq("status", "connected")
    .or(claimOrFilter)
    .select("id")
    .maybeSingle();

  if (claimError || !claimed) {
    return { claimed: false, reason: "in_progress" };
  }

  return {
    claimed: true,
    connectionId: connection.id,
    whoopUserId: connection.whoop_user_id,
  };
}

export async function releaseWhoopSyncClaim(userId: string): Promise<void> {
  const supabase = getAutomationClient();

  await supabase
    .from("whoop_connections")
    .update({ sync_in_progress_at: null })
    .eq("user_id", userId)
    .not("sync_in_progress_at", "is", null);
}

export async function markWhoopSyncSuccess(
  userId: string,
  syncedAt: string,
): Promise<void> {
  const supabase = getAutomationClient();

  const { error } = await supabase
    .from("whoop_connections")
    .update({
      last_successful_sync_at: syncedAt,
      last_error_code: null,
      sync_in_progress_at: null,
    })
    .eq("user_id", userId);

  if (error) {
    throw new Error(WHOOP_SYNC_ERROR_CODES.databaseFailed);
  }
}

export async function markWhoopSyncFailure(
  userId: string,
  errorCode: WhoopSyncErrorCode,
): Promise<void> {
  const supabase = getAutomationClient();

  await supabase
    .from("whoop_connections")
    .update({
      last_error_code: errorCode,
      sync_in_progress_at: null,
    })
    .eq("user_id", userId);
}

async function upsertRows(
  table:
    | "whoop_cycles"
    | "whoop_sleeps"
    | "whoop_recoveries"
    | "whoop_workouts"
    | "whoop_body_measurements",
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const supabase = getAutomationClient();
  const { error } = await supabase.from(table).upsert(rows as never[], {
    onConflict,
  });

  if (error) {
    throw new Error(WHOOP_SYNC_ERROR_CODES.databaseFailed);
  }
}

export async function upsertWhoopCycles(
  rows: MetricInsert<WhoopCycleRow>[],
): Promise<void> {
  await upsertRows("whoop_cycles", rows, "user_id,whoop_cycle_id");
}

export async function upsertWhoopRecoveries(
  rows: MetricInsert<WhoopRecoveryRow>[],
): Promise<void> {
  await upsertRows("whoop_recoveries", rows, "user_id,whoop_sleep_id");
}

export async function upsertWhoopSleeps(
  rows: MetricInsert<WhoopSleepRow>[],
): Promise<void> {
  await upsertRows("whoop_sleeps", rows, "user_id,whoop_sleep_id");
}

export async function upsertWhoopWorkouts(
  rows: MetricInsert<WhoopWorkoutRow>[],
): Promise<void> {
  await upsertRows("whoop_workouts", rows, "user_id,whoop_workout_id");
}

export async function upsertWhoopBodyMeasurement(
  row: MetricInsert<WhoopBodyMeasurementRow>,
): Promise<void> {
  await upsertRows("whoop_body_measurements", [row], "user_id");
}
