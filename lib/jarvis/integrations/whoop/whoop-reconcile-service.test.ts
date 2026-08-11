import { beforeEach, describe, expect, it, vi } from "vitest";

import { WHOOP_SYNC_ERROR_CODES } from "@/lib/jarvis/integrations/whoop/whoop-sync-errors";

const USER_ID = "11111111-1111-4111-8111-111111111111";

const loadWhoopRuntimeConnectionByUserIdMock = vi.fn();
const sweepWhoopWebhookEventsMock = vi.fn();
const reconcileWhoopFitnessDataMock = vi.fn();

vi.mock("@/lib/jarvis/integrations/whoop/whoop-connection-tools", () => ({
  loadWhoopRuntimeConnectionByUserId: (...args: unknown[]) =>
    loadWhoopRuntimeConnectionByUserIdMock(...args),
}));

vi.mock("@/lib/jarvis/integrations/whoop/whoop-webhook-replay-service", () => ({
  sweepWhoopWebhookEvents: (...args: unknown[]) =>
    sweepWhoopWebhookEventsMock(...args),
}));

vi.mock("@/lib/jarvis/integrations/whoop/whoop-sync-service", () => ({
  reconcileWhoopFitnessData: (...args: unknown[]) =>
    reconcileWhoopFitnessDataMock(...args),
}));

import { runWhoopReconcile } from "@/lib/jarvis/integrations/whoop/whoop-reconcile-service";

describe("WHOOP reconcile orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadWhoopRuntimeConnectionByUserIdMock.mockResolvedValue({
      connection: {
        id: "conn-1",
        status: "connected",
        whoop_user_id: 10129,
      },
      credentials: {},
    });
    sweepWhoopWebhookEventsMock.mockResolvedValue({
      attempted: 1,
      processed: 1,
      failed: 0,
      skipped: 0,
    });
    reconcileWhoopFitnessDataMock.mockResolvedValue({
      ok: true,
      summary: {
        cycles: 1,
        recoveries: 1,
        sleeps: 1,
        workouts: 1,
        bodyMeasurement: true,
        syncedAt: "2026-08-11T12:00:00.000Z",
      },
    });
  });

  it("no-ops safely when WHOOP is not connected", async () => {
    loadWhoopRuntimeConnectionByUserIdMock.mockResolvedValue(null);

    const result = await runWhoopReconcile(USER_ID);

    expect(result).toEqual({
      ok: true,
      status: "no_connected_whoop",
      webhook_events_retried: 0,
    });
    expect(sweepWhoopWebhookEventsMock).not.toHaveBeenCalled();
  });

  it("sweeps webhook events before collection reconciliation", async () => {
    await runWhoopReconcile(USER_ID);

    expect(sweepWhoopWebhookEventsMock).toHaveBeenCalledBefore(
      reconcileWhoopFitnessDataMock,
    );
  });

  it("returns sync_already_running when claim is held", async () => {
    reconcileWhoopFitnessDataMock.mockResolvedValue({
      ok: false,
      error: WHOOP_SYNC_ERROR_CODES.inProgress,
      httpStatus: 409,
    });

    const result = await runWhoopReconcile(USER_ID);

    expect(result).toEqual({
      ok: true,
      status: "sync_already_running",
      webhook_events_retried: 1,
    });
  });

  it("returns reconnect_required without hammering collection sync", async () => {
    reconcileWhoopFitnessDataMock.mockResolvedValue({
      ok: false,
      error: WHOOP_SYNC_ERROR_CODES.reconnectRequired,
      httpStatus: 401,
    });

    const result = await runWhoopReconcile(USER_ID);

    expect(result.status).toBe("reconnect_required");
  });
});
