import { beforeEach, describe, expect, it, vi } from "vitest";

import { WHOOP_WEBHOOK_STALE_PENDING_MS } from "@/lib/jarvis/integrations/whoop/whoop-webhook-config";
import { WHOOP_WEBHOOK_ERROR_CODES } from "@/lib/jarvis/integrations/whoop/whoop-webhook-errors";
import {
  acquireWhoopWebhookEvent,
  isWhoopWebhookEventStatus,
} from "@/lib/jarvis/integrations/whoop/whoop-webhook-persistence";
import type { WhoopWebhookEventRecord } from "@/lib/jarvis/integrations/whoop/whoop-webhook-types";

const fromMock = vi.fn();
const insertMock = vi.fn();
const updateMock = vi.fn();
const eqMock = vi.fn();
const ltMock = vi.fn();
const selectMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock("@/lib/supabase/automation", () => ({
  createAutomationClient: vi.fn(() => ({
    from: fromMock,
  })),
}));

function buildEvent(
  overrides: Partial<WhoopWebhookEventRecord> = {},
): WhoopWebhookEventRecord {
  const nowIso = new Date().toISOString();

  return {
    id: "event-1",
    trace_id: "trace-1",
    user_id: "11111111-1111-4111-8111-111111111111",
    event_type: "sleep.updated",
    resource_id: "123e4567-e89b-12d3-a456-426614174000",
    received_at: nowIso,
    updated_at: nowIso,
    processed_at: null,
    status: "pending",
    error_code: null,
    ...overrides,
  };
}

describe("WHOOP webhook persistence acquire", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    selectMock.mockReturnValue({ eq: eqMock, maybeSingle: maybeSingleMock });
    ltMock.mockReturnValue({ select: selectMock });
    eqMock.mockImplementation(() => ({
      eq: eqMock,
      lt: ltMock,
      select: selectMock,
      maybeSingle: maybeSingleMock,
    }));
    updateMock.mockReturnValue({ eq: eqMock, lt: ltMock, select: selectMock });
    insertMock.mockReturnValue({ select: selectMock });
    fromMock.mockReturnValue({ insert: insertMock, update: updateMock, select: selectMock });
  });

  it("processes a first trace_id insert", async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: buildEvent(),
      error: null,
    });

    const result = await acquireWhoopWebhookEvent({
      traceId: "trace-1",
      userId: "11111111-1111-4111-8111-111111111111",
      eventType: "sleep.updated",
      resourceId: "123e4567-e89b-12d3-a456-426614174000",
    });

    expect(result.action).toBe("process");
  });

  it("returns noop for duplicate processed trace_id", async () => {
    maybeSingleMock
      .mockResolvedValueOnce({ data: null, error: { code: "23505" } })
      .mockResolvedValueOnce({
        data: buildEvent({ status: "processed", processed_at: new Date().toISOString() }),
        error: null,
      });

    const result = await acquireWhoopWebhookEvent({
      traceId: "trace-1",
      userId: "11111111-1111-4111-8111-111111111111",
      eventType: "sleep.updated",
      resourceId: "123e4567-e89b-12d3-a456-426614174000",
    });

    expect(result).toEqual({ action: "noop", reason: "already_processed" });
  });

  it("reclaims failed trace_id for retry", async () => {
    maybeSingleMock
      .mockResolvedValueOnce({ data: null, error: { code: "23505" } })
      .mockResolvedValueOnce({
        data: buildEvent({ status: "failed", error_code: "whoop_webhook_provider_failed" }),
        error: null,
      })
      .mockResolvedValueOnce({
        data: buildEvent({ status: "pending" }),
        error: null,
      });

    const result = await acquireWhoopWebhookEvent({
      traceId: "trace-1",
      userId: "11111111-1111-4111-8111-111111111111",
      eventType: "sleep.updated",
      resourceId: "123e4567-e89b-12d3-a456-426614174000",
    });

    expect(result.action).toBe("process");
  });

  it("returns in_progress when a failed reclaim loser observes pending", async () => {
    maybeSingleMock
      .mockResolvedValueOnce({ data: null, error: { code: "23505" } })
      .mockResolvedValueOnce({
        data: buildEvent({ status: "failed", error_code: "whoop_webhook_provider_failed" }),
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });

    const result = await acquireWhoopWebhookEvent({
      traceId: "trace-1",
      userId: "11111111-1111-4111-8111-111111111111",
      eventType: "sleep.updated",
      resourceId: "123e4567-e89b-12d3-a456-426614174000",
    });

    expect(result).toEqual({ action: "noop", reason: "in_progress" });
  });

  it("returns in_progress for fresh pending duplicates", async () => {
    maybeSingleMock
      .mockResolvedValueOnce({ data: null, error: { code: "23505" } })
      .mockResolvedValueOnce({
        data: buildEvent({
          status: "pending",
          updated_at: new Date().toISOString(),
        }),
        error: null,
      });

    const result = await acquireWhoopWebhookEvent({
      traceId: "trace-1",
      userId: "11111111-1111-4111-8111-111111111111",
      eventType: "sleep.updated",
      resourceId: "123e4567-e89b-12d3-a456-426614174000",
      now: new Date(),
    });

    expect(result).toEqual({ action: "noop", reason: "in_progress" });
  });

  it("reclaims stale pending events using updated_at lease semantics", async () => {
    const staleUpdatedAt = new Date(
      Date.now() - WHOOP_WEBHOOK_STALE_PENDING_MS - 60_000,
    ).toISOString();

    maybeSingleMock
      .mockResolvedValueOnce({ data: null, error: { code: "23505" } })
      .mockResolvedValueOnce({
        data: buildEvent({
          status: "pending",
          updated_at: staleUpdatedAt,
        }),
        error: null,
      })
      .mockResolvedValueOnce({
        data: buildEvent({ status: "pending", updated_at: new Date().toISOString() }),
        error: null,
      });

    const result = await acquireWhoopWebhookEvent({
      traceId: "trace-1",
      userId: "11111111-1111-4111-8111-111111111111",
      eventType: "sleep.updated",
      resourceId: "123e4567-e89b-12d3-a456-426614174000",
      now: new Date(),
    });

    expect(result.action).toBe("process");
    expect(ltMock).toHaveBeenCalled();
  });

  it("returns in_progress when a stale reclaim loser observes a fresh lease", async () => {
    const staleUpdatedAt = new Date(
      Date.now() - WHOOP_WEBHOOK_STALE_PENDING_MS - 60_000,
    ).toISOString();

    maybeSingleMock
      .mockResolvedValueOnce({ data: null, error: { code: "23505" } })
      .mockResolvedValueOnce({
        data: buildEvent({
          status: "pending",
          updated_at: staleUpdatedAt,
        }),
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });

    const result = await acquireWhoopWebhookEvent({
      traceId: "trace-1",
      userId: "11111111-1111-4111-8111-111111111111",
      eventType: "sleep.updated",
      resourceId: "123e4567-e89b-12d3-a456-426614174000",
      now: new Date(),
    });

    expect(result).toEqual({ action: "noop", reason: "in_progress" });
  });

  it("validates supported webhook statuses", () => {
    expect(isWhoopWebhookEventStatus("pending")).toBe(true);
    expect(isWhoopWebhookEventStatus("processed")).toBe(true);
    expect(isWhoopWebhookEventStatus("failed")).toBe(true);
    expect(isWhoopWebhookEventStatus("processing")).toBe(false);
  });
});

describe("WHOOP webhook persistence error codes", () => {
  it("uses stable internal webhook error codes", () => {
    expect(WHOOP_WEBHOOK_ERROR_CODES.failed).toBe("whoop_webhook_failed");
    expect(WHOOP_WEBHOOK_ERROR_CODES.unknownUser).toBe("whoop_webhook_unknown_user");
  });
});
