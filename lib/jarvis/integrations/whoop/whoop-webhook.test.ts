import { beforeEach, describe, expect, it, vi } from "vitest";

import { computeWhoopWebhookSignature } from "@/lib/jarvis/integrations/whoop/whoop-webhook-signature";
import { WHOOP_WEBHOOK_ERROR_CODES } from "@/lib/jarvis/integrations/whoop/whoop-webhook-errors";

const CLIENT_SECRET = "test-client-secret";
const TIMESTAMP = "1710000000000";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const WHOOP_USER_ID = 10129;
const SLEEP_ID = "123e4567-e89b-12d3-a456-426614174000";
const WORKOUT_ID = "223e4567-e89b-12d3-a456-426614174001";

const loadConnectedWhoopConnectionByWhoopUserIdMock = vi.fn();
const acquireWhoopWebhookEventMock = vi.fn();
const markWhoopWebhookEventProcessedMock = vi.fn();
const markWhoopWebhookEventFailedMock = vi.fn();
const markWhoopWebhookEventTerminalProcessedMock = vi.fn();
const touchWhoopConnectionLastWebhookAtMock = vi.fn();
const softDeleteWhoopWorkoutMock = vi.fn();
const softDeleteWhoopSleepMock = vi.fn();
const softDeleteWhoopRecoveryMock = vi.fn();
const getValidWhoopAccessTokenMock = vi.fn();
const fetchWhoopResourceByPathMock = vi.fn();
const upsertWhoopWorkoutsMock = vi.fn();
const upsertWhoopSleepsMock = vi.fn();
const upsertWhoopRecoveriesMock = vi.fn();
const markWhoopConnectionErrorMock = vi.fn();

vi.mock("@/lib/jarvis/integrations/whoop/whoop-config", () => ({
  getWhoopOAuthConfig: vi.fn(() => ({
    clientId: "client-id",
    clientSecret: CLIENT_SECRET,
  })),
}));

vi.mock("@/lib/jarvis/integrations/whoop/whoop-connection-tools", () => ({
  loadConnectedWhoopConnectionByWhoopUserId: (...args: unknown[]) =>
    loadConnectedWhoopConnectionByWhoopUserIdMock(...args),
  markWhoopConnectionError: (...args: unknown[]) =>
    markWhoopConnectionErrorMock(...args),
}));

vi.mock("@/lib/jarvis/integrations/whoop/whoop-webhook-persistence", () => ({
  acquireWhoopWebhookEvent: (...args: unknown[]) =>
    acquireWhoopWebhookEventMock(...args),
  markWhoopWebhookEventProcessed: (...args: unknown[]) =>
    markWhoopWebhookEventProcessedMock(...args),
  markWhoopWebhookEventFailed: (...args: unknown[]) =>
    markWhoopWebhookEventFailedMock(...args),
  markWhoopWebhookEventTerminalProcessed: (...args: unknown[]) =>
    markWhoopWebhookEventTerminalProcessedMock(...args),
  touchWhoopConnectionLastWebhookAt: (...args: unknown[]) =>
    touchWhoopConnectionLastWebhookAtMock(...args),
  softDeleteWhoopWorkout: (...args: unknown[]) => softDeleteWhoopWorkoutMock(...args),
  softDeleteWhoopSleep: (...args: unknown[]) => softDeleteWhoopSleepMock(...args),
  softDeleteWhoopRecovery: (...args: unknown[]) => softDeleteWhoopRecoveryMock(...args),
}));

vi.mock("@/lib/jarvis/integrations/whoop/whoop-token-manager", () => ({
  getValidWhoopAccessToken: (...args: unknown[]) =>
    getValidWhoopAccessTokenMock(...args),
}));

vi.mock("@/lib/jarvis/integrations/whoop/whoop-data-client", () => ({
  fetchWhoopResourceByPath: (...args: unknown[]) =>
    fetchWhoopResourceByPathMock(...args),
}));

vi.mock("@/lib/jarvis/integrations/whoop/whoop-sync-persistence", () => ({
  upsertWhoopWorkouts: (...args: unknown[]) => upsertWhoopWorkoutsMock(...args),
  upsertWhoopSleeps: (...args: unknown[]) => upsertWhoopSleepsMock(...args),
  upsertWhoopRecoveries: (...args: unknown[]) => upsertWhoopRecoveriesMock(...args),
}));

import { handleWhoopWebhook } from "@/lib/jarvis/integrations/whoop/whoop-webhook-service";
import { WhoopSyncError, WHOOP_SYNC_ERROR_CODES } from "@/lib/jarvis/integrations/whoop/whoop-sync-errors";

function buildPayload(type: string, id: string, traceId = "trace-1") {
  return JSON.stringify({
    user_id: WHOOP_USER_ID,
    id,
    type,
    trace_id: traceId,
  });
}

function signedRequest(body: string) {
  return {
    rawBody: body,
    signature: computeWhoopWebhookSignature(TIMESTAMP, body, CLIENT_SECRET),
    signatureTimestamp: TIMESTAMP,
  };
}

function connectedConnection() {
  return {
    connectionId: "conn-1",
    userId: USER_ID,
    whoopUserId: WHOOP_USER_ID,
  };
}

function processableAcquire(eventId = "event-1") {
  acquireWhoopWebhookEventMock.mockResolvedValue({
    action: "process",
    event: {
      id: eventId,
      trace_id: "trace-1",
      user_id: USER_ID,
      event_type: "sleep.updated",
      resource_id: SLEEP_ID,
      received_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      processed_at: null,
      status: "pending",
      error_code: null,
    },
  });
}

describe("WHOOP webhook service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadConnectedWhoopConnectionByWhoopUserIdMock.mockResolvedValue(
      connectedConnection(),
    );
    getValidWhoopAccessTokenMock.mockResolvedValue({
      success: true,
      accessToken: "access-token",
    });
    markWhoopWebhookEventProcessedMock.mockResolvedValue(undefined);
    markWhoopWebhookEventFailedMock.mockResolvedValue(undefined);
    markWhoopWebhookEventTerminalProcessedMock.mockResolvedValue(undefined);
    touchWhoopConnectionLastWebhookAtMock.mockResolvedValue(undefined);
    upsertWhoopWorkoutsMock.mockResolvedValue(undefined);
    upsertWhoopSleepsMock.mockResolvedValue(undefined);
    upsertWhoopRecoveriesMock.mockResolvedValue(undefined);
    softDeleteWhoopWorkoutMock.mockResolvedValue(undefined);
    softDeleteWhoopSleepMock.mockResolvedValue(undefined);
    softDeleteWhoopRecoveryMock.mockResolvedValue(undefined);
  });

  it("rejects missing signature headers", async () => {
    const result = await handleWhoopWebhook({
      rawBody: buildPayload("sleep.updated", SLEEP_ID),
      signature: null,
      signatureTimestamp: TIMESTAMP,
    });

    expect(result).toEqual({
      ok: false,
      httpStatus: 401,
      error: WHOOP_WEBHOOK_ERROR_CODES.failed,
    });
  });

  it("rejects invalid signatures", async () => {
    const body = buildPayload("sleep.updated", SLEEP_ID);

    const result = await handleWhoopWebhook({
      rawBody: body,
      signature: "bad-signature",
      signatureTimestamp: TIMESTAMP,
    });

    expect(result.ok).toBe(false);
    expect(result.httpStatus).toBe(401);
  });

  it("rejects malformed resource UUIDs before provider calls", async () => {
    const body = buildPayload("sleep.updated", "sleep-1");

    const result = await handleWhoopWebhook(signedRequest(body));

    expect(result).toEqual({
      ok: false,
      httpStatus: 400,
      error: WHOOP_WEBHOOK_ERROR_CODES.failed,
    });
    expect(acquireWhoopWebhookEventMock).not.toHaveBeenCalled();
  });

  it("returns safe 502 when persistence throws unexpectedly", async () => {
    acquireWhoopWebhookEventMock.mockRejectedValue(
      new Error(WHOOP_WEBHOOK_ERROR_CODES.databaseFailed),
    );

    const result = await handleWhoopWebhook(
      signedRequest(buildPayload("sleep.updated", SLEEP_ID)),
    );

    expect(result).toEqual({
      ok: false,
      httpStatus: 502,
      error: WHOOP_WEBHOOK_ERROR_CODES.failed,
    });
  });

  it("returns 200 for duplicate processed trace_id without provider calls", async () => {
    acquireWhoopWebhookEventMock.mockResolvedValue({
      action: "noop",
      reason: "already_processed",
    });

    const result = await handleWhoopWebhook(
      signedRequest(buildPayload("workout.updated", WORKOUT_ID)),
    );

    expect(result).toEqual({ ok: true, httpStatus: 200 });
    expect(fetchWhoopResourceByPathMock).not.toHaveBeenCalled();
  });

  it("returns 200 for unknown users without metric mutation", async () => {
    loadConnectedWhoopConnectionByWhoopUserIdMock.mockResolvedValue(null);
    processableAcquire();

    const result = await handleWhoopWebhook(
      signedRequest(buildPayload("sleep.updated", SLEEP_ID)),
    );

    expect(result).toEqual({ ok: true, httpStatus: 200 });
    expect(markWhoopWebhookEventTerminalProcessedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: WHOOP_WEBHOOK_ERROR_CODES.unknownUser,
      }),
    );
    expect(fetchWhoopResourceByPathMock).not.toHaveBeenCalled();
  });

  it("processes workout.updated with targeted fetch and upsert", async () => {
    processableAcquire();
    fetchWhoopResourceByPathMock.mockResolvedValue({
      id: WORKOUT_ID,
      user_id: WHOOP_USER_ID,
      score_state: "SCORED",
      score: { strain: 8.1 },
    });

    const result = await handleWhoopWebhook(
      signedRequest(buildPayload("workout.updated", WORKOUT_ID)),
    );

    expect(result).toEqual({ ok: true, httpStatus: 200 });
    expect(fetchWhoopResourceByPathMock).toHaveBeenCalledWith({
      accessToken: "access-token",
      path: `/v2/activity/workout/${encodeURIComponent(WORKOUT_ID)}`,
    });
    expect(upsertWhoopWorkoutsMock).toHaveBeenCalled();
    expect(touchWhoopConnectionLastWebhookAtMock).toHaveBeenCalled();
  });

  it("soft-deletes workouts on workout.deleted", async () => {
    processableAcquire();

    const result = await handleWhoopWebhook(
      signedRequest(buildPayload("workout.deleted", WORKOUT_ID)),
    );

    expect(result).toEqual({ ok: true, httpStatus: 200 });
    expect(softDeleteWhoopWorkoutMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        whoopWorkoutId: WORKOUT_ID,
      }),
    );
    expect(fetchWhoopResourceByPathMock).not.toHaveBeenCalled();
  });

  it("processes sleep.updated and clears deleted_at through mapper upsert", async () => {
    processableAcquire();
    fetchWhoopResourceByPathMock.mockResolvedValue({
      id: SLEEP_ID,
      user_id: WHOOP_USER_ID,
      score_state: "SCORED",
      score: { sleep_performance_percentage: 90 },
    });

    const result = await handleWhoopWebhook(
      signedRequest(buildPayload("sleep.updated", SLEEP_ID)),
    );

    expect(result).toEqual({ ok: true, httpStatus: 200 });
    expect(upsertWhoopSleepsMock).toHaveBeenCalled();
  });

  it("soft-deletes sleep only on sleep.deleted", async () => {
    processableAcquire();

    await handleWhoopWebhook(signedRequest(buildPayload("sleep.deleted", SLEEP_ID)));

    expect(softDeleteWhoopSleepMock).toHaveBeenCalled();
    expect(softDeleteWhoopRecoveryMock).not.toHaveBeenCalled();
  });

  it("uses sleep UUID for recovery.updated two-hop fetch", async () => {
    processableAcquire();
    fetchWhoopResourceByPathMock
      .mockResolvedValueOnce({
        id: SLEEP_ID,
        user_id: WHOOP_USER_ID,
        cycle_id: 93845,
        score_state: "SCORED",
      })
      .mockResolvedValueOnce({
        cycle_id: 93845,
        sleep_id: SLEEP_ID,
        user_id: WHOOP_USER_ID,
        score_state: "SCORED",
        score: { recovery_score: 72 },
      });

    const result = await handleWhoopWebhook(
      signedRequest(buildPayload("recovery.updated", SLEEP_ID)),
    );

    expect(result).toEqual({ ok: true, httpStatus: 200 });
    expect(fetchWhoopResourceByPathMock).toHaveBeenNthCalledWith(1, {
      accessToken: "access-token",
      path: `/v2/activity/sleep/${encodeURIComponent(SLEEP_ID)}`,
    });
    expect(fetchWhoopResourceByPathMock).toHaveBeenNthCalledWith(2, {
      accessToken: "access-token",
      path: "/v2/cycle/93845/recovery",
    });
    expect(upsertWhoopRecoveriesMock).toHaveBeenCalled();
  });

  it("marks wrong sleep user as terminal processed", async () => {
    processableAcquire();
    fetchWhoopResourceByPathMock.mockResolvedValueOnce({
      id: SLEEP_ID,
      user_id: 99999,
      cycle_id: 93845,
      score_state: "SCORED",
    });

    const result = await handleWhoopWebhook(
      signedRequest(buildPayload("recovery.updated", SLEEP_ID)),
    );

    expect(result).toEqual({ ok: true, httpStatus: 200 });
    expect(markWhoopWebhookEventTerminalProcessedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: WHOOP_WEBHOOK_ERROR_CODES.userMismatch,
      }),
    );
    expect(fetchWhoopResourceByPathMock).toHaveBeenCalledTimes(1);
    expect(upsertWhoopRecoveriesMock).not.toHaveBeenCalled();
  });

  it("marks sleep id mismatch as terminal processed", async () => {
    processableAcquire();
    fetchWhoopResourceByPathMock.mockResolvedValueOnce({
      id: "999e4567-e89b-12d3-a456-426614174999",
      user_id: WHOOP_USER_ID,
      cycle_id: 93845,
      score_state: "SCORED",
    });

    const result = await handleWhoopWebhook(
      signedRequest(buildPayload("recovery.updated", SLEEP_ID)),
    );

    expect(result).toEqual({ ok: true, httpStatus: 200 });
    expect(markWhoopWebhookEventTerminalProcessedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: WHOOP_WEBHOOK_ERROR_CODES.invalidPayload,
      }),
    );
    expect(upsertWhoopRecoveriesMock).not.toHaveBeenCalled();
  });

  it("marks recovery user mismatch as terminal processed", async () => {
    processableAcquire();
    fetchWhoopResourceByPathMock
      .mockResolvedValueOnce({
        id: SLEEP_ID,
        user_id: WHOOP_USER_ID,
        cycle_id: 93845,
        score_state: "SCORED",
      })
      .mockResolvedValueOnce({
        cycle_id: 93845,
        sleep_id: SLEEP_ID,
        user_id: 99999,
        score_state: "SCORED",
      });

    const result = await handleWhoopWebhook(
      signedRequest(buildPayload("recovery.updated", SLEEP_ID)),
    );

    expect(result).toEqual({ ok: true, httpStatus: 200 });
    expect(markWhoopWebhookEventTerminalProcessedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: WHOOP_WEBHOOK_ERROR_CODES.userMismatch,
      }),
    );
    expect(upsertWhoopRecoveriesMock).not.toHaveBeenCalled();
  });

  it("marks recovery sleep_id mismatch as terminal processed", async () => {
    processableAcquire();
    fetchWhoopResourceByPathMock
      .mockResolvedValueOnce({
        id: SLEEP_ID,
        user_id: WHOOP_USER_ID,
        cycle_id: 93845,
        score_state: "SCORED",
      })
      .mockResolvedValueOnce({
        cycle_id: 93845,
        sleep_id: "999e4567-e89b-12d3-a456-426614174999",
        user_id: WHOOP_USER_ID,
        score_state: "SCORED",
      });

    const result = await handleWhoopWebhook(
      signedRequest(buildPayload("recovery.updated", SLEEP_ID)),
    );

    expect(result).toEqual({ ok: true, httpStatus: 200 });
    expect(markWhoopWebhookEventTerminalProcessedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: WHOOP_WEBHOOK_ERROR_CODES.invalidPayload,
      }),
    );
    expect(upsertWhoopRecoveriesMock).not.toHaveBeenCalled();
  });

  it("marks recovery cycle mismatch as terminal processed", async () => {
    processableAcquire();
    fetchWhoopResourceByPathMock
      .mockResolvedValueOnce({
        id: SLEEP_ID,
        user_id: WHOOP_USER_ID,
        cycle_id: 93845,
        score_state: "SCORED",
      })
      .mockResolvedValueOnce({
        cycle_id: 11111,
        sleep_id: SLEEP_ID,
        user_id: WHOOP_USER_ID,
        score_state: "SCORED",
      });

    const result = await handleWhoopWebhook(
      signedRequest(buildPayload("recovery.updated", SLEEP_ID)),
    );

    expect(result).toEqual({ ok: true, httpStatus: 200 });
    expect(markWhoopWebhookEventTerminalProcessedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: WHOOP_WEBHOOK_ERROR_CODES.invalidPayload,
      }),
    );
    expect(upsertWhoopRecoveriesMock).not.toHaveBeenCalled();
  });

  it("soft-deletes recovery by sleep UUID on recovery.deleted", async () => {
    processableAcquire();

    await handleWhoopWebhook(
      signedRequest(buildPayload("recovery.deleted", SLEEP_ID)),
    );

    expect(softDeleteWhoopRecoveryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        whoopSleepId: SLEEP_ID,
      }),
    );
  });

  it("marks ownership mismatch as terminal processed", async () => {
    processableAcquire();
    fetchWhoopResourceByPathMock.mockResolvedValue({
      id: WORKOUT_ID,
      user_id: 99999,
      score_state: "SCORED",
    });

    const result = await handleWhoopWebhook(
      signedRequest(buildPayload("workout.updated", WORKOUT_ID)),
    );

    expect(result).toEqual({ ok: true, httpStatus: 200 });
    expect(markWhoopWebhookEventTerminalProcessedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: WHOOP_WEBHOOK_ERROR_CODES.userMismatch,
      }),
    );
  });

  it("marks reconnect-required token failures as terminal processed", async () => {
    processableAcquire();
    getValidWhoopAccessTokenMock.mockResolvedValue({
      success: false,
      needsReconnect: true,
    });

    const result = await handleWhoopWebhook(
      signedRequest(buildPayload("workout.updated", WORKOUT_ID)),
    );

    expect(result).toEqual({ ok: true, httpStatus: 200 });
    expect(markWhoopWebhookEventTerminalProcessedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: WHOOP_WEBHOOK_ERROR_CODES.reconnectRequired,
      }),
    );
    expect(fetchWhoopResourceByPathMock).not.toHaveBeenCalled();
  });

  it("marks not-connected token failures as terminal processed", async () => {
    processableAcquire();
    getValidWhoopAccessTokenMock.mockResolvedValue({
      success: false,
      needsConnection: true,
    });

    const result = await handleWhoopWebhook(
      signedRequest(buildPayload("workout.updated", WORKOUT_ID)),
    );

    expect(result).toEqual({ ok: true, httpStatus: 200 });
    expect(markWhoopWebhookEventTerminalProcessedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: WHOOP_WEBHOOK_ERROR_CODES.notConnected,
      }),
    );
    expect(fetchWhoopResourceByPathMock).not.toHaveBeenCalled();
  });

  it("marks provider failures as failed and returns non-2xx", async () => {
    processableAcquire();
    fetchWhoopResourceByPathMock.mockRejectedValue(
      new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.providerFailed, undefined, 503),
    );

    const result = await handleWhoopWebhook(
      signedRequest(buildPayload("workout.updated", WORKOUT_ID)),
    );

    expect(result).toEqual({
      ok: false,
      httpStatus: 502,
      error: WHOOP_WEBHOOK_ERROR_CODES.failed,
    });
    expect(markWhoopWebhookEventFailedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: WHOOP_WEBHOOK_ERROR_CODES.providerFailed,
      }),
    );
  });

  it("retries previously failed events on duplicate delivery", async () => {
    processableAcquire("event-retry");
    fetchWhoopResourceByPathMock.mockResolvedValue({
      id: WORKOUT_ID,
      user_id: WHOOP_USER_ID,
      score_state: "SCORED",
      score: { strain: 8.1 },
    });

    const result = await handleWhoopWebhook(
      signedRequest(buildPayload("workout.updated", WORKOUT_ID, "trace-retry")),
    );

    expect(result).toEqual({ ok: true, httpStatus: 200 });
    expect(upsertWhoopWorkoutsMock).toHaveBeenCalled();
  });
});
