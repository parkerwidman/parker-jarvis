import "server-only";

import type {
  WhoopRecoveryRecord,
  WhoopSleepRecord,
  WhoopWorkoutRecord,
} from "@/lib/jarvis/integrations/whoop/whoop-api-types";
import { fetchWhoopResourceByPath } from "@/lib/jarvis/integrations/whoop/whoop-data-client";
import {
  assertWhoopRecordUserId,
  mapWhoopRecoveryRecord,
  mapWhoopSleepRecord,
  mapWhoopWorkoutRecord,
} from "@/lib/jarvis/integrations/whoop/whoop-data-mappers";
import { markWhoopConnectionError } from "@/lib/jarvis/integrations/whoop/whoop-connection-tools";
import { WHOOP_OAUTH_ERROR_CODES } from "@/lib/jarvis/integrations/whoop/whoop-oauth-errors";
import {
  whoopCycleRecoveryPath,
  whoopSleepByIdPath,
  whoopWorkoutByIdPath,
} from "@/lib/jarvis/integrations/whoop/whoop-sync-config";
import {
  WHOOP_SYNC_ERROR_CODES,
  WhoopSyncError,
} from "@/lib/jarvis/integrations/whoop/whoop-sync-errors";
import {
  upsertWhoopRecoveries,
  upsertWhoopSleeps,
  upsertWhoopWorkouts,
} from "@/lib/jarvis/integrations/whoop/whoop-sync-persistence";
import { getValidWhoopAccessToken } from "@/lib/jarvis/integrations/whoop/whoop-token-manager";
import { WHOOP_WEBHOOK_ERROR_CODES } from "@/lib/jarvis/integrations/whoop/whoop-webhook-errors";
import {
  softDeleteWhoopRecovery,
  softDeleteWhoopSleep,
  softDeleteWhoopWorkout,
} from "@/lib/jarvis/integrations/whoop/whoop-webhook-persistence";
import { isWhoopWebhookEventType } from "@/lib/jarvis/integrations/whoop/whoop-webhook-payload";
import type {
  WhoopWebhookConnectedConnection,
  WhoopWebhookEventRecord,
  WhoopWebhookPayload,
} from "@/lib/jarvis/integrations/whoop/whoop-webhook-types";

export type WhoopWebhookProcessingErrorMapping = {
  code: string;
  retryable: boolean;
  terminal: boolean;
};

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

export function mapWebhookProcessingError(
  error: unknown,
): WhoopWebhookProcessingErrorMapping {
  if (error instanceof WhoopSyncError) {
    if (error.code === WHOOP_SYNC_ERROR_CODES.reconnectRequired) {
      return {
        code: WHOOP_WEBHOOK_ERROR_CODES.reconnectRequired,
        retryable: false,
        terminal: true,
      };
    }

    if (error.code === WHOOP_SYNC_ERROR_CODES.notConnected) {
      return {
        code: WHOOP_WEBHOOK_ERROR_CODES.notConnected,
        retryable: false,
        terminal: true,
      };
    }

    if (error.code === WHOOP_SYNC_ERROR_CODES.userMismatch) {
      return {
        code: WHOOP_WEBHOOK_ERROR_CODES.userMismatch,
        retryable: false,
        terminal: true,
      };
    }

    if (error.code === WHOOP_SYNC_ERROR_CODES.invalidPayload) {
      return {
        code: WHOOP_WEBHOOK_ERROR_CODES.invalidPayload,
        retryable: false,
        terminal: true,
      };
    }

    return {
      code: WHOOP_WEBHOOK_ERROR_CODES.providerFailed,
      retryable: true,
      terminal: false,
    };
  }

  if (error instanceof Error) {
    if (error.message === WHOOP_WEBHOOK_ERROR_CODES.databaseFailed) {
      return {
        code: WHOOP_WEBHOOK_ERROR_CODES.databaseFailed,
        retryable: true,
        terminal: false,
      };
    }
  }

  return {
    code: WHOOP_WEBHOOK_ERROR_CODES.providerFailed,
    retryable: true,
    terminal: false,
  };
}

export function buildWhoopWebhookPayloadFromPersistedEvent(params: {
  event: WhoopWebhookEventRecord;
  whoopUserId: number;
}): WhoopWebhookPayload {
  if (!isWhoopWebhookEventType(params.event.event_type)) {
    throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.invalidPayload);
  }

  return {
    user_id: params.whoopUserId,
    id: params.event.resource_id,
    type: params.event.event_type,
    trace_id: params.event.trace_id,
  };
}

async function requireWhoopAccessToken(userId: string): Promise<string> {
  const tokenResult = await getValidWhoopAccessToken(userId);

  if (!tokenResult.success) {
    if ("needsReconnect" in tokenResult && tokenResult.needsReconnect) {
      await markWhoopConnectionError({
        userId,
        errorCode: WHOOP_WEBHOOK_ERROR_CODES.reconnectRequired,
        status: "reconnect_required",
      });
      throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.reconnectRequired);
    }

    if ("needsConnection" in tokenResult && tokenResult.needsConnection) {
      throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.notConnected);
    }

    if (
      "error" in tokenResult &&
      tokenResult.error === WHOOP_OAUTH_ERROR_CODES.tokenRefreshFailed
    ) {
      throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.reconnectRequired);
    }

    throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.notConnected);
  }

  return tokenResult.accessToken;
}

function validateRecoverySleepResource(params: {
  connection: WhoopWebhookConnectedConnection;
  sleepId: string;
  sleepRecord: WhoopSleepRecord;
}): number {
  assertWhoopRecordUserId(
    params.sleepRecord.user_id,
    params.connection.whoopUserId,
  );

  if (params.sleepRecord.id !== params.sleepId) {
    throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.invalidPayload);
  }

  if (
    typeof params.sleepRecord.cycle_id !== "number" ||
    !Number.isInteger(params.sleepRecord.cycle_id) ||
    params.sleepRecord.cycle_id <= 0
  ) {
    throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.invalidPayload);
  }

  return params.sleepRecord.cycle_id;
}

function validateRecoveryWebhookBinding(params: {
  connection: WhoopWebhookConnectedConnection;
  sleepId: string;
  sleepCycleId: number;
  recoveryRecord: WhoopRecoveryRecord;
}): void {
  assertWhoopRecordUserId(
    params.recoveryRecord.user_id,
    params.connection.whoopUserId,
  );

  if (params.recoveryRecord.sleep_id !== params.sleepId) {
    throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.invalidPayload);
  }

  if (params.recoveryRecord.cycle_id !== params.sleepCycleId) {
    throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.invalidPayload);
  }
}

async function processWorkoutUpdated(params: {
  connection: WhoopWebhookConnectedConnection;
  resourceId: string;
  accessToken: string;
}): Promise<void> {
  const record = parseWorkoutRecord(
    await fetchWhoopResourceByPath<unknown>({
      accessToken: params.accessToken,
      path: whoopWorkoutByIdPath(params.resourceId),
    }),
  );

  await upsertWhoopWorkouts([
    mapWhoopWorkoutRecord({
      userId: params.connection.userId,
      expectedWhoopUserId: params.connection.whoopUserId,
      record,
    }),
  ]);
}

async function processSleepUpdated(params: {
  connection: WhoopWebhookConnectedConnection;
  resourceId: string;
  accessToken: string;
}): Promise<void> {
  const record = parseSleepRecord(
    await fetchWhoopResourceByPath<unknown>({
      accessToken: params.accessToken,
      path: whoopSleepByIdPath(params.resourceId),
    }),
  );

  await upsertWhoopSleeps([
    mapWhoopSleepRecord({
      userId: params.connection.userId,
      expectedWhoopUserId: params.connection.whoopUserId,
      record,
    }),
  ]);
}

async function processRecoveryUpdated(params: {
  connection: WhoopWebhookConnectedConnection;
  sleepId: string;
  accessToken: string;
}): Promise<void> {
  const sleepRecord = parseSleepRecord(
    await fetchWhoopResourceByPath<unknown>({
      accessToken: params.accessToken,
      path: whoopSleepByIdPath(params.sleepId),
    }),
  );

  const cycleId = validateRecoverySleepResource({
    connection: params.connection,
    sleepId: params.sleepId,
    sleepRecord,
  });

  const recoveryRecord = parseRecoveryRecord(
    await fetchWhoopResourceByPath<unknown>({
      accessToken: params.accessToken,
      path: whoopCycleRecoveryPath(cycleId),
    }),
  );

  validateRecoveryWebhookBinding({
    connection: params.connection,
    sleepId: params.sleepId,
    sleepCycleId: cycleId,
    recoveryRecord,
  });

  await upsertWhoopRecoveries([
    mapWhoopRecoveryRecord({
      userId: params.connection.userId,
      expectedWhoopUserId: params.connection.whoopUserId,
      record: recoveryRecord,
    }),
  ]);
}

/**
 * Server-internal processor for persisted webhook events.
 * Operates after HMAC/payload validation; safe for F5B replay sweeps.
 */
export async function processPersistedWhoopWebhookEvent(params: {
  payload: WhoopWebhookPayload;
  connection: WhoopWebhookConnectedConnection;
  processedAt: string;
}): Promise<void> {
  const accessToken = await requireWhoopAccessToken(params.connection.userId);

  switch (params.payload.type) {
    case "workout.updated":
      await processWorkoutUpdated({
        connection: params.connection,
        resourceId: params.payload.id,
        accessToken,
      });
      return;
    case "workout.deleted":
      await softDeleteWhoopWorkout({
        userId: params.connection.userId,
        whoopWorkoutId: params.payload.id,
        deletedAt: params.processedAt,
      });
      return;
    case "sleep.updated":
      await processSleepUpdated({
        connection: params.connection,
        resourceId: params.payload.id,
        accessToken,
      });
      return;
    case "sleep.deleted":
      await softDeleteWhoopSleep({
        userId: params.connection.userId,
        whoopSleepId: params.payload.id,
        deletedAt: params.processedAt,
      });
      return;
    case "recovery.updated":
      await processRecoveryUpdated({
        connection: params.connection,
        sleepId: params.payload.id,
        accessToken,
      });
      return;
    case "recovery.deleted":
      await softDeleteWhoopRecovery({
        userId: params.connection.userId,
        whoopSleepId: params.payload.id,
        deletedAt: params.processedAt,
      });
      return;
    default:
      throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.invalidPayload);
  }
}
