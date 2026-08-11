import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  WHOOP_RECONCILE_WINDOW_DAYS,
  WHOOP_SYNC_BACKFILL_DAYS,
  getWhoopReconcileWindow,
} from "@/lib/jarvis/integrations/whoop/whoop-sync-config";
import { WHOOP_SYNC_ERROR_CODES } from "@/lib/jarvis/integrations/whoop/whoop-sync-errors";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WHOOP_USER_ID = 10129;

const claimWhoopSyncMock = vi.fn();
const markWhoopSyncSuccessMock = vi.fn();
const markWhoopSyncFailureMock = vi.fn();
const releaseWhoopSyncClaimMock = vi.fn();
const upsertWhoopCyclesMock = vi.fn();
const upsertWhoopRecoveriesMock = vi.fn();
const upsertWhoopSleepsMock = vi.fn();
const upsertWhoopWorkoutsMock = vi.fn();
const upsertWhoopBodyMeasurementMock = vi.fn();
const getValidWhoopAccessTokenMock = vi.fn();
const fetchWhoopPaginatedCollectionMock = vi.fn();
const fetchWhoopJsonMock = vi.fn();

vi.mock("@/lib/jarvis/integrations/whoop/whoop-sync-persistence", () => ({
  claimWhoopSync: (...args: unknown[]) => claimWhoopSyncMock(...args),
  markWhoopSyncSuccess: (...args: unknown[]) => markWhoopSyncSuccessMock(...args),
  markWhoopSyncFailure: (...args: unknown[]) => markWhoopSyncFailureMock(...args),
  releaseWhoopSyncClaim: (...args: unknown[]) => releaseWhoopSyncClaimMock(...args),
  upsertWhoopCycles: (...args: unknown[]) => upsertWhoopCyclesMock(...args),
  upsertWhoopRecoveries: (...args: unknown[]) => upsertWhoopRecoveriesMock(...args),
  upsertWhoopSleeps: (...args: unknown[]) => upsertWhoopSleepsMock(...args),
  upsertWhoopWorkouts: (...args: unknown[]) => upsertWhoopWorkoutsMock(...args),
  upsertWhoopBodyMeasurement: (...args: unknown[]) =>
    upsertWhoopBodyMeasurementMock(...args),
}));

vi.mock("@/lib/jarvis/integrations/whoop/whoop-token-manager", () => ({
  getValidWhoopAccessToken: (...args: unknown[]) =>
    getValidWhoopAccessTokenMock(...args),
}));

vi.mock("@/lib/jarvis/integrations/whoop/whoop-data-client", () => ({
  fetchWhoopPaginatedCollection: (...args: unknown[]) =>
    fetchWhoopPaginatedCollectionMock(...args),
  fetchWhoopJson: (...args: unknown[]) => fetchWhoopJsonMock(...args),
}));

import {
  reconcileWhoopFitnessData,
  syncWhoopFitnessData,
  syncWhoopFitnessDataForWindow,
} from "@/lib/jarvis/integrations/whoop/whoop-sync-service";

describe("WHOOP windowed sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    claimWhoopSyncMock.mockResolvedValue({
      claimed: true,
      connectionId: "conn-1",
      whoopUserId: WHOOP_USER_ID,
    });
    getValidWhoopAccessTokenMock.mockResolvedValue({
      success: true,
      accessToken: "access-token",
    });
    fetchWhoopPaginatedCollectionMock.mockResolvedValue([]);
    fetchWhoopJsonMock.mockResolvedValue({
      height_meter: 1.8,
      weight_kilogram: 80,
      max_heart_rate: 190,
    });
    markWhoopSyncSuccessMock.mockResolvedValue(undefined);
    markWhoopSyncFailureMock.mockResolvedValue(undefined);
    releaseWhoopSyncClaimMock.mockResolvedValue(undefined);
    upsertWhoopCyclesMock.mockResolvedValue(undefined);
    upsertWhoopRecoveriesMock.mockResolvedValue(undefined);
    upsertWhoopSleepsMock.mockResolvedValue(undefined);
    upsertWhoopWorkoutsMock.mockResolvedValue(undefined);
    upsertWhoopBodyMeasurementMock.mockResolvedValue(undefined);
  });

  it("keeps manual sync on a 90-day window", async () => {
    await syncWhoopFitnessData(USER_ID);

    const firstCall = fetchWhoopPaginatedCollectionMock.mock.calls[0]?.[0] as {
      start: string;
      end: string;
    };

    const startMs = Date.parse(firstCall.start);
    const endMs = Date.parse(firstCall.end);
    const windowDays = (endMs - startMs) / (24 * 60 * 60 * 1000);

    expect(windowDays).toBeCloseTo(WHOOP_SYNC_BACKFILL_DAYS, 0);
    expect(WHOOP_SYNC_BACKFILL_DAYS).toBe(90);
  });

  it("uses a 7-day window for reconciliation", async () => {
    await reconcileWhoopFitnessData(USER_ID);

    const firstCall = fetchWhoopPaginatedCollectionMock.mock.calls[0]?.[0] as {
      start: string;
      end: string;
    };

    const startMs = Date.parse(firstCall.start);
    const endMs = Date.parse(firstCall.end);
    const windowDays = (endMs - startMs) / (24 * 60 * 60 * 1000);

    expect(windowDays).toBeCloseTo(WHOOP_RECONCILE_WINDOW_DAYS, 0);
    expect(WHOOP_RECONCILE_WINDOW_DAYS).toBe(7);
  });

  it("updates last_successful_sync_at only after full successful reconcile", async () => {
    await reconcileWhoopFitnessData(USER_ID);

    expect(markWhoopSyncSuccessMock).toHaveBeenCalledWith(
      USER_ID,
      expect.any(String),
    );
    expect(releaseWhoopSyncClaimMock).not.toHaveBeenCalled();
  });

  it("does not mark full sync successful on partial failure", async () => {
    upsertWhoopSleepsMock.mockRejectedValueOnce(new Error("db failed"));

    const result = await syncWhoopFitnessDataForWindow({
      userId: USER_ID,
      window: getWhoopReconcileWindow(),
    });

    expect(result.ok).toBe(false);
    expect(markWhoopSyncSuccessMock).not.toHaveBeenCalled();
    expect(releaseWhoopSyncClaimMock).toHaveBeenCalledWith(USER_ID);
  });

  it("fetches body measurement once per reconcile", async () => {
    await reconcileWhoopFitnessData(USER_ID);

    expect(fetchWhoopJsonMock).toHaveBeenCalledTimes(1);
    expect(upsertWhoopBodyMeasurementMock).toHaveBeenCalledTimes(1);
  });

  it("returns in_progress when sync claim is already held", async () => {
    claimWhoopSyncMock.mockResolvedValue({
      claimed: false,
      reason: "in_progress",
    });

    const result = await reconcileWhoopFitnessData(USER_ID);

    expect(result).toEqual({
      ok: false,
      error: WHOOP_SYNC_ERROR_CODES.inProgress,
      httpStatus: 409,
    });
    expect(fetchWhoopPaginatedCollectionMock).not.toHaveBeenCalled();
  });
});
