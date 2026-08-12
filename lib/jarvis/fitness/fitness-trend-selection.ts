import {
  addDaysToLocalDate,
  getLocalDateFromIso,
} from "@/lib/jarvis/dashboard/command-center-utils";
import {
  selectCycleForToday,
  selectRecoveryForToday,
  selectSleepForToday,
  type FitnessCycleRecord,
  type FitnessRecoveryRecord,
  type FitnessSleepRecord,
} from "@/lib/jarvis/fitness/fitness-today-selection";

import type { FitnessTrendDay } from "@/lib/jarvis/fitness/fitness-today-types";

const MAX_TREND_DAYS = 7;

function formatTrendDateLabel(localDate: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function mapScoredRecovery(
  recovery: FitnessRecoveryRecord | null,
): number | null {
  if (!recovery || recovery.score_state !== "SCORED") {
    return null;
  }

  return recovery.recovery_score;
}

function mapScoredSleepPerformance(
  sleep: FitnessSleepRecord | null,
): number | null {
  if (!sleep || sleep.score_state !== "SCORED") {
    return null;
  }

  return sleep.sleep_performance_pct;
}

function mapScoredStrain(cycle: FitnessCycleRecord | null): number | null {
  if (!cycle || cycle.score_state !== "SCORED") {
    return null;
  }

  return cycle.strain;
}

export function buildFitnessTrendDays(params: {
  recoveries: FitnessRecoveryRecord[];
  sleeps: FitnessSleepRecord[];
  cycles: FitnessCycleRecord[];
  todayDate: string;
  timeZone: string;
  maxDays?: number;
}): FitnessTrendDay[] {
  const maxDays = Math.min(params.maxDays ?? MAX_TREND_DAYS, MAX_TREND_DAYS);
  const sleepsById = new Map(
    params.sleeps.map((sleep) => [sleep.whoop_sleep_id, sleep]),
  );
  const days: FitnessTrendDay[] = [];

  for (let offset = maxDays - 1; offset >= 0; offset -= 1) {
    const date = addDaysToLocalDate(params.todayDate, -offset);

    const recovery = selectRecoveryForToday({
      recoveries: params.recoveries,
      sleepsById,
      todayDate: date,
      timeZone: params.timeZone,
    });
    const sleep = selectSleepForToday({
      sleeps: params.sleeps,
      todayDate: date,
      timeZone: params.timeZone,
    });
    const cycle = selectCycleForToday({
      cycles: params.cycles,
      todayDate: date,
      timeZone: params.timeZone,
    });

    days.push({
      date,
      dateLabel: formatTrendDateLabel(date),
      recoveryScore: mapScoredRecovery(recovery),
      sleepPerformancePct: mapScoredSleepPerformance(sleep),
      strain: mapScoredStrain(cycle),
    });
  }

  return days;
}

export function countTrendPointsWithData(days: FitnessTrendDay[]): number {
  return days.filter(
    (day) =>
      day.recoveryScore != null ||
      day.sleepPerformancePct != null ||
      day.strain != null,
  ).length;
}

export function normalizeStrainForChart(strain: number): number {
  const maxStrain = 21;
  return Math.max(0, Math.min(100, (strain / maxStrain) * 100));
}

export { getLocalDateFromIso, MAX_TREND_DAYS };
