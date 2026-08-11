-- WHOOP Fitness F1: connection metadata, server-only credentials, metric tables, webhook dedup.

CREATE TABLE public.whoop_connections (
  id                        uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id                   uuid                     NOT NULL,
  whoop_user_id             bigint,
  status                    text                     NOT NULL,
  granted_scopes            text[]                   DEFAULT ARRAY[]::text[] NOT NULL,
  access_token_expires_at   timestamp with time zone,
  connected_at              timestamp with time zone,
  disconnected_at           timestamp with time zone,
  last_successful_sync_at   timestamp with time zone,
  last_webhook_at           timestamp with time zone,
  last_error_code           text,
  sync_in_progress_at       timestamp with time zone,
  created_at                timestamp with time zone DEFAULT now() NOT NULL,
  updated_at                timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.whoop_connections
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.whoop_connections
  ADD CONSTRAINT whoop_connections_pkey PRIMARY KEY (id);

ALTER TABLE public.whoop_connections
  ADD CONSTRAINT whoop_connections_user_id_key UNIQUE (user_id);

ALTER TABLE public.whoop_connections
  ADD CONSTRAINT whoop_connections_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.whoop_connections
  ADD CONSTRAINT whoop_connections_status_check
    CHECK (status IN ('connected', 'disconnected', 'reconnect_required', 'error'));

CREATE INDEX whoop_connections_user_id_idx
  ON public.whoop_connections (user_id);

CREATE INDEX whoop_connections_whoop_user_id_idx
  ON public.whoop_connections (whoop_user_id)
  WHERE whoop_user_id IS NOT NULL;

CREATE INDEX whoop_connections_status_idx
  ON public.whoop_connections (status);

REVOKE ALL ON TABLE public.whoop_connections FROM anon;
GRANT SELECT ON TABLE public.whoop_connections TO authenticated;

CREATE TRIGGER set_whoop_connections_updated_at
  BEFORE UPDATE ON public.whoop_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users read their own WHOOP connection" ON public.whoop_connections
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.whoop_connection_credentials (
  connection_id             uuid                     NOT NULL,
  encrypted_access_token    text                     NOT NULL,
  encrypted_refresh_token   text                     NOT NULL,
  encryption_version        smallint                 DEFAULT 1 NOT NULL,
  created_at                timestamp with time zone DEFAULT now() NOT NULL,
  updated_at                timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.whoop_connection_credentials
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.whoop_connection_credentials
  ADD CONSTRAINT whoop_connection_credentials_pkey PRIMARY KEY (connection_id);

ALTER TABLE public.whoop_connection_credentials
  ADD CONSTRAINT whoop_connection_credentials_connection_id_fkey
    FOREIGN KEY (connection_id) REFERENCES public.whoop_connections(id) ON DELETE CASCADE;

ALTER TABLE public.whoop_connection_credentials
  ADD CONSTRAINT whoop_connection_credentials_encryption_version_check
    CHECK (encryption_version >= 1);

REVOKE ALL ON TABLE public.whoop_connection_credentials FROM anon;
REVOKE ALL ON TABLE public.whoop_connection_credentials FROM authenticated;

CREATE TRIGGER set_whoop_connection_credentials_updated_at
  BEFORE UPDATE ON public.whoop_connection_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.whoop_cycles (
  id                        uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id                   uuid                     NOT NULL,
  whoop_cycle_id            bigint                   NOT NULL,
  start_at                  timestamp with time zone,
  end_at                    timestamp with time zone,
  timezone_offset           text,
  score_state               text,
  strain                    double precision,
  avg_heart_rate            integer,
  max_heart_rate            integer,
  kilojoule                 double precision,
  whoop_updated_at          timestamp with time zone,
  raw_payload               jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  created_at                timestamp with time zone DEFAULT now() NOT NULL,
  updated_at                timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.whoop_cycles
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.whoop_cycles
  ADD CONSTRAINT whoop_cycles_pkey PRIMARY KEY (id);

ALTER TABLE public.whoop_cycles
  ADD CONSTRAINT whoop_cycles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.whoop_cycles
  ADD CONSTRAINT whoop_cycles_user_id_whoop_cycle_id_key
    UNIQUE (user_id, whoop_cycle_id);

CREATE INDEX whoop_cycles_user_id_start_at_idx
  ON public.whoop_cycles (user_id, start_at DESC);

REVOKE ALL ON TABLE public.whoop_cycles FROM anon;
GRANT SELECT ON TABLE public.whoop_cycles TO authenticated;

CREATE TRIGGER set_whoop_cycles_updated_at
  BEFORE UPDATE ON public.whoop_cycles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users read their own WHOOP cycles" ON public.whoop_cycles
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.whoop_sleeps (
  id                        uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id                   uuid                     NOT NULL,
  whoop_sleep_id            uuid                     NOT NULL,
  whoop_cycle_id            bigint,
  start_at                  timestamp with time zone,
  end_at                    timestamp with time zone,
  timezone_offset           text,
  is_nap                    boolean                  DEFAULT false NOT NULL,
  score_state               text,
  sleep_performance_pct     double precision,
  sleep_efficiency_pct      double precision,
  sleep_consistency_pct     double precision,
  total_sleep_ms            bigint,
  sleep_need_baseline_ms    bigint,
  respiratory_rate          double precision,
  whoop_updated_at          timestamp with time zone,
  deleted_at                timestamp with time zone,
  raw_payload               jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  created_at                timestamp with time zone DEFAULT now() NOT NULL,
  updated_at                timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.whoop_sleeps
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.whoop_sleeps
  ADD CONSTRAINT whoop_sleeps_pkey PRIMARY KEY (id);

ALTER TABLE public.whoop_sleeps
  ADD CONSTRAINT whoop_sleeps_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.whoop_sleeps
  ADD CONSTRAINT whoop_sleeps_user_id_whoop_sleep_id_key
    UNIQUE (user_id, whoop_sleep_id);

CREATE INDEX whoop_sleeps_user_id_start_at_idx
  ON public.whoop_sleeps (user_id, start_at DESC);

REVOKE ALL ON TABLE public.whoop_sleeps FROM anon;
GRANT SELECT ON TABLE public.whoop_sleeps TO authenticated;

CREATE TRIGGER set_whoop_sleeps_updated_at
  BEFORE UPDATE ON public.whoop_sleeps
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users read their own WHOOP sleeps" ON public.whoop_sleeps
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.whoop_recoveries (
  id                        uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id                   uuid                     NOT NULL,
  whoop_sleep_id            uuid                     NOT NULL,
  whoop_cycle_id            bigint,
  score_state               text,
  recovery_score            double precision,
  resting_heart_rate        double precision,
  hrv_rmssd_milli           double precision,
  spo2_percentage           double precision,
  skin_temp_celsius         double precision,
  user_calibrating          boolean,
  whoop_updated_at          timestamp with time zone,
  deleted_at                timestamp with time zone,
  raw_payload               jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  created_at                timestamp with time zone DEFAULT now() NOT NULL,
  updated_at                timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.whoop_recoveries
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.whoop_recoveries
  ADD CONSTRAINT whoop_recoveries_pkey PRIMARY KEY (id);

ALTER TABLE public.whoop_recoveries
  ADD CONSTRAINT whoop_recoveries_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.whoop_recoveries
  ADD CONSTRAINT whoop_recoveries_user_id_whoop_sleep_id_key
    UNIQUE (user_id, whoop_sleep_id);

CREATE INDEX whoop_recoveries_user_id_whoop_updated_at_idx
  ON public.whoop_recoveries (user_id, whoop_updated_at DESC);

REVOKE ALL ON TABLE public.whoop_recoveries FROM anon;
GRANT SELECT ON TABLE public.whoop_recoveries TO authenticated;

CREATE TRIGGER set_whoop_recoveries_updated_at
  BEFORE UPDATE ON public.whoop_recoveries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users read their own WHOOP recoveries" ON public.whoop_recoveries
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.whoop_workouts (
  id                        uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id                   uuid                     NOT NULL,
  whoop_workout_id          uuid                     NOT NULL,
  sport_name                text,
  start_at                  timestamp with time zone,
  end_at                    timestamp with time zone,
  timezone_offset           text,
  score_state               text,
  strain                    double precision,
  avg_heart_rate            integer,
  max_heart_rate            integer,
  kilojoule                 double precision,
  distance_meter            double precision,
  whoop_updated_at          timestamp with time zone,
  deleted_at                timestamp with time zone,
  raw_payload               jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  created_at                timestamp with time zone DEFAULT now() NOT NULL,
  updated_at                timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.whoop_workouts
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.whoop_workouts
  ADD CONSTRAINT whoop_workouts_pkey PRIMARY KEY (id);

ALTER TABLE public.whoop_workouts
  ADD CONSTRAINT whoop_workouts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.whoop_workouts
  ADD CONSTRAINT whoop_workouts_user_id_whoop_workout_id_key
    UNIQUE (user_id, whoop_workout_id);

CREATE INDEX whoop_workouts_user_id_start_at_idx
  ON public.whoop_workouts (user_id, start_at DESC);

REVOKE ALL ON TABLE public.whoop_workouts FROM anon;
GRANT SELECT ON TABLE public.whoop_workouts TO authenticated;

CREATE TRIGGER set_whoop_workouts_updated_at
  BEFORE UPDATE ON public.whoop_workouts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users read their own WHOOP workouts" ON public.whoop_workouts
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.whoop_body_measurements (
  user_id                   uuid                     NOT NULL,
  height_meter              double precision,
  weight_kilogram           double precision,
  max_heart_rate            integer,
  synced_at                 timestamp with time zone,
  raw_payload               jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  created_at                timestamp with time zone DEFAULT now() NOT NULL,
  updated_at                timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.whoop_body_measurements
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.whoop_body_measurements
  ADD CONSTRAINT whoop_body_measurements_pkey PRIMARY KEY (user_id);

ALTER TABLE public.whoop_body_measurements
  ADD CONSTRAINT whoop_body_measurements_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

REVOKE ALL ON TABLE public.whoop_body_measurements FROM anon;
GRANT SELECT ON TABLE public.whoop_body_measurements TO authenticated;

CREATE TRIGGER set_whoop_body_measurements_updated_at
  BEFORE UPDATE ON public.whoop_body_measurements
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users read their own WHOOP body measurements" ON public.whoop_body_measurements
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.whoop_webhook_events (
  id                        uuid                     DEFAULT gen_random_uuid() NOT NULL,
  trace_id                  text                     NOT NULL,
  user_id                   uuid,
  event_type                text                     NOT NULL,
  resource_id               text                     NOT NULL,
  received_at               timestamp with time zone DEFAULT now() NOT NULL,
  processed_at              timestamp with time zone,
  status                    text                     NOT NULL,
  error_code                text,
  created_at                timestamp with time zone DEFAULT now() NOT NULL,
  updated_at                timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.whoop_webhook_events
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.whoop_webhook_events
  ADD CONSTRAINT whoop_webhook_events_pkey PRIMARY KEY (id);

ALTER TABLE public.whoop_webhook_events
  ADD CONSTRAINT whoop_webhook_events_trace_id_key UNIQUE (trace_id);

ALTER TABLE public.whoop_webhook_events
  ADD CONSTRAINT whoop_webhook_events_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.whoop_webhook_events
  ADD CONSTRAINT whoop_webhook_events_status_check
    CHECK (status IN ('pending', 'processed', 'failed'));

CREATE INDEX whoop_webhook_events_status_received_at_idx
  ON public.whoop_webhook_events (status, received_at DESC);

REVOKE ALL ON TABLE public.whoop_webhook_events FROM anon;
REVOKE ALL ON TABLE public.whoop_webhook_events FROM authenticated;

CREATE TRIGGER set_whoop_webhook_events_updated_at
  BEFORE UPDATE ON public.whoop_webhook_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.whoop_connections,
  public.whoop_connection_credentials,
  public.whoop_cycles,
  public.whoop_sleeps,
  public.whoop_recoveries,
  public.whoop_workouts,
  public.whoop_body_measurements,
  public.whoop_webhook_events
TO service_role;
