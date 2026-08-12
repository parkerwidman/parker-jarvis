import "server-only";

import {
  formatLocalDateLabel,
  formatTime,
  getLocalDateString,
  resolveTimeZone,
} from "@/lib/jarvis/dashboard/command-center-utils";
import {
  formatDurationBetween,
  formatLocalTimestamp,
  formatSleepDuration,
  formatSyncFreshness,
  getRecoveryStatus,
  kilogramsToPounds,
  kilojoulesToKilocalories,
} from "@/lib/jarvis/fitness/fitness-display-utils";
import { buildFitnessTrendDays } from "@/lib/jarvis/fitness/fitness-trend-selection";
import { loadFitnessGlance } from "@/lib/jarvis/fitness/load-fitness-glance";
import {
  selectBodySnapshot,
  selectCycleForToday,
  selectRecoveryForToday,
  selectSleepForToday,
  selectWorkoutsForToday,
  type FitnessBodyRecord,
  type FitnessCycleRecord,
  type FitnessRecoveryRecord,
  type FitnessSleepRecord,
  type FitnessWorkoutRecord,
} from "@/lib/jarvis/fitness/fitness-today-selection";
import type {
  FitnessBodySnapshot,
  FitnessConnectionSnapshot,
  FitnessCycleSnapshot,
  FitnessRecoverySnapshot,
  FitnessSleepSnapshot,
  FitnessTodaySnapshot,
  FitnessWorkoutSnapshot,
} from "@/lib/jarvis/fitness/fitness-today-types";
import type { SupabaseClient } from "@supabase/supabase-js";

const CYCLE_COLUMNS =
  "whoop_cycle_id, start_at, end_at, score_state, strain, avg_heart_rate, max_heart_rate, kilojoule";
const RECOVERY_COLUMNS =
  "whoop_sleep_id, whoop_cycle_id, score_state, recovery_score, resting_heart_rate, hrv_rmssd_milli, spo2_percentage, skin_temp_celsius, whoop_updated_at, deleted_at";
const SLEEP_COLUMNS =
  "whoop_sleep_id, end_at, is_nap, score_state, sleep_performance_pct, sleep_efficiency_pct, sleep_consistency_pct, total_sleep_ms, sleep_need_baseline_ms, respiratory_rate, deleted_at";
const WORKOUT_COLUMNS =
  "sport_name, start_at, end_at, score_state, strain, avg_heart_rate, max_heart_rate, deleted_at";
const BODY_COLUMNS = "weight_kilogram, max_heart_rate";

function mapScoreDisplayState(
  scoreState: string | null,
): "scored" | "pending" | "unscorable" | "none" {
  if (scoreState === "SCORED") {
    return "scored";
  }

  if (scoreState === "PENDING_SCORE") {
    return "pending";
  }

  if (scoreState === "UNSCORABLE") {
    return "unscorable";
  }

  return "none";
}

function mapRecoverySnapshot(
  recovery: FitnessRecoveryRecord | null,
): FitnessRecoverySnapshot | null {
  if (!recovery) {
    return null;
  }

  const displayState = mapScoreDisplayState(recovery.score_state);

  if (displayState === "scored" && recovery.recovery_score != null) {
    const status = getRecoveryStatus(recovery.recovery_score);

    return {
      displayState,
      scoreState: recovery.score_state,
      score: recovery.recovery_score,
      statusLabel: status.label,
      statusLevel: status.level,
      hrvMilli: recovery.hrv_rmssd_milli,
      restingHeartRate: recovery.resting_heart_rate,
      spo2: recovery.spo2_percentage,
      skinTempCelsius: recovery.skin_temp_celsius,
    };
  }

  if (displayState === "pending") {
    return {
      displayState,
      scoreState: recovery.score_state,
      score: null,
      statusLabel: null,
      statusLevel: null,
      hrvMilli: null,
      restingHeartRate: null,
      spo2: null,
      skinTempCelsius: null,
    };
  }

  if (displayState === "unscorable") {
    return {
      displayState,
      scoreState: recovery.score_state,
      score: null,
      statusLabel: null,
      statusLevel: null,
      hrvMilli: null,
      restingHeartRate: null,
      spo2: null,
      skinTempCelsius: null,
    };
  }

  return null;
}

function mapSleepSnapshot(sleep: FitnessSleepRecord | null): FitnessSleepSnapshot | null {
  if (!sleep) {
    return null;
  }

  const displayState = mapScoreDisplayState(sleep.score_state);

  return {
    displayState,
    scoreState: sleep.score_state,
    performancePct:
      displayState === "scored" ? sleep.sleep_performance_pct : null,
    totalSleepMs: displayState === "scored" ? sleep.total_sleep_ms : null,
    totalSleepLabel:
      displayState === "scored" && sleep.total_sleep_ms != null
        ? formatSleepDuration(sleep.total_sleep_ms)
        : null,
    efficiencyPct: displayState === "scored" ? sleep.sleep_efficiency_pct : null,
    consistencyPct:
      displayState === "scored" ? sleep.sleep_consistency_pct : null,
    respiratoryRate: displayState === "scored" ? sleep.respiratory_rate : null,
    sleepNeedBaselineMs:
      displayState === "scored" ? sleep.sleep_need_baseline_ms : null,
    isNap: sleep.is_nap,
  };
}

function mapCycleSnapshot(
  cycle: FitnessCycleRecord | null,
): FitnessCycleSnapshot | null {
  if (!cycle) {
    return null;
  }

  const displayState = mapScoreDisplayState(cycle.score_state);

  return {
    displayState,
    scoreState: cycle.score_state,
    strain: displayState === "scored" ? cycle.strain : null,
    averageHeartRate: displayState === "scored" ? cycle.avg_heart_rate : null,
    maxHeartRate: displayState === "scored" ? cycle.max_heart_rate : null,
    kilojoule: displayState === "scored" ? cycle.kilojoule : null,
    kilocalories:
      displayState === "scored" && cycle.kilojoule != null
        ? kilojoulesToKilocalories(cycle.kilojoule)
        : null,
    isCurrent: cycle.end_at === null,
  };
}

function mapWorkoutSnapshots(
  workouts: FitnessWorkoutRecord[],
  timeZone: string,
): FitnessWorkoutSnapshot[] {
  return workouts.map((workout) => ({
    sportName: workout.sport_name?.trim() || "Workout",
    startAt: workout.start_at ?? "",
    startTimeLabel: workout.start_at
      ? formatTime(workout.start_at, timeZone)
      : "Time unavailable",
    durationLabel:
      workout.start_at && workout.end_at
        ? formatDurationBetween(workout.start_at, workout.end_at)
        : null,
    strain: workout.score_state === "SCORED" ? workout.strain : null,
    averageHeartRate:
      workout.score_state === "SCORED" ? workout.avg_heart_rate : null,
    maxHeartRate: workout.score_state === "SCORED" ? workout.max_heart_rate : null,
    scoreState: workout.score_state,
  }));
}

function mapBodySnapshot(body: FitnessBodyRecord | null): FitnessBodySnapshot | null {
  const selected = selectBodySnapshot(body);

  if (!selected) {
    return null;
  }

  return {
    weightKilograms: selected.weight_kilogram,
    weightPounds:
      selected.weight_kilogram != null
        ? kilogramsToPounds(selected.weight_kilogram)
        : null,
    maxHeartRate: selected.max_heart_rate,
  };
}

function mapConnectionSnapshot(
  connection: {
    status: string;
    last_successful_sync_at: string | null;
    sync_in_progress_at: string | null;
  } | null,
): FitnessConnectionSnapshot {
  const connected = connection?.status === "connected";

  return {
    status: connection?.status ?? "disconnected",
    connected,
    lastSuccessfulSyncAt: connection?.last_successful_sync_at ?? null,
    syncInProgress: Boolean(connection?.sync_in_progress_at),
  };
}

export async function loadFitnessTodaySnapshot(
  supabase: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<FitnessTodaySnapshot> {
  const [
    profileResult,
    connectionResult,
    cyclesResult,
    recoveriesResult,
    sleepsResult,
    workoutsResult,
    bodyResult,
  ] = await Promise.all([
    supabase
      .from("jarvis_profiles")
      .select("timezone, preferred_name")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("whoop_connections")
      .select("status, last_successful_sync_at, sync_in_progress_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("whoop_cycles")
      .select(CYCLE_COLUMNS)
      .eq("user_id", userId)
      .order("start_at", { ascending: false }),
    supabase
      .from("whoop_recoveries")
      .select(RECOVERY_COLUMNS)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("whoop_updated_at", { ascending: false }),
    supabase
      .from("whoop_sleeps")
      .select(SLEEP_COLUMNS)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("end_at", { ascending: false }),
    supabase
      .from("whoop_workouts")
      .select(WORKOUT_COLUMNS)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("start_at", { ascending: false }),
    supabase
      .from("whoop_body_measurements")
      .select(BODY_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const timeZone = resolveTimeZone(profileResult.data?.timezone);
  const todayDate = getLocalDateString(timeZone, now);
  const connection = mapConnectionSnapshot(connectionResult.data);

  const cycles = (cyclesResult.data ?? []) as FitnessCycleRecord[];
  const recoveries = (recoveriesResult.data ?? []) as FitnessRecoveryRecord[];
  const sleeps = (sleepsResult.data ?? []) as FitnessSleepRecord[];
  const workouts = (workoutsResult.data ?? []) as FitnessWorkoutRecord[];
  const body = (bodyResult.data ?? null) as FitnessBodyRecord | null;

  const sleepsById = new Map(
    sleeps.map((sleep) => [sleep.whoop_sleep_id, sleep]),
  );

  const selectedRecovery = selectRecoveryForToday({
    recoveries,
    sleepsById,
    todayDate,
    timeZone,
  });
  const selectedSleep = selectSleepForToday({
    sleeps,
    todayDate,
    timeZone,
  });
  const selectedCycle = selectCycleForToday({
    cycles,
    todayDate,
    timeZone,
  });
  const selectedWorkouts = selectWorkoutsForToday({
    workouts,
    todayDate,
    timeZone,
  });

  const trends = buildFitnessTrendDays({
    recoveries,
    sleeps,
    cycles,
    todayDate,
    timeZone,
  });

  const glance = await loadFitnessGlance(supabase, userId, timeZone, todayDate);
  const displayName =
    profileResult.data?.preferred_name?.trim() || "Parker";

  return {
    timeZone,
    todayDate,
    todayLabel: formatLocalDateLabel(timeZone, now),
    connection,
    recovery: mapRecoverySnapshot(selectedRecovery),
    sleep: mapSleepSnapshot(selectedSleep),
    cycle: mapCycleSnapshot(selectedCycle),
    workouts: mapWorkoutSnapshots(selectedWorkouts, timeZone),
    body: mapBodySnapshot(body),
    syncFreshnessLabel: formatSyncFreshness(
      connection.lastSuccessfulSyncAt,
      timeZone,
      now,
    ),
    lastSyncedLabel: formatLocalTimestamp(
      connection.lastSuccessfulSyncAt,
      timeZone,
    ),
    trends,
    glance,
    displayName,
  };
}
