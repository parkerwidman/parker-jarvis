import { getLocalDateFromIso } from "@/lib/jarvis/dashboard/command-center-utils";

export type FitnessRecoveryRecord = {
  whoop_sleep_id: string;
  whoop_cycle_id: number | null;
  score_state: string | null;
  recovery_score: number | null;
  resting_heart_rate: number | null;
  hrv_rmssd_milli: number | null;
  spo2_percentage: number | null;
  skin_temp_celsius: number | null;
  whoop_updated_at: string | null;
  deleted_at?: string | null;
};

export type FitnessSleepRecord = {
  whoop_sleep_id: string;
  end_at: string | null;
  is_nap: boolean;
  score_state: string | null;
  sleep_performance_pct: number | null;
  sleep_efficiency_pct: number | null;
  sleep_consistency_pct: number | null;
  total_sleep_ms: number | null;
  sleep_need_baseline_ms: number | null;
  respiratory_rate: number | null;
  deleted_at?: string | null;
};

export type FitnessCycleRecord = {
  whoop_cycle_id: number;
  start_at: string | null;
  end_at: string | null;
  score_state: string | null;
  strain: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  kilojoule: number | null;
};

export type FitnessWorkoutRecord = {
  sport_name: string | null;
  start_at: string | null;
  end_at: string | null;
  score_state: string | null;
  strain: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  deleted_at?: string | null;
};

export type FitnessBodyRecord = {
  weight_kilogram: number | null;
  max_heart_rate: number | null;
};

function compareIsoDesc(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  const leftMs = left ? new Date(left).getTime() : 0;
  const rightMs = right ? new Date(right).getTime() : 0;

  return rightMs - leftMs;
}

function isActiveRecord(deletedAt: string | null | undefined): boolean {
  return deletedAt == null;
}

export function selectRecoveryForToday(params: {
  recoveries: FitnessRecoveryRecord[];
  sleepsById: Map<string, FitnessSleepRecord>;
  todayDate: string;
  timeZone: string;
}): FitnessRecoveryRecord | null {
  const activeRecoveries = params.recoveries.filter((recovery) =>
    isActiveRecord(recovery.deleted_at),
  );

  if (activeRecoveries.length === 0) {
    return null;
  }

  const ranked = activeRecoveries
    .map((recovery) => {
      const sleep = params.sleepsById.get(recovery.whoop_sleep_id);
      const sleepEndAt = sleep?.end_at ?? null;
      const sleepEndDate =
        sleepEndAt !== null
          ? getLocalDateFromIso(sleepEndAt, params.timeZone)
          : null;

      return {
        recovery,
        sleepEndAt,
        sleepEndDate,
        relevantToToday: sleepEndDate === params.todayDate,
      };
    })
    .sort((left, right) => {
      if (left.relevantToToday !== right.relevantToToday) {
        return left.relevantToToday ? -1 : 1;
      }

      return compareIsoDesc(left.sleepEndAt, right.sleepEndAt);
    });

  return ranked[0]?.recovery ?? null;
}

export function selectSleepForToday(params: {
  sleeps: FitnessSleepRecord[];
  todayDate: string;
  timeZone: string;
}): FitnessSleepRecord | null {
  const activeSleeps = params.sleeps.filter((sleep) =>
    isActiveRecord(sleep.deleted_at),
  );

  if (activeSleeps.length === 0) {
    return null;
  }

  const nonNapSleeps = activeSleeps.filter((sleep) => !sleep.is_nap);

  const overnightToday = nonNapSleeps
    .filter((sleep) => {
      if (!sleep.end_at) {
        return false;
      }

      return getLocalDateFromIso(sleep.end_at, params.timeZone) === params.todayDate;
    })
    .sort((left, right) => compareIsoDesc(left.end_at, right.end_at));

  if (overnightToday.length > 0) {
    return overnightToday[0] ?? null;
  }

  const latestNonNap = [...nonNapSleeps].sort((left, right) =>
    compareIsoDesc(left.end_at, right.end_at),
  );

  if (latestNonNap.length > 0) {
    return latestNonNap[0] ?? null;
  }

  const latestSleep = [...activeSleeps].sort((left, right) =>
    compareIsoDesc(left.end_at, right.end_at),
  );

  return latestSleep[0] ?? null;
}

export function selectCycleForToday(params: {
  cycles: FitnessCycleRecord[];
  todayDate: string;
  timeZone: string;
}): FitnessCycleRecord | null {
  if (params.cycles.length === 0) {
    return null;
  }

  const openCycles = params.cycles
    .filter((cycle) => cycle.end_at === null)
    .sort((left, right) => compareIsoDesc(left.start_at, right.start_at));

  if (openCycles.length > 0) {
    return openCycles[0] ?? null;
  }

  const startedToday = params.cycles
    .filter((cycle) => {
      if (!cycle.start_at) {
        return false;
      }

      return getLocalDateFromIso(cycle.start_at, params.timeZone) === params.todayDate;
    })
    .sort((left, right) => compareIsoDesc(left.start_at, right.start_at));

  if (startedToday.length > 0) {
    return startedToday[0] ?? null;
  }

  const latestCycle = [...params.cycles].sort((left, right) =>
    compareIsoDesc(left.start_at, right.start_at),
  );

  return latestCycle[0] ?? null;
}

export function selectWorkoutsForToday(params: {
  workouts: FitnessWorkoutRecord[];
  todayDate: string;
  timeZone: string;
}): FitnessWorkoutRecord[] {
  return params.workouts
    .filter((workout) => {
      if (!isActiveRecord(workout.deleted_at) || !workout.start_at) {
        return false;
      }

      return (
        getLocalDateFromIso(workout.start_at, params.timeZone) === params.todayDate
      );
    })
    .sort((left, right) => compareIsoDesc(left.start_at, right.start_at));
}

export function selectBodySnapshot(
  body: FitnessBodyRecord | null,
): FitnessBodyRecord | null {
  if (!body) {
    return null;
  }

  const hasWeight = body.weight_kilogram != null;
  const hasMaxHeartRate = body.max_heart_rate != null;

  if (!hasWeight && !hasMaxHeartRate) {
    return null;
  }

  return body;
}
