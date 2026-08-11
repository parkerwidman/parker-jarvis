import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  WHOOP_API_BASE,
  WHOOP_PROFILE_PATH,
} from "@/lib/jarvis/integrations/whoop/whoop-config";
import {
  extractWhoopNextToken,
  fetchWhoopPaginatedCollection,
  validateWhoopPaginatedPayload,
  whoopDataFetch,
} from "@/lib/jarvis/integrations/whoop/whoop-data-client";
import {
  deriveWhoopTotalSleepMs,
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
  WHOOP_SYNC_MAX_PAGES,
  WHOOP_SYNC_PAGE_LIMIT,
  WHOOP_WORKOUTS_PATH,
  getWhoopSyncWindow,
} from "@/lib/jarvis/integrations/whoop/whoop-sync-config";
import {
  WHOOP_SYNC_ERROR_CODES,
  WhoopSyncError,
} from "@/lib/jarvis/integrations/whoop/whoop-sync-errors";
import {
  markWhoopSyncFailure,
  markWhoopSyncSuccess,
  releaseWhoopSyncClaim,
  upsertWhoopBodyMeasurement,
  upsertWhoopCycles,
  upsertWhoopRecoveries,
  upsertWhoopSleeps,
  upsertWhoopWorkouts,
} from "@/lib/jarvis/integrations/whoop/whoop-sync-persistence";
import { syncWhoopFitnessData } from "@/lib/jarvis/integrations/whoop/whoop-sync-service";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WHOOP_USER_ID = 10129;

const getClaimsMock = vi.fn();
const fetchMock = vi.fn();
const getValidWhoopAccessTokenMock = vi.fn();
const claimWhoopSyncMock = vi.fn();
const markWhoopSyncSuccessMock = vi.fn();
const markWhoopSyncFailureMock = vi.fn();
const releaseWhoopSyncClaimMock = vi.fn();
const upsertWhoopCyclesMock = vi.fn();
const upsertWhoopRecoveriesMock = vi.fn();
const upsertWhoopSleepsMock = vi.fn();
const upsertWhoopWorkoutsMock = vi.fn();
const upsertWhoopBodyMeasurementMock = vi.fn();

const fromMock = vi.fn();
const updateMock = vi.fn();
const upsertMock = vi.fn();
const eqMock = vi.fn();
const orMock = vi.fn();
const notMock = vi.fn();
const selectMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: getClaimsMock },
  })),
}));

vi.mock("@/lib/jarvis/integrations/whoop/whoop-token-manager", () => ({
  getValidWhoopAccessToken: (...args: unknown[]) =>
    getValidWhoopAccessTokenMock(...args),
}));

vi.mock("@/lib/jarvis/integrations/whoop/whoop-sync-persistence", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/jarvis/integrations/whoop/whoop-sync-persistence")
  >("@/lib/jarvis/integrations/whoop/whoop-sync-persistence");

  return {
    ...actual,
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
  };
});

vi.mock("@/lib/supabase/automation", () => ({
  createAutomationClient: vi.fn(() => ({
    from: fromMock,
  })),
}));

function buildAuthenticatedClaims() {
  getClaimsMock.mockResolvedValue({
    data: { claims: { sub: USER_ID } },
    error: null,
  });
}

function buildUnauthenticatedClaims() {
  getClaimsMock.mockResolvedValue({
    data: { claims: null },
    error: new Error("unauthorized"),
  });
}

function cycleRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 93845,
    user_id: WHOOP_USER_ID,
    created_at: "2022-04-24T11:25:44.774Z",
    updated_at: "2022-04-24T14:25:44.774Z",
    start: "2022-04-24T02:25:44.774Z",
    end: "2022-04-24T10:25:44.774Z",
    timezone_offset: "-05:00",
    score_state: "SCORED",
    score: {
      strain: 5.2,
      kilojoule: 8288,
      average_heart_rate: 68,
      max_heart_rate: 141,
    },
    ...overrides,
  };
}

describe("WHOOP sync config", () => {
  it("uses a named 90-day backfill window", () => {
    expect(WHOOP_SYNC_BACKFILL_DAYS).toBe(90);

    const window = getWhoopSyncWindow(Date.parse("2026-08-11T12:00:00.000Z"));
    expect(window.end).toBe("2026-08-11T12:00:00.000Z");
    expect(window.start).toBe("2026-05-13T12:00:00.000Z");
  });
});

describe("WHOOP pagination helpers", () => {
  it("validates records arrays and next_token types", () => {
    expect(validateWhoopPaginatedPayload({ records: [], next_token: null })).toEqual({
      records: [],
      next_token: null,
    });

    expect(() => validateWhoopPaginatedPayload({ records: "bad" })).toThrow(
      WhoopSyncError,
    );
    expect(() =>
      validateWhoopPaginatedPayload({ records: [], next_token: 123 }),
    ).toThrow(WhoopSyncError);
  });

  it("treats empty next token as terminal pagination", () => {
    expect(extractWhoopNextToken({ next_token: "" })).toBeNull();
    expect(extractWhoopNextToken({ next_token: "   " })).toBeNull();
    expect(extractWhoopNextToken({ next_token: "abc" })).toBe("abc");
  });
});

describe("WHOOP paginated collection fetch", () => {
  beforeEach(() => {
    global.fetch = fetchMock;
    fetchMock.mockReset();
  });

  it("fetches one page when next_token is absent", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        records: [cycleRecord()],
        next_token: null,
      }),
    });

    const records = await fetchWhoopPaginatedCollection({
      accessToken: "access-token",
      path: WHOOP_CYCLES_PATH,
      start: "2026-05-13T00:00:00.000Z",
      end: "2026-08-11T00:00:00.000Z",
      parseRecord: (record) => record,
    });

    expect(records).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string | URL, RequestInit];
    const urlString = String(url);
    expect(urlString).toContain(`${WHOOP_API_BASE}${WHOOP_CYCLES_PATH}`);
    expect(urlString).toContain("limit=25");
    expect(urlString).toContain("start=2026-05-13T00%3A00%3A00.000Z");
    expect(init.headers).toEqual({
      Authorization: "Bearer access-token",
    });
    expect(urlString).not.toContain("access-token");
  });

  it("paginates with repeated start/end and nextToken", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          records: [cycleRecord({ id: 1 })],
          next_token: "page-2",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          records: [cycleRecord({ id: 2 })],
          next_token: "",
        }),
      });

    const records = await fetchWhoopPaginatedCollection({
      accessToken: "access-token",
      path: WHOOP_CYCLES_PATH,
      start: "2026-05-13T00:00:00.000Z",
      end: "2026-08-11T00:00:00.000Z",
      parseRecord: (record) => record,
    });

    expect(records).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("nextToken=page-2");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "start=2026-05-13T00%3A00%3A00.000Z",
    );
  });

  it("rejects repeated next_token loops", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        records: [cycleRecord()],
        next_token: "same-token",
      }),
    });

    await expect(
      fetchWhoopPaginatedCollection({
        accessToken: "access-token",
        path: WHOOP_CYCLES_PATH,
        start: "2026-05-13T00:00:00.000Z",
        end: "2026-08-11T00:00:00.000Z",
        parseRecord: (record) => record,
      }),
    ).rejects.toMatchObject({
      code: WHOOP_SYNC_ERROR_CODES.invalidPayload,
    });
  });

  it("handles 401 without exposing tokens", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "invalid_token" }),
    });

    await expect(
      whoopDataFetch({
        accessToken: "access-token",
        path: WHOOP_CYCLES_PATH,
      }),
    ).rejects.toMatchObject({
      code: WHOOP_SYNC_ERROR_CODES.reconnectRequired,
      providerHttpStatus: 401,
    });
  });

  it("handles 429 with Retry-After once", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => "1" },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ records: [] }),
      });

    const response = await whoopDataFetch({
      accessToken: "access-token",
      path: WHOOP_CYCLES_PATH,
    });

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("handles provider 5xx safely", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ message: "upstream failure" }),
    });

    await expect(
      whoopDataFetch({
        accessToken: "access-token",
        path: WHOOP_CYCLES_PATH,
      }),
    ).rejects.toMatchObject({
      code: WHOOP_SYNC_ERROR_CODES.providerFailed,
      providerHttpStatus: 503,
    });
  });

  it("fails closed when pagination exceeds the page cap", async () => {
    let page = 0;

    fetchMock.mockImplementation(async () => {
      page += 1;

      return {
        ok: true,
        status: 200,
        json: async () => ({
          records: [cycleRecord({ id: page })],
          next_token: `page-${page}`,
        }),
      };
    });

    await expect(
      fetchWhoopPaginatedCollection({
        accessToken: "access-token",
        path: WHOOP_CYCLES_PATH,
        start: "2026-05-13T00:00:00.000Z",
        end: "2026-08-11T00:00:00.000Z",
        parseRecord: (record) => record,
      }),
    ).rejects.toMatchObject({
      code: WHOOP_SYNC_ERROR_CODES.paginationLimitExceeded,
    });

    expect(fetchMock).toHaveBeenCalledTimes(WHOOP_SYNC_MAX_PAGES);
  });
});

describe("WHOOP data mappers", () => {
  it("maps scored cycles and current cycles without end", () => {
    const scored = mapWhoopCycleRecord({
      userId: USER_ID,
      expectedWhoopUserId: WHOOP_USER_ID,
      record: cycleRecord() as never,
    });
    expect(scored.strain).toBe(5.2);
    expect(scored.avg_heart_rate).toBe(68);

    const current = mapWhoopCycleRecord({
      userId: USER_ID,
      expectedWhoopUserId: WHOOP_USER_ID,
      record: cycleRecord({ end: null, score_state: "PENDING_SCORE", score: null }) as never,
    });
    expect(current.end_at).toBeNull();
    expect(current.strain).toBeNull();
  });

  it("maps scored and unscored recoveries with optional fields missing", () => {
    const scored = mapWhoopRecoveryRecord({
      userId: USER_ID,
      expectedWhoopUserId: WHOOP_USER_ID,
      record: {
        cycle_id: 1,
        sleep_id: "123e4567-e89b-12d3-a456-426614174000",
        user_id: WHOOP_USER_ID,
        score_state: "SCORED",
        updated_at: "2022-04-24T14:25:44.774Z",
        score: {
          recovery_score: 44,
          resting_heart_rate: 64,
          hrv_rmssd_milli: 31.8,
          user_calibrating: false,
        },
      },
    });
    expect(scored.recovery_score).toBe(44);
    expect(scored.spo2_percentage).toBeNull();

    const unscored = mapWhoopRecoveryRecord({
      userId: USER_ID,
      expectedWhoopUserId: WHOOP_USER_ID,
      record: {
        cycle_id: 1,
        sleep_id: "123e4567-e89b-12d3-a456-426614174000",
        user_id: WHOOP_USER_ID,
        score_state: "UNSCORABLE",
        updated_at: "2022-04-24T14:25:44.774Z",
        score: null,
      },
    });
    expect(unscored.recovery_score).toBeNull();
  });

  it("maps scored sleeps, naps, and derived total sleep in milliseconds", () => {
    const mapped = mapWhoopSleepRecord({
      userId: USER_ID,
      expectedWhoopUserId: WHOOP_USER_ID,
      record: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        user_id: WHOOP_USER_ID,
        cycle_id: 93845,
        start: "2022-04-24T02:25:44.774Z",
        end: "2022-04-24T10:25:44.774Z",
        timezone_offset: "-05:00",
        nap: true,
        score_state: "SCORED",
        updated_at: "2022-04-24T14:25:44.774Z",
        score: {
          stage_summary: {
            total_light_sleep_time_milli: 1000,
            total_slow_wave_sleep_time_milli: 2000,
            total_rem_sleep_time_milli: 3000,
          },
          sleep_needed: { baseline_milli: 27395716 },
          respiratory_rate: 16.1,
          sleep_performance_percentage: 98,
          sleep_efficiency_percentage: 91.6,
          sleep_consistency_percentage: 90,
        },
      },
    });

    expect(mapped.is_nap).toBe(true);
    expect(mapped.total_sleep_ms).toBe(6000);
    expect(mapped.sleep_need_baseline_ms).toBe(27395716);
    expect(
      deriveWhoopTotalSleepMs({
        total_light_sleep_time_milli: 1000,
        total_slow_wave_sleep_time_milli: 2000,
        total_rem_sleep_time_milli: 3000,
      }),
    ).toBe(6000);
  });

  it("maps scored and unscored workouts without inventing unsupported fields", () => {
    const scored = mapWhoopWorkoutRecord({
      userId: USER_ID,
      expectedWhoopUserId: WHOOP_USER_ID,
      record: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        user_id: WHOOP_USER_ID,
        sport_name: "running",
        start: "2022-04-24T02:25:44.774Z",
        end: "2022-04-24T10:25:44.774Z",
        timezone_offset: "-05:00",
        score_state: "SCORED",
        updated_at: "2022-04-24T14:25:44.774Z",
        score: {
          strain: 8.2,
          average_heart_rate: 123,
          max_heart_rate: 146,
          kilojoule: 1569,
          distance_meter: 1772,
        },
      },
    });
    expect(scored.distance_meter).toBe(1772);

    const unscored = mapWhoopWorkoutRecord({
      userId: USER_ID,
      expectedWhoopUserId: WHOOP_USER_ID,
      record: {
        id: "223e4567-e89b-12d3-a456-426614174000",
        user_id: WHOOP_USER_ID,
        sport_name: "cycling",
        score_state: "PENDING_SCORE",
        score: null,
      },
    });
    expect(unscored.strain).toBeNull();
  });

  it("maps body measurement snapshots", () => {
    const mapped = mapWhoopBodyMeasurementRecord({
      userId: USER_ID,
      syncedAt: "2026-08-11T12:00:00.000Z",
      record: parseWhoopBodyMeasurementRecord({
        height_meter: 1.82,
        weight_kilogram: 90.7,
        max_heart_rate: 200,
      }),
    });

    expect(mapped.height_meter).toBe(1.82);
    expect(mapped.synced_at).toBe("2026-08-11T12:00:00.000Z");
  });

  it("rejects malformed body measurement payloads", () => {
    for (const payload of [null, "bad", [], { height_meter: "tall" }]) {
      expect(() => parseWhoopBodyMeasurementRecord(payload)).toThrow(WhoopSyncError);
    }

    expect(parseWhoopBodyMeasurementRecord({})).toEqual({});
  });

  it("fails closed on WHOOP user mismatch", () => {
    expect(() =>
      mapWhoopCycleRecord({
        userId: USER_ID,
        expectedWhoopUserId: WHOOP_USER_ID,
        record: cycleRecord({ user_id: 99999 }) as never,
      }),
    ).toThrow(WhoopSyncError);
  });
});

describe("WHOOP sync orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = fetchMock;
    fetchMock.mockReset();
    claimWhoopSyncMock.mockResolvedValue({
      claimed: true,
      connectionId: "conn-1",
      whoopUserId: WHOOP_USER_ID,
    });
    getValidWhoopAccessTokenMock.mockResolvedValue({
      success: true,
      accessToken: "access-token",
    });
    upsertWhoopCyclesMock.mockResolvedValue(undefined);
    upsertWhoopRecoveriesMock.mockResolvedValue(undefined);
    upsertWhoopSleepsMock.mockResolvedValue(undefined);
    upsertWhoopWorkoutsMock.mockResolvedValue(undefined);
    upsertWhoopBodyMeasurementMock.mockResolvedValue(undefined);
    markWhoopSyncSuccessMock.mockResolvedValue(undefined);
    markWhoopSyncFailureMock.mockResolvedValue(undefined);
    releaseWhoopSyncClaimMock.mockResolvedValue(undefined);
  });

  function mockSuccessfulProviderFetch() {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes(WHOOP_CYCLES_PATH)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ records: [cycleRecord()], next_token: null }),
        };
      }

      if (String(url).includes(WHOOP_RECOVERIES_PATH)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            records: [
              {
                cycle_id: 93845,
                sleep_id: "123e4567-e89b-12d3-a456-426614174000",
                user_id: WHOOP_USER_ID,
                score_state: "SCORED",
                updated_at: "2022-04-24T14:25:44.774Z",
                score: {
                  recovery_score: 44,
                  resting_heart_rate: 64,
                  hrv_rmssd_milli: 31.8,
                  user_calibrating: false,
                },
              },
            ],
            next_token: null,
          }),
        };
      }

      if (String(url).includes(WHOOP_SLEEPS_PATH)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            records: [
              {
                id: "123e4567-e89b-12d3-a456-426614174000",
                user_id: WHOOP_USER_ID,
                score_state: "SCORED",
                score: {
                  stage_summary: {
                    total_light_sleep_time_milli: 1000,
                    total_slow_wave_sleep_time_milli: 2000,
                    total_rem_sleep_time_milli: 3000,
                  },
                },
              },
            ],
            next_token: null,
          }),
        };
      }

      if (String(url).includes(WHOOP_WORKOUTS_PATH)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            records: [
              {
                id: "223e4567-e89b-12d3-a456-426614174000",
                user_id: WHOOP_USER_ID,
                score_state: "SCORED",
                score: { strain: 8.2 },
              },
            ],
            next_token: null,
          }),
        };
      }

      if (String(url).includes(WHOOP_BODY_MEASUREMENT_PATH)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            height_meter: 1.82,
            weight_kilogram: 90.7,
            max_heart_rate: 200,
          }),
        };
      }

      throw new Error(`unexpected url ${url}`);
    });
  }

  it("syncs all resource types and advances success state", async () => {
    mockSuccessfulProviderFetch();

    const result = await syncWhoopFitnessData(USER_ID);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary).toMatchObject({
        cycles: 1,
        recoveries: 1,
        sleeps: 1,
        workouts: 1,
        bodyMeasurement: true,
      });
    }

    expect(getValidWhoopAccessTokenMock).toHaveBeenCalledWith(USER_ID);
    expect(markWhoopSyncSuccessMock).toHaveBeenCalled();
    expect(markWhoopSyncFailureMock).not.toHaveBeenCalled();
    expect(releaseWhoopSyncClaimMock).not.toHaveBeenCalled();
  });

  it("returns not connected when claim fails", async () => {
    claimWhoopSyncMock.mockResolvedValue({
      claimed: false,
      reason: "not_connected",
    });

    const result = await syncWhoopFitnessData(USER_ID);

    expect(result).toEqual({
      ok: false,
      error: WHOOP_SYNC_ERROR_CODES.notConnected,
      httpStatus: 400,
    });
  });

  it("returns in progress when another sync holds the claim", async () => {
    claimWhoopSyncMock.mockResolvedValue({
      claimed: false,
      reason: "in_progress",
    });

    const result = await syncWhoopFitnessData(USER_ID);

    expect(result).toEqual({
      ok: false,
      error: WHOOP_SYNC_ERROR_CODES.inProgress,
      httpStatus: 409,
    });
  });

  it("keeps partial upserts and reports failure without advancing success", async () => {
    mockSuccessfulProviderFetch();
    upsertWhoopSleepsMock.mockRejectedValue(
      new Error(WHOOP_SYNC_ERROR_CODES.databaseFailed),
    );

    const result = await syncWhoopFitnessData(USER_ID);

    expect(result.ok).toBe(false);
    expect(upsertWhoopCyclesMock).toHaveBeenCalled();
    expect(upsertWhoopRecoveriesMock).toHaveBeenCalled();
    expect(markWhoopSyncSuccessMock).not.toHaveBeenCalled();
    expect(markWhoopSyncFailureMock).toHaveBeenCalledWith(
      USER_ID,
      WHOOP_SYNC_ERROR_CODES.databaseFailed,
    );
    expect(releaseWhoopSyncClaimMock).toHaveBeenCalledWith(USER_ID);
  });

  it("rejects malformed body measurement responses without upserting", async () => {
    mockSuccessfulProviderFetch();
    const successfulFetch = fetchMock.getMockImplementation();

    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes(WHOOP_BODY_MEASUREMENT_PATH)) {
        return {
          ok: true,
          status: 200,
          json: async () => null,
        };
      }

      return successfulFetch?.(url);
    });

    const result = await syncWhoopFitnessData(USER_ID);

    expect(result).toMatchObject({
      ok: false,
      error: WHOOP_SYNC_ERROR_CODES.invalidPayload,
    });
    expect(upsertWhoopBodyMeasurementMock).not.toHaveBeenCalled();
    expect(markWhoopSyncSuccessMock).not.toHaveBeenCalled();
  });
});

describe("WHOOP sync persistence claim", () => {
  let capturedOrFilter: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedOrFilter = undefined;

    maybeSingleMock.mockResolvedValue({
      data: {
        id: "conn-1",
        status: "connected",
        whoop_user_id: WHOOP_USER_ID,
        sync_in_progress_at: null,
      },
      error: null,
    });

    selectMock.mockReturnValue({
      eq: eqMock,
      maybeSingle: maybeSingleMock,
    });
    eqMock.mockReturnValue({
      eq: eqMock,
      or: orMock,
      select: selectMock,
      maybeSingle: maybeSingleMock,
      not: notMock,
    });
    orMock.mockImplementation((filter: string) => {
      capturedOrFilter = filter;
      return { select: selectMock };
    });
    updateMock.mockReturnValue({ eq: eqMock, or: orMock, select: selectMock });
    fromMock.mockReturnValue({ select: selectMock, update: updateMock });
    upsertMock.mockResolvedValue({ error: null });
  });

  it("claims sync ownership atomically when idle", async () => {
    const { claimWhoopSync: claimWhoopSyncActual } = await vi.importActual<
      typeof import("@/lib/jarvis/integrations/whoop/whoop-sync-persistence")
    >("@/lib/jarvis/integrations/whoop/whoop-sync-persistence");

    maybeSingleMock
      .mockResolvedValueOnce({
        data: {
          id: "conn-1",
          status: "connected",
          whoop_user_id: WHOOP_USER_ID,
          sync_in_progress_at: null,
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: "conn-1" }, error: null });

    const result = await claimWhoopSyncActual(USER_ID);

    expect(result).toEqual({
      claimed: true,
      connectionId: "conn-1",
      whoopUserId: WHOOP_USER_ID,
    });
    expect(capturedOrFilter).toMatch(
      /^sync_in_progress_at\.is\.null,sync_in_progress_at\.lt\."[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z"$/,
    );
  });
});

describe("WHOOP API contract constants", () => {
  it("uses v2 collection endpoints with page limit 25", () => {
    expect(WHOOP_CYCLES_PATH).toBe("/v2/cycle");
    expect(WHOOP_RECOVERIES_PATH).toBe("/v2/recovery");
    expect(WHOOP_SLEEPS_PATH).toBe("/v2/activity/sleep");
    expect(WHOOP_WORKOUTS_PATH).toBe("/v2/activity/workout");
    expect(WHOOP_BODY_MEASUREMENT_PATH).toBe("/v2/user/measurement/body");
    expect(WHOOP_SYNC_PAGE_LIMIT).toBe(25);
    expect(`${WHOOP_API_BASE}${WHOOP_PROFILE_PATH}`).toContain("/developer/v2/");
  });
});
