import { beforeEach, describe, expect, it, vi } from "vitest";

import { WHOOP_WEBHOOK_SWEEP_BATCH_LIMIT } from "@/lib/jarvis/integrations/whoop/whoop-webhook-config";
import { WHOOP_WEBHOOK_ERROR_CODES } from "@/lib/jarvis/integrations/whoop/whoop-webhook-errors";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WHOOP_USER_ID = 10129;
const SLEEP_ID = "123e4567-e89b-12d3-a456-426614174000";

const listWhoopWebhookEventsForReplayMock = vi.fn();
const acquireWhoopWebhookEventMock = vi.fn();
const markWhoopWebhookEventProcessedMock = vi.fn();
const markWhoopWebhookEventFailedMock = vi.fn();
const markWhoopWebhookEventTerminalProcessedMock = vi.fn();
const touchWhoopConnectionLastWebhookAtMock = vi.fn();
const processPersistedWhoopWebhookEventMock = vi.fn();

vi.mock("@/lib/jarvis/integrations/whoop/whoop-webhook-persistence", () => ({
  listWhoopWebhookEventsForReplay: (...args: unknown[]) =>
    listWhoopWebhookEventsForReplayMock(...args),
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
}));

vi.mock("@/lib/jarvis/integrations/whoop/whoop-webhook-event-processor", () => ({
  buildWhoopWebhookPayloadFromPersistedEvent: vi.fn(({ event, whoopUserId }) => ({
    user_id: whoopUserId,
    id: event.resource_id,
    type: event.event_type,
    trace_id: event.trace_id,
  })),
  mapWebhookProcessingError: vi.fn((error: unknown) => {
    if (error instanceof Error && error.message === "terminal") {
      return {
        code: WHOOP_WEBHOOK_ERROR_CODES.userMismatch,
        retryable: false,
        terminal: true,
      };
    }

    return {
      code: WHOOP_WEBHOOK_ERROR_CODES.providerFailed,
      retryable: true,
      terminal: false,
    };
  }),
  processPersistedWhoopWebhookEvent: (...args: unknown[]) =>
    processPersistedWhoopWebhookEventMock(...args),
}));

import { sweepWhoopWebhookEvents } from "@/lib/jarvis/integrations/whoop/whoop-webhook-replay-service";
import { WHOOP_SYNC_ERROR_CODES, WhoopSyncError } from "@/lib/jarvis/integrations/whoop/whoop-sync-errors";

function connection() {
  return {
    connectionId: "conn-1",
    userId: USER_ID,
    whoopUserId: WHOOP_USER_ID,
  };
}

function failedEvent(traceId: string) {
  return {
    id: `event-${traceId}`,
    trace_id: traceId,
    user_id: USER_ID,
    event_type: "workout.updated",
    resource_id: SLEEP_ID,
    received_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    processed_at: null,
    status: "failed" as const,
    error_code: WHOOP_WEBHOOK_ERROR_CODES.providerFailed,
  };
}

describe("WHOOP webhook sweep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    markWhoopWebhookEventProcessedMock.mockResolvedValue(undefined);
    markWhoopWebhookEventFailedMock.mockResolvedValue(undefined);
    markWhoopWebhookEventTerminalProcessedMock.mockResolvedValue(undefined);
    touchWhoopConnectionLastWebhookAtMock.mockResolvedValue(undefined);
    processPersistedWhoopWebhookEventMock.mockResolvedValue(undefined);
  });

  it("uses a bounded batch when listing replay candidates", async () => {
    listWhoopWebhookEventsForReplayMock.mockResolvedValue([]);

    await sweepWhoopWebhookEvents({ connection: connection() });

    expect(listWhoopWebhookEventsForReplayMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        limit: WHOOP_WEBHOOK_SWEEP_BATCH_LIMIT,
      }),
    );
    expect(WHOOP_WEBHOOK_SWEEP_BATCH_LIMIT).toBe(50);
  });

  it("reclaims and processes failed events without raw webhook bodies", async () => {
    listWhoopWebhookEventsForReplayMock.mockResolvedValue([failedEvent("trace-1")]);
    acquireWhoopWebhookEventMock.mockResolvedValue({
      action: "process",
      event: failedEvent("trace-1"),
    });

    const result = await sweepWhoopWebhookEvents({ connection: connection() });

    expect(result).toEqual({
      attempted: 1,
      processed: 1,
      failed: 0,
      skipped: 0,
    });
    expect(processPersistedWhoopWebhookEventMock).toHaveBeenCalled();
    expect(markWhoopWebhookEventProcessedMock).toHaveBeenCalled();
  });

  it("skips candidates when concurrent reclaim loses", async () => {
    listWhoopWebhookEventsForReplayMock.mockResolvedValue([failedEvent("trace-1")]);
    acquireWhoopWebhookEventMock.mockResolvedValue({
      action: "noop",
      reason: "in_progress",
    });

    const result = await sweepWhoopWebhookEvents({ connection: connection() });

    expect(result.skipped).toBe(1);
    expect(processPersistedWhoopWebhookEventMock).not.toHaveBeenCalled();
  });

  it("marks retryable failures as failed", async () => {
    listWhoopWebhookEventsForReplayMock.mockResolvedValue([failedEvent("trace-2")]);
    acquireWhoopWebhookEventMock.mockResolvedValue({
      action: "process",
      event: failedEvent("trace-2"),
    });
    processPersistedWhoopWebhookEventMock.mockRejectedValue(
      new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.providerFailed),
    );

    const result = await sweepWhoopWebhookEvents({ connection: connection() });

    expect(result.failed).toBe(1);
    expect(markWhoopWebhookEventFailedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: WHOOP_WEBHOOK_ERROR_CODES.providerFailed,
      }),
    );
  });

  it("marks terminal retry conditions as processed", async () => {
    listWhoopWebhookEventsForReplayMock.mockResolvedValue([failedEvent("trace-3")]);
    acquireWhoopWebhookEventMock.mockResolvedValue({
      action: "process",
      event: failedEvent("trace-3"),
    });
    processPersistedWhoopWebhookEventMock.mockRejectedValue(new Error("terminal"));

    const result = await sweepWhoopWebhookEvents({ connection: connection() });

    expect(result.failed).toBe(1);
    expect(markWhoopWebhookEventTerminalProcessedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCode: WHOOP_WEBHOOK_ERROR_CODES.userMismatch,
      }),
    );
  });
});
