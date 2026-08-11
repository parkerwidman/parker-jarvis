export type WhoopConnectionStatus =
  | "connected"
  | "disconnected"
  | "reconnect_required"
  | "error";

export type WhoopWebhookEventStatus = "pending" | "processed" | "failed";

/** Safe connection metadata readable by authenticated users via RLS SELECT. */
export type WhoopConnectionRow = {
  id: string;
  user_id: string;
  whoop_user_id: number | null;
  status: WhoopConnectionStatus;
  granted_scopes: string[];
  access_token_expires_at: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  last_successful_sync_at: string | null;
  last_webhook_at: string | null;
  last_error_code: string | null;
  sync_in_progress_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Server-only credential storage. Never expose to client-facing types or SELECT grants. */
export type WhoopConnectionCredentialsRow = {
  connection_id: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  encryption_version: number;
  created_at: string;
  updated_at: string;
};

export type WhoopCycleRow = {
  id: string;
  user_id: string;
  whoop_cycle_id: number;
  start_at: string | null;
  end_at: string | null;
  timezone_offset: string | null;
  score_state: string | null;
  strain: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  kilojoule: number | null;
  whoop_updated_at: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type WhoopSleepRow = {
  id: string;
  user_id: string;
  whoop_sleep_id: string;
  whoop_cycle_id: number | null;
  start_at: string | null;
  end_at: string | null;
  timezone_offset: string | null;
  is_nap: boolean;
  score_state: string | null;
  sleep_performance_pct: number | null;
  sleep_efficiency_pct: number | null;
  sleep_consistency_pct: number | null;
  total_sleep_ms: number | null;
  sleep_need_baseline_ms: number | null;
  respiratory_rate: number | null;
  whoop_updated_at: string | null;
  deleted_at: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type WhoopRecoveryRow = {
  id: string;
  user_id: string;
  whoop_sleep_id: string;
  whoop_cycle_id: number | null;
  score_state: string | null;
  recovery_score: number | null;
  resting_heart_rate: number | null;
  hrv_rmssd_milli: number | null;
  spo2_percentage: number | null;
  skin_temp_celsius: number | null;
  user_calibrating: boolean | null;
  whoop_updated_at: string | null;
  deleted_at: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type WhoopWorkoutRow = {
  id: string;
  user_id: string;
  whoop_workout_id: string;
  sport_name: string | null;
  start_at: string | null;
  end_at: string | null;
  timezone_offset: string | null;
  score_state: string | null;
  strain: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  kilojoule: number | null;
  distance_meter: number | null;
  whoop_updated_at: string | null;
  deleted_at: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type WhoopBodyMeasurementRow = {
  user_id: string;
  height_meter: number | null;
  weight_kilogram: number | null;
  max_heart_rate: number | null;
  synced_at: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

/** Server-only webhook dedup ledger. */
export type WhoopWebhookEventRow = {
  id: string;
  trace_id: string;
  user_id: string | null;
  event_type: string;
  resource_id: string;
  received_at: string;
  processed_at: string | null;
  status: WhoopWebhookEventStatus;
  error_code: string | null;
  created_at: string;
  updated_at: string;
};

export type WhoopSafeConnectionSummary = {
  id: string;
  connected: boolean;
  status: WhoopConnectionStatus;
  whoopUserId: number | null;
  connectedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastWebhookAt: string | null;
  reconnectRequired: boolean;
  lastErrorCode: string | null;
  syncInProgress: boolean;
};
