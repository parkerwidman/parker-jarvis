import "server-only";

import type {
  WhoopBodyMeasurementRecord,
  WhoopCycleRecord,
  WhoopRecoveryRecord,
  WhoopSleepRecord,
  WhoopWorkoutRecord,
} from "@/lib/jarvis/integrations/whoop/whoop-api-types";
import {
  WHOOP_SYNC_ERROR_CODES,
  WhoopSyncError,
} from "@/lib/jarvis/integrations/whoop/whoop-sync-errors";
import type {
  WhoopBodyMeasurementRow,
  WhoopCycleRow,
  WhoopRecoveryRow,
  WhoopSleepRow,
  WhoopWorkoutRow,
} from "@/lib/jarvis/integrations/whoop/whoop-types";

type WhoopMetricInsert<T> = Omit<T, "id" | "created_at" | "updated_at">;

function isWhoopScored(scoreState: string | undefined): boolean {
  return scoreState === "SCORED";
}

export function assertWhoopRecordUserId(
  recordUserId: number,
  expectedWhoopUserId: number,
): void {
  if (recordUserId !== expectedWhoopUserId) {
    throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.userMismatch);
  }
}

export function deriveWhoopTotalSleepMs(
  stageSummary:
    | {
        total_light_sleep_time_milli?: number;
        total_slow_wave_sleep_time_milli?: number;
        total_rem_sleep_time_milli?: number;
      }
    | undefined,
): number | null {
  if (!stageSummary) {
    return null;
  }

  const light = stageSummary.total_light_sleep_time_milli ?? 0;
  const slowWave = stageSummary.total_slow_wave_sleep_time_milli ?? 0;
  const rem = stageSummary.total_rem_sleep_time_milli ?? 0;

  if (light <= 0 && slowWave <= 0 && rem <= 0) {
    return null;
  }

  return light + slowWave + rem;
}

export function mapWhoopCycleRecord(params: {
  userId: string;
  expectedWhoopUserId: number;
  record: WhoopCycleRecord;
}): WhoopMetricInsert<WhoopCycleRow> {
  assertWhoopRecordUserId(params.record.user_id, params.expectedWhoopUserId);

  const scored = isWhoopScored(params.record.score_state);

  return {
    user_id: params.userId,
    whoop_cycle_id: params.record.id,
    start_at: params.record.start ?? null,
    end_at: params.record.end ?? null,
    timezone_offset: params.record.timezone_offset ?? null,
    score_state: params.record.score_state ?? null,
    strain: scored ? (params.record.score?.strain ?? null) : null,
    avg_heart_rate: scored
      ? (params.record.score?.average_heart_rate ?? null)
      : null,
    max_heart_rate: scored ? (params.record.score?.max_heart_rate ?? null) : null,
    kilojoule: scored ? (params.record.score?.kilojoule ?? null) : null,
    whoop_updated_at: params.record.updated_at ?? null,
    raw_payload: params.record as Record<string, unknown>,
  };
}

export function mapWhoopRecoveryRecord(params: {
  userId: string;
  expectedWhoopUserId: number;
  record: WhoopRecoveryRecord;
}): WhoopMetricInsert<WhoopRecoveryRow> {
  assertWhoopRecordUserId(params.record.user_id, params.expectedWhoopUserId);

  const scored = isWhoopScored(params.record.score_state);

  return {
    user_id: params.userId,
    whoop_sleep_id: params.record.sleep_id,
    whoop_cycle_id: params.record.cycle_id ?? null,
    score_state: params.record.score_state ?? null,
    recovery_score: scored ? (params.record.score?.recovery_score ?? null) : null,
    resting_heart_rate: scored
      ? (params.record.score?.resting_heart_rate ?? null)
      : null,
    hrv_rmssd_milli: scored
      ? (params.record.score?.hrv_rmssd_milli ?? null)
      : null,
    spo2_percentage: scored
      ? (params.record.score?.spo2_percentage ?? null)
      : null,
    skin_temp_celsius: scored
      ? (params.record.score?.skin_temp_celsius ?? null)
      : null,
    user_calibrating: scored
      ? (params.record.score?.user_calibrating ?? null)
      : null,
    whoop_updated_at: params.record.updated_at ?? null,
    deleted_at: null,
    raw_payload: params.record as Record<string, unknown>,
  };
}

export function mapWhoopSleepRecord(params: {
  userId: string;
  expectedWhoopUserId: number;
  record: WhoopSleepRecord;
}): WhoopMetricInsert<WhoopSleepRow> {
  assertWhoopRecordUserId(params.record.user_id, params.expectedWhoopUserId);

  const scored = isWhoopScored(params.record.score_state);
  const stageSummary = params.record.score?.stage_summary;

  return {
    user_id: params.userId,
    whoop_sleep_id: params.record.id,
    whoop_cycle_id: params.record.cycle_id ?? null,
    start_at: params.record.start ?? null,
    end_at: params.record.end ?? null,
    timezone_offset: params.record.timezone_offset ?? null,
    is_nap: params.record.nap === true,
    score_state: params.record.score_state ?? null,
    sleep_performance_pct: scored
      ? (params.record.score?.sleep_performance_percentage ?? null)
      : null,
    sleep_efficiency_pct: scored
      ? (params.record.score?.sleep_efficiency_percentage ?? null)
      : null,
    sleep_consistency_pct: scored
      ? (params.record.score?.sleep_consistency_percentage ?? null)
      : null,
    total_sleep_ms: scored ? deriveWhoopTotalSleepMs(stageSummary) : null,
    sleep_need_baseline_ms: scored
      ? (params.record.score?.sleep_needed?.baseline_milli ?? null)
      : null,
    respiratory_rate: scored
      ? (params.record.score?.respiratory_rate ?? null)
      : null,
    whoop_updated_at: params.record.updated_at ?? null,
    deleted_at: null,
    raw_payload: params.record as Record<string, unknown>,
  };
}

export function mapWhoopWorkoutRecord(params: {
  userId: string;
  expectedWhoopUserId: number;
  record: WhoopWorkoutRecord;
}): WhoopMetricInsert<WhoopWorkoutRow> {
  assertWhoopRecordUserId(params.record.user_id, params.expectedWhoopUserId);

  const scored = isWhoopScored(params.record.score_state);

  return {
    user_id: params.userId,
    whoop_workout_id: params.record.id,
    sport_name: params.record.sport_name ?? null,
    start_at: params.record.start ?? null,
    end_at: params.record.end ?? null,
    timezone_offset: params.record.timezone_offset ?? null,
    score_state: params.record.score_state ?? null,
    strain: scored ? (params.record.score?.strain ?? null) : null,
    avg_heart_rate: scored
      ? (params.record.score?.average_heart_rate ?? null)
      : null,
    max_heart_rate: scored ? (params.record.score?.max_heart_rate ?? null) : null,
    kilojoule: scored ? (params.record.score?.kilojoule ?? null) : null,
    distance_meter: scored ? (params.record.score?.distance_meter ?? null) : null,
    whoop_updated_at: params.record.updated_at ?? null,
    deleted_at: null,
    raw_payload: params.record as Record<string, unknown>,
  };
}

export function mapWhoopBodyMeasurementRecord(params: {
  userId: string;
  record: WhoopBodyMeasurementRecord;
  syncedAt: string;
}): WhoopMetricInsert<WhoopBodyMeasurementRow> {
  return {
    user_id: params.userId,
    height_meter: params.record.height_meter ?? null,
    weight_kilogram: params.record.weight_kilogram ?? null,
    max_heart_rate:
      typeof params.record.max_heart_rate === "number"
        ? params.record.max_heart_rate
        : null,
    synced_at: params.syncedAt,
    raw_payload: params.record as Record<string, unknown>,
  };
}

function assertOptionalNumberField(
  value: unknown,
  fieldName: keyof WhoopBodyMeasurementRecord,
): void {
  if (value === undefined || value === null) {
    return;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.invalidPayload);
  }

  if (fieldName === "max_heart_rate" && !Number.isInteger(value)) {
    throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.invalidPayload);
  }
}

export function parseWhoopBodyMeasurementRecord(
  payload: unknown,
): WhoopBodyMeasurementRecord {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new WhoopSyncError(WHOOP_SYNC_ERROR_CODES.invalidPayload);
  }

  const record = payload as WhoopBodyMeasurementRecord;

  assertOptionalNumberField(record.height_meter, "height_meter");
  assertOptionalNumberField(record.weight_kilogram, "weight_kilogram");
  assertOptionalNumberField(record.max_heart_rate, "max_heart_rate");

  return record;
}
