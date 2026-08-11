-- Local validation for WHOOP Fitness F3 sync claim + score-state upserts.
-- Example:
--   npx supabase db reset --local
--   docker exec -i supabase_db_parker-jarvis psql -U postgres -d postgres < supabase/tests/whoop_f3_sync_validation.sql

DO $validate$
DECLARE
  user_f3 uuid := 'f3f3f3f3-f3f3-f3f3-f3f3-f3f3f3f3f3f3';
  user_other uuid := 'f3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3';
  connection_f3 uuid;
  upsert_result jsonb;
  claimed_rows integer;
  stale_before timestamptz;
  cycle_sleep_id uuid := 'f3c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1';
  workout_id uuid := 'f3a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1';
BEGIN
  DELETE FROM public.whoop_body_measurements WHERE user_id IN (user_f3, user_other);
  DELETE FROM public.whoop_workouts WHERE user_id IN (user_f3, user_other);
  DELETE FROM public.whoop_sleeps WHERE user_id IN (user_f3, user_other);
  DELETE FROM public.whoop_recoveries WHERE user_id IN (user_f3, user_other);
  DELETE FROM public.whoop_cycles WHERE user_id IN (user_f3, user_other);
  DELETE FROM public.whoop_connection_credentials
  WHERE connection_id IN (
    SELECT id FROM public.whoop_connections WHERE user_id IN (user_f3, user_other)
  );
  DELETE FROM public.whoop_connections WHERE user_id IN (user_f3, user_other);
  DELETE FROM auth.users WHERE id IN (user_f3, user_other);

  INSERT INTO auth.users (id) VALUES (user_f3), (user_other);

  SELECT public.whoop_upsert_oauth_connection(
    user_f3,
    10129,
    ARRAY['offline', 'read:recovery'],
    now() + interval '1 hour',
    'enc-access-f3',
    'enc-refresh-f3',
    1::smallint
  ) INTO upsert_result;

  IF COALESCE((upsert_result->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'whoop_upsert_oauth_connection failed for F3 fixture: %', upsert_result;
  END IF;

  connection_f3 := (upsert_result->>'connection_id')::uuid;

  -- Atomic claim: idle connection succeeds.
  stale_before := now() - interval '10 minutes';

  UPDATE public.whoop_connections
  SET sync_in_progress_at = now()
  WHERE id = connection_f3
    AND status = 'connected'
    AND (
      sync_in_progress_at IS NULL
      OR sync_in_progress_at < stale_before
    );

  GET DIAGNOSTICS claimed_rows = ROW_COUNT;

  IF claimed_rows <> 1 THEN
    RAISE EXCEPTION 'F3 claim validation failed: first claim did not win exactly one row';
  END IF;

  -- Immediate second claim fails while in progress.
  UPDATE public.whoop_connections
  SET sync_in_progress_at = now()
  WHERE id = connection_f3
    AND status = 'connected'
    AND (
      sync_in_progress_at IS NULL
      OR sync_in_progress_at < stale_before
    );

  GET DIAGNOSTICS claimed_rows = ROW_COUNT;

  IF claimed_rows <> 0 THEN
    RAISE EXCEPTION 'F3 claim validation failed: second claim should not win while in progress';
  END IF;

  -- Stale claim succeeds after threshold.
  UPDATE public.whoop_connections
  SET sync_in_progress_at = now() - interval '11 minutes'
  WHERE id = connection_f3;

  UPDATE public.whoop_connections
  SET sync_in_progress_at = now()
  WHERE id = connection_f3
    AND status = 'connected'
    AND (
      sync_in_progress_at IS NULL
      OR sync_in_progress_at < stale_before
    );

  GET DIAGNOSTICS claimed_rows = ROW_COUNT;

  IF claimed_rows <> 1 THEN
    RAISE EXCEPTION 'F3 claim validation failed: stale claim did not succeed';
  END IF;

  UPDATE public.whoop_connections
  SET sync_in_progress_at = NULL
  WHERE id = connection_f3;

  -- Score-state transition: cycle SCORED -> PENDING_SCORE clears metrics.
  INSERT INTO public.whoop_cycles (
    user_id,
    whoop_cycle_id,
    score_state,
    strain,
    avg_heart_rate,
    max_heart_rate,
    kilojoule,
    raw_payload
  )
  VALUES (
    user_f3,
    93845,
    'SCORED',
    5.2,
    68,
    141,
    8288,
    '{"score_state":"SCORED"}'::jsonb
  )
  ON CONFLICT (user_id, whoop_cycle_id) DO UPDATE SET
    score_state = EXCLUDED.score_state,
    strain = EXCLUDED.strain,
    avg_heart_rate = EXCLUDED.avg_heart_rate,
    max_heart_rate = EXCLUDED.max_heart_rate,
    kilojoule = EXCLUDED.kilojoule,
    raw_payload = EXCLUDED.raw_payload;

  INSERT INTO public.whoop_cycles (
    user_id,
    whoop_cycle_id,
    score_state,
    strain,
    avg_heart_rate,
    max_heart_rate,
    kilojoule,
    raw_payload
  )
  VALUES (
    user_f3,
    93845,
    'PENDING_SCORE',
    NULL,
    NULL,
    NULL,
    NULL,
    '{"score_state":"PENDING_SCORE"}'::jsonb
  )
  ON CONFLICT (user_id, whoop_cycle_id) DO UPDATE SET
    score_state = EXCLUDED.score_state,
    strain = EXCLUDED.strain,
    avg_heart_rate = EXCLUDED.avg_heart_rate,
    max_heart_rate = EXCLUDED.max_heart_rate,
    kilojoule = EXCLUDED.kilojoule,
    raw_payload = EXCLUDED.raw_payload;

  IF (SELECT COUNT(*) FROM public.whoop_cycles WHERE user_id = user_f3 AND whoop_cycle_id = 93845) <> 1 THEN
    RAISE EXCEPTION 'F3 score-state validation failed: cycle row count changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.whoop_cycles
    WHERE user_id = user_f3
      AND whoop_cycle_id = 93845
      AND (
        score_state <> 'PENDING_SCORE'
        OR strain IS NOT NULL
        OR avg_heart_rate IS NOT NULL
        OR max_heart_rate IS NOT NULL
        OR kilojoule IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'F3 score-state validation failed: cycle metrics were not cleared';
  END IF;

  -- Sleep SCORED -> UNSCORABLE clears derived metrics.
  INSERT INTO public.whoop_sleeps (
    user_id,
    whoop_sleep_id,
    score_state,
    total_sleep_ms,
    sleep_performance_pct,
    raw_payload
  )
  VALUES (
    user_f3,
    cycle_sleep_id,
    'SCORED',
    6000,
    98,
    '{"score_state":"SCORED"}'::jsonb
  )
  ON CONFLICT (user_id, whoop_sleep_id) DO UPDATE SET
    score_state = EXCLUDED.score_state,
    total_sleep_ms = EXCLUDED.total_sleep_ms,
    sleep_performance_pct = EXCLUDED.sleep_performance_pct,
    raw_payload = EXCLUDED.raw_payload;

  INSERT INTO public.whoop_sleeps (
    user_id,
    whoop_sleep_id,
    score_state,
    total_sleep_ms,
    sleep_performance_pct,
    raw_payload
  )
  VALUES (
    user_f3,
    cycle_sleep_id,
    'UNSCORABLE',
    NULL,
    NULL,
    '{"score_state":"UNSCORABLE"}'::jsonb
  )
  ON CONFLICT (user_id, whoop_sleep_id) DO UPDATE SET
    score_state = EXCLUDED.score_state,
    total_sleep_ms = EXCLUDED.total_sleep_ms,
    sleep_performance_pct = EXCLUDED.sleep_performance_pct,
    raw_payload = EXCLUDED.raw_payload;

  IF EXISTS (
    SELECT 1
    FROM public.whoop_sleeps
    WHERE user_id = user_f3
      AND whoop_sleep_id = cycle_sleep_id
      AND (
        score_state <> 'UNSCORABLE'
        OR total_sleep_ms IS NOT NULL
        OR sleep_performance_pct IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'F3 score-state validation failed: sleep metrics were not cleared';
  END IF;

  -- Recovery SCORED -> PENDING_SCORE.
  INSERT INTO public.whoop_recoveries (
    user_id,
    whoop_sleep_id,
    whoop_cycle_id,
    score_state,
    recovery_score,
    resting_heart_rate,
    hrv_rmssd_milli,
    raw_payload
  )
  VALUES (
    user_f3,
    cycle_sleep_id,
    93845,
    'SCORED',
    44,
    64,
    31.8,
    '{"score_state":"SCORED"}'::jsonb
  )
  ON CONFLICT (user_id, whoop_sleep_id) DO UPDATE SET
    score_state = EXCLUDED.score_state,
    recovery_score = EXCLUDED.recovery_score,
    resting_heart_rate = EXCLUDED.resting_heart_rate,
    hrv_rmssd_milli = EXCLUDED.hrv_rmssd_milli,
    raw_payload = EXCLUDED.raw_payload;

  INSERT INTO public.whoop_recoveries (
    user_id,
    whoop_sleep_id,
    whoop_cycle_id,
    score_state,
    recovery_score,
    resting_heart_rate,
    hrv_rmssd_milli,
    raw_payload
  )
  VALUES (
    user_f3,
    cycle_sleep_id,
    93845,
    'PENDING_SCORE',
    NULL,
    NULL,
    NULL,
    '{"score_state":"PENDING_SCORE"}'::jsonb
  )
  ON CONFLICT (user_id, whoop_sleep_id) DO UPDATE SET
    score_state = EXCLUDED.score_state,
    recovery_score = EXCLUDED.recovery_score,
    resting_heart_rate = EXCLUDED.resting_heart_rate,
    hrv_rmssd_milli = EXCLUDED.hrv_rmssd_milli,
    raw_payload = EXCLUDED.raw_payload;

  IF EXISTS (
    SELECT 1
    FROM public.whoop_recoveries
    WHERE user_id = user_f3
      AND whoop_sleep_id = cycle_sleep_id
      AND (
        score_state <> 'PENDING_SCORE'
        OR recovery_score IS NOT NULL
        OR resting_heart_rate IS NOT NULL
        OR hrv_rmssd_milli IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'F3 score-state validation failed: recovery metrics were not cleared';
  END IF;

  -- Workout SCORED -> UNSCORABLE.
  INSERT INTO public.whoop_workouts (
    user_id,
    whoop_workout_id,
    score_state,
    strain,
    avg_heart_rate,
    distance_meter,
    raw_payload
  )
  VALUES (
    user_f3,
    workout_id,
    'SCORED',
    8.2,
    123,
    1772,
    '{"score_state":"SCORED"}'::jsonb
  )
  ON CONFLICT (user_id, whoop_workout_id) DO UPDATE SET
    score_state = EXCLUDED.score_state,
    strain = EXCLUDED.strain,
    avg_heart_rate = EXCLUDED.avg_heart_rate,
    distance_meter = EXCLUDED.distance_meter,
    raw_payload = EXCLUDED.raw_payload;

  INSERT INTO public.whoop_workouts (
    user_id,
    whoop_workout_id,
    score_state,
    strain,
    avg_heart_rate,
    distance_meter,
    raw_payload
  )
  VALUES (
    user_f3,
    workout_id,
    'UNSCORABLE',
    NULL,
    NULL,
    NULL,
    '{"score_state":"UNSCORABLE"}'::jsonb
  )
  ON CONFLICT (user_id, whoop_workout_id) DO UPDATE SET
    score_state = EXCLUDED.score_state,
    strain = EXCLUDED.strain,
    avg_heart_rate = EXCLUDED.avg_heart_rate,
    distance_meter = EXCLUDED.distance_meter,
    raw_payload = EXCLUDED.raw_payload;

  IF EXISTS (
    SELECT 1
    FROM public.whoop_workouts
    WHERE user_id = user_f3
      AND whoop_workout_id = workout_id
      AND (
        score_state <> 'UNSCORABLE'
        OR strain IS NOT NULL
        OR avg_heart_rate IS NOT NULL
        OR distance_meter IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION 'F3 score-state validation failed: workout metrics were not cleared';
  END IF;

  RAISE NOTICE 'WHOOP F3 sync validation passed';
END;
$validate$;
