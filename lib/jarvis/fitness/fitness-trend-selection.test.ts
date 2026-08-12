import { describe, expect, it } from "vitest";

import {
  buildFitnessTrendDays,
  countTrendPointsWithData,
  MAX_TREND_DAYS,
  normalizeStrainForChart,
} from "@/lib/jarvis/fitness/fitness-trend-selection";
import type {
  FitnessCycleRecord,
  FitnessRecoveryRecord,
  FitnessSleepRecord,
} from "@/lib/jarvis/fitness/fitness-today-selection";

const TIME_ZONE = "America/Chicago";
const TODAY = "2026-08-11";

function sleepRecord(params: {
  id: string;
  endAt: string;
  performance?: number;
}): FitnessSleepRecord {
  return {
    whoop_sleep_id: params.id,
    end_at: params.endAt,
    is_nap: false,
    score_state: "SCORED",
    sleep_performance_pct: params.performance ?? 70,
    sleep_efficiency_pct: 95,
    sleep_consistency_pct: 80,
    total_sleep_ms: 6 * 60 * 60 * 1000,
    sleep_need_baseline_ms: 8 * 60 * 60 * 1000,
    respiratory_rate: 14,
  };
}

function recoveryRecord(params: {
  sleepId: string;
  score: number;
}): FitnessRecoveryRecord {
  return {
    whoop_sleep_id: params.sleepId,
    whoop_cycle_id: 1,
    score_state: "SCORED",
    recovery_score: params.score,
    resting_heart_rate: 55,
    hrv_rmssd_milli: 70,
    spo2_percentage: 96,
    skin_temp_celsius: 33,
    whoop_updated_at: "2026-08-11T12:00:00Z",
  };
}

function cycleRecord(params: {
  id: number;
  startAt: string;
  endAt: string | null;
  strain: number;
}): FitnessCycleRecord {
  return {
    whoop_cycle_id: params.id,
    start_at: params.startAt,
    end_at: params.endAt,
    score_state: "SCORED",
    strain: params.strain,
    avg_heart_rate: 70,
    max_heart_rate: 150,
    kilojoule: 4000,
  };
}

describe("buildFitnessTrendDays", () => {
  it("returns seven chronological days ending on today", () => {
    const days = buildFitnessTrendDays({
      recoveries: [],
      sleeps: [],
      cycles: [],
      todayDate: TODAY,
      timeZone: TIME_ZONE,
    });

    expect(days).toHaveLength(MAX_TREND_DAYS);
    expect(days[0]?.date).toBe("2026-08-05");
    expect(days[days.length - 1]?.date).toBe(TODAY);
  });

  it("does not fabricate missing metrics", () => {
    const days = buildFitnessTrendDays({
      recoveries: [],
      sleeps: [],
      cycles: [],
      todayDate: TODAY,
      timeZone: TIME_ZONE,
    });

    expect(days.every((day) => day.recoveryScore == null)).toBe(true);
    expect(days.every((day) => day.sleepPerformancePct == null)).toBe(true);
    expect(days.every((day) => day.strain == null)).toBe(true);
    expect(countTrendPointsWithData(days)).toBe(0);
  });

  it("maps scored metrics for days with matching records", () => {
    const days = buildFitnessTrendDays({
      recoveries: [
        recoveryRecord({ sleepId: "sleep-today", score: 72 }),
      ],
      sleeps: [
        sleepRecord({
          id: "sleep-today",
          endAt: "2026-08-11T12:00:00-05:00",
          performance: 81,
        }),
      ],
      cycles: [
        cycleRecord({
          id: 10,
          startAt: "2026-08-11T06:00:00-05:00",
          endAt: null,
          strain: 8.4,
        }),
      ],
      todayDate: TODAY,
      timeZone: TIME_ZONE,
    });

    const today = days[days.length - 1];

    expect(today?.recoveryScore).toBe(72);
    expect(today?.sleepPerformancePct).toBe(81);
    expect(today?.strain).toBe(8.4);
  });
});

describe("normalizeStrainForChart", () => {
  it("normalizes strain to a 0-100 chart scale", () => {
    expect(normalizeStrainForChart(10.5)).toBeCloseTo(50, 0);
    expect(normalizeStrainForChart(21)).toBe(100);
  });
});
