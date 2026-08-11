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
import {
  loadConnectedWhoopConnectionByWhoopUserId,
  markWhoopConnectionError,
} from "@/lib/jarvis/integrations/whoop/whoop-connection-tools";
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
import { parseWhoopWebhookPayload } from "@/lib/jarvis/integrations/whoop/whoop-webhook-payload";
import {
  acquireWhoopWebhookEvent,
  markWhoopWebhookEventFailed,
  markWhoopWebhookEventProcessed,
  markWhoopWebhookEventTerminalProcessed,
  softDeleteWhoopRecovery,
  softDeleteWhoopSleep,
  softDeleteWhoopWorkout,
  touchWhoopConnectionLastWebhookAt,
} from "@/lib/jarvis/integrations/whoop/whoop-webhook-persistence";
import { verifyWhoopWebhookSignature } from "@/lib/jarvis/integrations/whoop/whoop-webhook-signature";
import type {
  WhoopWebhookConnectedConnection,
  WhoopWebhookPayload,
} from "@/lib/jarvis/integrations/whoop/whoop-webhook-types";
import { getWhoopOAuthConfig } from "@/lib/jarvis/integrations/whoop/whoop-config";

export type WhoopWebhookHandlerResult =
  | { ok: true; httpStatus: number }
  | { ok: false; httpStatus: number; error: string };

function logWhoopWebhookFailure(errorCode: string): void {
  console.error("[whoop-webhook]", {
    integration: "whoop",
    operation: "webhook",
    error_code: errorCode,
  });
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

function mapWebhookProcessingError(error: unknown): {
  code: string;
  retryable: boolean;
  terminal: boolean;
} {
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

function mapUnexpectedWebhookError(error: unknown): WhoopWebhookHandlerResult {
  const mapped = mapWebhookProcessingError(error);

  if (mapped.retryable || mapped.terminal) {
    logWhoopWebhookFailure(mapped.code);
  } else {
    logWhoopWebhookFailure(WHOOP_WEBHOOK_ERROR_CODES.failed);
  }

  return {
    ok: false,
    httpStatus: 502,
    error: WHOOP_WEBHOOK_ERROR_CODES.failed,
  };
}

async function resolveConnectedWhoopConnection(
  payload: WhoopWebhookPayload,
): Promise<WhoopWebhookConnectedConnection | null> {
  const connection = await loadConnectedWhoopConnectionByWhoopUserId(
    payload.user_id,
  );

  if (!connection) {
    return null;
  }

  return {
    connectionId: connection.connectionId,
    userId: connection.userId,
    whoopUserId: connection.whoopUserId,
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

async function processWhoopWebhookEventBody(params: {
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

export async function handleWhoopWebhook(params: {
  rawBody: string;
  signature: string | null;
  signatureTimestamp: string | null;
  now?: Date;
}): Promise<WhoopWebhookHandlerResult> {
  const now = params.now ?? new Date();
  const processedAt = now.toISOString();

  if (!params.signature || !params.signatureTimestamp) {
    return {
      ok: false,
      httpStatus: 401,
      error: WHOOP_WEBHOOK_ERROR_CODES.failed,
    };
  }

  let clientSecret: string;

  try {
    ({ clientSecret } = getWhoopOAuthConfig());
  } catch {
    logWhoopWebhookFailure(WHOOP_WEBHOOK_ERROR_CODES.failed);
    return {
      ok: false,
      httpStatus: 502,
      error: WHOOP_WEBHOOK_ERROR_CODES.failed,
    };
  }

  const signatureValid = verifyWhoopWebhookSignature({
    rawBody: params.rawBody,
    signature: params.signature,
    signatureTimestamp: params.signatureTimestamp,
    clientSecret,
  });

  if (!signatureValid) {
    return {
      ok: false,
      httpStatus: 401,
      error: WHOOP_WEBHOOK_ERROR_CODES.failed,
    };
  }

  let payload: WhoopWebhookPayload;

  try {
    payload = parseWhoopWebhookPayload(params.rawBody);
  } catch {
    return {
      ok: false,
      httpStatus: 400,
      error: WHOOP_WEBHOOK_ERROR_CODES.failed,
    };
  }

  try {
    const connection = await resolveConnectedWhoopConnection(payload);
    const acquire = await acquireWhoopWebhookEvent({
      traceId: payload.trace_id,
      userId: connection?.userId ?? null,
      eventType: payload.type,
      resourceId: payload.id,
      now,
    });

    if (acquire.action === "noop") {
      return { ok: true, httpStatus: 200 };
    }

    const event = acquire.event;

    if (!connection) {
      await markWhoopWebhookEventTerminalProcessed({
        eventId: event.id,
        processedAt,
        errorCode: WHOOP_WEBHOOK_ERROR_CODES.unknownUser,
      });

      return { ok: true, httpStatus: 200 };
    }

    try {
      await processWhoopWebhookEventBody({
        payload,
        connection,
        processedAt,
      });

      await markWhoopWebhookEventProcessed({
        eventId: event.id,
        processedAt,
      });
      await touchWhoopConnectionLastWebhookAt({
        connectionId: connection.connectionId,
        receivedAt: processedAt,
      });

      return { ok: true, httpStatus: 200 };
    } catch (error) {
      const mapped = mapWebhookProcessingError(error);

      if (mapped.terminal) {
        await markWhoopWebhookEventTerminalProcessed({
          eventId: event.id,
          processedAt,
          errorCode: mapped.code,
        });

        return { ok: true, httpStatus: 200 };
      }

      await markWhoopWebhookEventFailed({
        eventId: event.id,
        errorCode: mapped.code,
      });

      return {
        ok: false,
        httpStatus: 502,
        error: WHOOP_WEBHOOK_ERROR_CODES.failed,
      };
    }
  } catch (error) {
    return mapUnexpectedWebhookError(error);
  }
}
