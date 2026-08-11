/** WHOOP developer API response shapes used by F3 sync (provider contract). */

export type WhoopScoreState = "SCORED" | "PENDING_SCORE" | "UNSCORABLE";

export type WhoopPaginatedResponse<T> = {
  records?: T[];
  next_token?: string | null;
};

export type WhoopCycleScore = {
  strain?: number;
  kilojoule?: number;
  average_heart_rate?: number;
  max_heart_rate?: number;
};

export type WhoopCycleRecord = {
  id: number;
  user_id: number;
  created_at?: string;
  updated_at?: string;
  start?: string;
  end?: string | null;
  timezone_offset?: string;
  score_state?: WhoopScoreState | string;
  score?: WhoopCycleScore | null;
};

export type WhoopRecoveryScore = {
  recovery_score?: number;
  resting_heart_rate?: number;
  hrv_rmssd_milli?: number;
  spo2_percentage?: number;
  skin_temp_celsius?: number;
  user_calibrating?: boolean;
};

export type WhoopRecoveryRecord = {
  cycle_id: number;
  sleep_id: string;
  user_id: number;
  created_at?: string;
  updated_at?: string;
  score_state?: WhoopScoreState | string;
  score?: WhoopRecoveryScore | null;
};

export type WhoopSleepStageSummary = {
  total_light_sleep_time_milli?: number;
  total_slow_wave_sleep_time_milli?: number;
  total_rem_sleep_time_milli?: number;
  total_awake_time_milli?: number;
  total_in_bed_time_milli?: number;
  sleep_cycle_count?: number;
  disturbance_count?: number;
};

export type WhoopSleepNeeded = {
  baseline_milli?: number;
  need_from_sleep_debt_milli?: number;
  need_from_recent_strain_milli?: number;
  need_from_recent_nap_milli?: number;
};

export type WhoopSleepScore = {
  stage_summary?: WhoopSleepStageSummary;
  sleep_needed?: WhoopSleepNeeded;
  respiratory_rate?: number;
  sleep_performance_percentage?: number;
  sleep_consistency_percentage?: number;
  sleep_efficiency_percentage?: number;
};

export type WhoopSleepRecord = {
  id: string;
  cycle_id?: number;
  user_id: number;
  created_at?: string;
  updated_at?: string;
  start?: string;
  end?: string;
  timezone_offset?: string;
  nap?: boolean;
  score_state?: WhoopScoreState | string;
  score?: WhoopSleepScore | null;
};

export type WhoopWorkoutScore = {
  strain?: number;
  average_heart_rate?: number;
  max_heart_rate?: number;
  kilojoule?: number;
  percent_recorded?: number;
  distance_meter?: number;
  altitude_gain_meter?: number;
  altitude_change_meter?: number;
  zone_durations?: Record<string, number>;
};

export type WhoopWorkoutRecord = {
  id: string;
  user_id: number;
  sport_id?: number;
  sport_name?: string;
  created_at?: string;
  updated_at?: string;
  start?: string;
  end?: string;
  timezone_offset?: string;
  score_state?: WhoopScoreState | string;
  score?: WhoopWorkoutScore | null;
};

export type WhoopBodyMeasurementRecord = {
  height_meter?: number;
  weight_kilogram?: number;
  max_heart_rate?: number;
};
