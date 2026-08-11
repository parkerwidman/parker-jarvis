import { describe, expect, it } from "vitest";

import {
  selectBodySnapshot,
  selectCycleForToday,
  selectRecoveryForToday,
  selectSleepForToday,
  selectWorkoutsForToday,
  type FitnessRecoveryRecord,
  type FitnessSleepRecord,
} from "@/lib/jarvis/fitness/fitness-today-selection";

const TIME_ZONE = "America/Chicago";
const TODAY = "2026-08-11";

function sleep(
  overrides: Partial<FitnessSleepRecord> & Pick<FitnessSleepRecord, "whoop_sleep_id">,
): FitnessSleepRecord {
  return {
    end_at: null,
    is_nap: false,
    score_state: "SCORED",
    sleep_performance_pct: 90,
    sleep_efficiency_pct: 91,
    sleep_consistency_pct: 88,
    total_sleep_ms: 27_720_000,
    sleep_need_baseline_ms: null,
    respiratory_rate: 16,
    ...overrides,
  };
}

function recovery(
  overrides: Partial<FitnessRecoveryRecord> &
    Pick<FitnessRecoveryRecord, "whoop_sleep_id">,
): FitnessRecoveryRecord {
  return {
    whoop_cycle_id: 1,
    score_state: "SCORED",
    recovery_score: 72,
    resting_heart_rate: 58,
    hrv_rmssd_milli: 42,
    spo2_percentage: 97,
    skin_temp_celsius: 33.5,
    whoop_updated_at: "2026-08-11T12:00:00.000Z",
    ...overrides,
  };
}

describe("fitness today selection", () => {
  it("selects recovery linked to sleep ending today", () => {
    const sleepsById = new Map([
      [
        "sleep-today",
        sleep({
          whoop_sleep_id: "sleep-today",
          end_at: "2026-08-11T12:00:00.000Z",
        }),
      ],
      [
        "sleep-yesterday",
        sleep({
          whoop_sleep_id: "sleep-yesterday",
          end_at: "2026-08-10T12:00:00.000Z",
        }),
      ],
    ]);

    const selected = selectRecoveryForToday({
      recoveries: [
        recovery({ whoop_sleep_id: "sleep-yesterday", recovery_score: 40 }),
        recovery({ whoop_sleep_id: "sleep-today", recovery_score: 72 }),
      ],
      sleepsById,
      todayDate: TODAY,
      timeZone: TIME_ZONE,
    });

    expect(selected?.whoop_sleep_id).toBe("sleep-today");
    expect(selected?.recovery_score).toBe(72);
  });

  it("prefers the latest non-nap sleep ending today", () => {
    const selected = selectSleepForToday({
      sleeps: [
        sleep({
          whoop_sleep_id: "nap",
          is_nap: true,
          end_at: "2026-08-11T15:00:00.000Z",
        }),
        sleep({
          whoop_sleep_id: "overnight",
          end_at: "2026-08-11T12:00:00.000Z",
        }),
      ],
      todayDate: TODAY,
      timeZone: TIME_ZONE,
    });

    expect(selected?.whoop_sleep_id).toBe("overnight");
    expect(selected?.is_nap).toBe(false);
  });

  it("falls back to the latest non-nap sleep when none ended today", () => {
    const selected = selectSleepForToday({
      sleeps: [
        sleep({
          whoop_sleep_id: "older",
          end_at: "2026-08-09T12:00:00.000Z",
        }),
        sleep({
          whoop_sleep_id: "recent",
          end_at: "2026-08-10T12:00:00.000Z",
        }),
      ],
      todayDate: TODAY,
      timeZone: TIME_ZONE,
    });

    expect(selected?.whoop_sleep_id).toBe("recent");
  });

  it("selects the open cycle for day strain", () => {
    const selected = selectCycleForToday({
      cycles: [
        {
          whoop_cycle_id: 1,
          start_at: "2026-08-10T02:00:00.000Z",
          end_at: "2026-08-10T14:00:00.000Z",
          score_state: "SCORED",
          strain: 10.1,
          avg_heart_rate: 70,
          max_heart_rate: 150,
          kilojoule: 8000,
        },
        {
          whoop_cycle_id: 2,
          start_at: "2026-08-11T02:00:00.000Z",
          end_at: null,
          score_state: "SCORED",
          strain: 4.2,
          avg_heart_rate: 68,
          max_heart_rate: 141,
          kilojoule: 3000,
        },
      ],
      todayDate: TODAY,
      timeZone: TIME_ZONE,
    });

    expect(selected?.whoop_cycle_id).toBe(2);
    expect(selected?.end_at).toBeNull();
  });

  it("filters workouts to the local day and excludes adjacent days", () => {
    const selected = selectWorkoutsForToday({
      workouts: [
        {
          sport_name: "running",
          start_at: "2026-08-11T14:00:00.000Z",
          end_at: "2026-08-11T15:00:00.000Z",
          score_state: "SCORED",
          strain: 8.1,
          avg_heart_rate: 130,
          max_heart_rate: 170,
        },
        {
          sport_name: "cycling",
          start_at: "2026-08-10T14:00:00.000Z",
          end_at: "2026-08-10T15:00:00.000Z",
          score_state: "SCORED",
          strain: 6.2,
          avg_heart_rate: 120,
          max_heart_rate: 160,
        },
        {
          sport_name: "walking",
          start_at: "2026-08-12T12:00:00.000Z",
          end_at: "2026-08-12T13:00:00.000Z",
          score_state: "SCORED",
          strain: 4.0,
          avg_heart_rate: 100,
          max_heart_rate: 130,
        },
      ],
      todayDate: TODAY,
      timeZone: TIME_ZONE,
    });

    expect(selected).toHaveLength(1);
    expect(selected[0]?.sport_name).toBe("running");
  });

  it("hides body snapshot when no useful measurements exist", () => {
    expect(
      selectBodySnapshot({
        weight_kilogram: null,
        max_heart_rate: null,
      }),
    ).toBeNull();

    expect(
      selectBodySnapshot({
        weight_kilogram: 90.7,
        max_heart_rate: null,
      }),
    ).toEqual({
      weight_kilogram: 90.7,
      max_heart_rate: null,
    });
  });
});
