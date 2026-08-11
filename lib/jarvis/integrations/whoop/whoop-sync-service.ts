import "server-only";

import type {
  WhoopBodyMeasurementRecord,
  WhoopCycleRecord,
  WhoopRecoveryRecord,
  WhoopSleepRecord,
  WhoopWorkoutRecord,
} from "@/lib/jarvis/integrations/whoop/whoop-api-types";
import {
  fetchWhoopJson,
  fetchWhoopPaginatedCollection,
} from "@/lib/jarvis/integrations/whoop/whoop-data-client";
import {
  mapWhoopBodyMeasurementRecord,
  mapWhoopCycleRecord,
  mapWhoopRecoveryRecord,
  mapWhoopSleepRecord,
  mapWhoopWorkoutRecord,
  parseWhoopBodyMeasurementRecord,
} from "@/lib/jarvis/integrations/whoop/whoop-data-mappers";
import {
  WHOOP_BODY_MEASUREMENT_PATH,
  WHOOP_CYCLES_PATH,
  WHOOP_RECOVERIES_PATH,
  WHOOP_SLEEPS_PATH,
  WHOOP_SYNC_BACKFILL_DAYS,
  WHOOP_WORKOUTS_PATH,
  getWhoopReconcileWindow,
  getWhoopSyncWindow,
} from "@/lib/jarvis/integrations/whoop/whoop-sync-config";
import {
  WHOOP_SYNC_ERROR_CODES,
  WhoopSyncError,
  type WhoopSyncErrorCode,
} from "@/lib/jarvis/integrations/whoop/whoop-sync-errors";
import {
  claimWhoopSync,
  markWhoopSyncFailure,
  markWhoopSyncSuccess,
  releaseWhoopSyncClaim,
  upsertWhoopBodyMeasurement,
  upsertWhoopCycles,
  upsertWhoopRecoveries,
  upsertWhoopSleeps,
  upsertWhoopWorkouts,
} from "@/lib/jarvis/integrations/whoop/whoop-sync-persistence";
import { getValidWhoopAccessToken } from "@/lib/jarvis/integrations/whoop/whoop-token-manager";

export type WhoopSyncSummary = {
  cycles: number;
  recoveries: number;
  sleeps: number;
  workouts: number;
  bodyMeasurement: boolean;
  syncedAt: string;
};

export type WhoopSyncResult =
  | { ok: true; summary: WhoopSyncSummary }
  | { ok: false; error: WhoopSyncErrorCode; httpStatus: number };

function parseCycleRecord(record: unknown): WhoopCycleRecord {
  if (typeof record !== "object" || record === null) {
    throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.invalidPayload);
  }

  const candidate = record as WhoopCycleRecord;

  if (
    typeof candidate.id !== "number" ||
    typeof candidate.user_id !== "number"
  ) {
    throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.invalidPayload);
  }

  return candidate;
}

function parseRecoveryRecord(record: unknown): WhoopRecoveryRecord {
  if (typeof record !== "object" || record === null) {
    throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.invalidPayload);
  }

  const candidate = record as WhoopRecoveryRecord;

  if (
    typeof candidate.cycle_id !== "number" ||
    typeof candidate.sleep_id !== "string" ||
    typeof candidate.user_id !== "number"
  ) {
    throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.invalidPayload);
  }

  return candidate;
}

function parseSleepRecord(record: unknown): WhoopSleepRecord {
  if (typeof record !== "object" || record === null) {
    throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.invalidPayload);
  }

  const candidate = record as WhoopSleepRecord;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.user_id !== "number"
  ) {
    throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.invalidPayload);
  }

  return candidate;
}

function parseWorkoutRecord(record: unknown): WhoopWorkoutRecord {
  if (typeof record !== "object" || record === null) {
    throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.invalidPayload);
  }

  const candidate = record as WhoopWorkoutRecord;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.user_id !== "number"
  ) {
    throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.invalidPayload);
  }

  return candidate;
}

function mapSyncError(error: unknown): WhoopSyncErrorCode {
  if (error instanceof WhoopSyncError) {
    return error.code;
  }

  if (error instanceof Error) {
    if (
      Object.values(WHOOP_SYNC_ERROR_CODES).includes(
        error.message as WhoopSyncErrorCode,
      )
    ) {
      return error.message as WhoopSyncErrorCode;
    }
  }

  return WHOOP_SYNC_ERROR_CODES.providerFailed;
}

function syncFailureHttpStatus(code: WhoopSyncErrorCode): number {
  switch (code) {
    case WHOOP_SYNC_ERROR_CODES.notConnected:
      return 400;
    case WHOOP_SYNC_ERROR_CODES.inProgress:
      return 409;
    case WHOOP_SYNC_ERROR_CODES.reconnectRequired:
      return 401;
    default:
      return 502;
  }
}

async function runWhoopCollectionSync(params: {
  userId: string;
  whoopUserId: number;
  accessToken: string;
  window: { start: string; end: string };
  syncedAt: string;
}): Promise<WhoopSyncSummary> {
  const { start, end } = params.window;

  const cycleRecords = await fetchWhoopPaginatedCollection({
    accessToken: params.accessToken,
    path: WHOOP_CYCLES_PATH,
    start,
    end,
    parseRecord: parseCycleRecord,
  });

  const mappedCycles = cycleRecords.map((record) =>
    mapWhoopCycleRecord({
      userId: params.userId,
      expectedWhoopUserId: params.whoopUserId,
      record,
    }),
  );
  await upsertWhoopCycles(mappedCycles);

  const recoveryRecords = await fetchWhoopPaginatedCollection({
    accessToken: params.accessToken,
    path: WHOOP_RECOVERIES_PATH,
    start,
    end,
    parseRecord: parseRecoveryRecord,
  });

  const mappedRecoveries = recoveryRecords.map((record) =>
    mapWhoopRecoveryRecord({
      userId: params.userId,
      expectedWhoopUserId: params.whoopUserId,
      record,
    }),
  );
  await upsertWhoopRecoveries(mappedRecoveries);

  const sleepRecords = await fetchWhoopPaginatedCollection({
    accessToken: params.accessToken,
    path: WHOOP_SLEEPS_PATH,
    start,
    end,
    parseRecord: parseSleepRecord,
  });

  const mappedSleeps = sleepRecords.map((record) =>
    mapWhoopSleepRecord({
      userId: params.userId,
      expectedWhoopUserId: params.whoopUserId,
      record,
    }),
  );
  await upsertWhoopSleeps(mappedSleeps);

  const workoutRecords = await fetchWhoopPaginatedCollection({
    accessToken: params.accessToken,
    path: WHOOP_WORKOUTS_PATH,
    start,
    end,
    parseRecord: parseWorkoutRecord,
  });

  const mappedWorkouts = workoutRecords.map((record) =>
    mapWhoopWorkoutRecord({
      userId: params.userId,
      expectedWhoopUserId: params.whoopUserId,
      record,
    }),
  );
  await upsertWhoopWorkouts(mappedWorkouts);

  const bodyMeasurement = parseWhoopBodyMeasurementRecord(
    await fetchWhoopJson<unknown>({
      accessToken: params.accessToken,
      path: WHOOP_BODY_MEASUREMENT_PATH,
    }),
  );

  await upsertWhoopBodyMeasurement(
    mapWhoopBodyMeasurementRecord({
      userId: params.userId,
      record: bodyMeasurement,
      syncedAt: params.syncedAt,
    }),
  );

  return {
    cycles: mappedCycles.length,
    recoveries: mappedRecoveries.length,
    sleeps: mappedSleeps.length,
    workouts: mappedWorkouts.length,
    bodyMeasurement: true,
    syncedAt: params.syncedAt,
  };
}

/**
 * Manual WHOOP sync orchestrator.
 *
 * A hard serverless termination cannot run catch/finally. If the platform kills
 * this invocation mid-sync, stale-claim recovery on whoop_connections is the
 * fallback that allows a later retry to proceed.
 */
export async function syncWhoopFitnessDataForWindow(params: {
  userId: string;
  window: { start: string; end: string };
}): Promise<WhoopSyncResult> {
  const claim = await claimWhoopSync(params.userId);

  if (!claim.claimed) {
    const error =
      claim.reason === "not_connected"
        ? WHOOP_SYNC_ERROR_CODES.notConnected
        : WHOOP_SYNC_ERROR_CODES.inProgress;

    return {
      ok: false,
      error,
      httpStatus: syncFailureHttpStatus(error),
    };
  }

  let succeeded = false;

  try {
    const tokenResult = await getValidWhoopAccessToken(params.userId);

    if (!tokenResult.success) {
      const error =
        "needsReconnect" in tokenResult && tokenResult.needsReconnect
          ? WHOOP_SYNC_ERROR_CODES.reconnectRequired
          : WHOOP_SYNC_ERROR_CODES.notConnected;

      await markWhoopSyncFailure(params.userId, error);
      return { ok: false, error, httpStatus: syncFailureHttpStatus(error) };
    }

    const syncedAt = new Date().toISOString();
    const summary = await runWhoopCollectionSync({
      userId: params.userId,
      whoopUserId: claim.whoopUserId,
      accessToken: tokenResult.accessToken,
      window: params.window,
      syncedAt,
    });

    await markWhoopSyncSuccess(params.userId, syncedAt);
    succeeded = true;

    return { ok: true, summary };
  } catch (error) {
    const code = mapSyncError(error);
    await markWhoopSyncFailure(params.userId, code).catch(() => undefined);

    return {
      ok: false,
      error: code,
      httpStatus: syncFailureHttpStatus(code),
    };
  } finally {
    if (!succeeded) {
      await releaseWhoopSyncClaim(params.userId).catch(() => undefined);
    }
  }
}

export async function syncWhoopFitnessData(userId: string): Promise<WhoopSyncResult> {
  return syncWhoopFitnessDataForWindow({
    userId,
    window: getWhoopSyncWindow(),
  });
}

export async function reconcileWhoopFitnessData(
  userId: string,
): Promise<WhoopSyncResult> {
  return syncWhoopFitnessDataForWindow({
    userId,
    window: getWhoopReconcileWindow(),
  });
}

export {
  WHOOP_SYNC_BACKFILL_DAYS,
  getWhoopSyncWindow,
  getWhoopReconcileWindow,
};
