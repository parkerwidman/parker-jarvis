-- Local validation for WHOOP Fitness F5A webhook idempotency + soft-delete semantics.
-- Example:
--   npx supabase db reset --local
--   docker exec -i supabase_db_parker-jarvis psql -U postgres -d postgres < supabase/tests/whoop_f5_webhook_validation.sql

DO $validate$
DECLARE
  user_f5 uuid := 'f5f5f5f5-f5f5-45f5-85f5-f5f5f5f5f5f5';
  sleep_id uuid := 'f5c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1';
  workout_id uuid := 'f5a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1';
  trace_processed text := 'f5-trace-processed';
  trace_failed text := 'f5-trace-failed';
  trace_pending text := 'f5-trace-pending';
  stale_pending text := 'f5-trace-stale-pending';
  stale_concurrent text := 'f5-trace-stale-concurrent';
  reclaimed_rows integer;
BEGIN
  DELETE FROM public.whoop_webhook_events
  WHERE trace_id IN (
    trace_processed,
    trace_failed,
    trace_pending,
    stale_pending,
    stale_concurrent
  );
  DELETE FROM public.whoop_workouts WHERE user_id = user_f5;
  DELETE FROM public.whoop_sleeps WHERE user_id = user_f5;
  DELETE FROM auth.users WHERE id = user_f5;

  INSERT INTO auth.users (id) VALUES (user_f5);

  INSERT INTO public.whoop_webhook_events (
    trace_id, user_id, event_type, resource_id, status
  )
  VALUES (trace_processed, user_f5, 'sleep.updated', sleep_id::text, 'processed');

  BEGIN
    INSERT INTO public.whoop_webhook_events (
      trace_id, user_id, event_type, resource_id, status
    )
    VALUES (trace_processed, user_f5, 'sleep.updated', sleep_id::text, 'pending');
    RAISE EXCEPTION 'F5 webhook validation failed: duplicate processed trace_id was insertable';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  INSERT INTO public.whoop_webhook_events (
    trace_id, user_id, event_type, resource_id, status, error_code
  )
  VALUES (trace_failed, user_f5, 'workout.updated', workout_id::text, 'failed', 'whoop_webhook_provider_failed');

  UPDATE public.whoop_webhook_events
  SET status = 'pending', error_code = NULL, processed_at = NULL
  WHERE trace_id = trace_failed AND status = 'failed';

  GET DIAGNOSTICS reclaimed_rows = ROW_COUNT;

  IF reclaimed_rows <> 1 THEN
    RAISE EXCEPTION 'F5 webhook validation failed: failed trace reclaim did not win one row';
  END IF;

  UPDATE public.whoop_webhook_events
  SET status = 'pending', error_code = NULL, processed_at = NULL
  WHERE trace_id = trace_failed AND status = 'failed';

  GET DIAGNOSTICS reclaimed_rows = ROW_COUNT;

  IF reclaimed_rows <> 0 THEN
    RAISE EXCEPTION 'F5 webhook validation failed: second failed reclaim won unexpectedly';
  END IF;

  INSERT INTO public.whoop_webhook_events (
    trace_id, user_id, event_type, resource_id, status, received_at, updated_at
  )
  VALUES (
    trace_pending,
    user_f5,
    'sleep.updated',
    sleep_id::text,
    'pending',
    now(),
    now()
  );

  UPDATE public.whoop_webhook_events
  SET error_code = NULL, processed_at = NULL
  WHERE trace_id = trace_pending
    AND status = 'pending'
    AND updated_at < now() - interval '15 minutes';

  GET DIAGNOSTICS reclaimed_rows = ROW_COUNT;

  IF reclaimed_rows <> 0 THEN
    RAISE EXCEPTION 'F5 webhook validation failed: fresh pending trace was reclaimable';
  END IF;

  INSERT INTO public.whoop_webhook_events (
    trace_id, user_id, event_type, resource_id, status, received_at, updated_at
  )
  VALUES (
    stale_pending,
    user_f5,
    'sleep.updated',
    sleep_id::text,
    'pending',
    now() - interval '16 minutes',
    now() - interval '16 minutes'
  );

  UPDATE public.whoop_webhook_events
  SET error_code = NULL, processed_at = NULL
  WHERE trace_id = stale_pending
    AND status = 'pending'
    AND updated_at < now() - interval '15 minutes';

  GET DIAGNOSTICS reclaimed_rows = ROW_COUNT;

  IF reclaimed_rows <> 1 THEN
    RAISE EXCEPTION 'F5 webhook validation failed: stale pending trace was not reclaimable';
  END IF;

  INSERT INTO public.whoop_webhook_events (
    trace_id, user_id, event_type, resource_id, status, received_at, updated_at
  )
  VALUES (
    stale_concurrent,
    user_f5,
    'sleep.updated',
    sleep_id::text,
    'pending',
    now() - interval '16 minutes',
    now() - interval '16 minutes'
  );

  UPDATE public.whoop_webhook_events
  SET error_code = NULL, processed_at = NULL
  WHERE trace_id = stale_concurrent
    AND status = 'pending'
    AND updated_at < now() - interval '15 minutes';

  GET DIAGNOSTICS reclaimed_rows = ROW_COUNT;

  IF reclaimed_rows <> 1 THEN
    RAISE EXCEPTION 'F5 webhook validation failed: first stale concurrent reclaim did not win';
  END IF;

  UPDATE public.whoop_webhook_events
  SET error_code = NULL, processed_at = NULL
  WHERE trace_id = stale_concurrent
    AND status = 'pending'
    AND updated_at < now() - interval '15 minutes';

  GET DIAGNOSTICS reclaimed_rows = ROW_COUNT;

  IF reclaimed_rows <> 0 THEN
    RAISE EXCEPTION 'F5 webhook validation failed: second stale concurrent reclaim won unexpectedly';
  END IF;

  INSERT INTO public.whoop_sleeps (
    user_id,
    whoop_sleep_id,
    score_state,
    deleted_at,
    raw_payload
  )
  VALUES (
    user_f5,
    sleep_id,
    'SCORED',
    now(),
    '{"score_state":"SCORED"}'::jsonb
  )
  ON CONFLICT (user_id, whoop_sleep_id) DO UPDATE SET
    score_state = EXCLUDED.score_state,
    deleted_at = EXCLUDED.deleted_at,
    raw_payload = EXCLUDED.raw_payload;

  INSERT INTO public.whoop_sleeps (
    user_id,
    whoop_sleep_id,
    score_state,
    deleted_at,
    raw_payload
  )
  VALUES (
    user_f5,
    sleep_id,
    'SCORED',
    NULL,
    '{"score_state":"SCORED"}'::jsonb
  )
  ON CONFLICT (user_id, whoop_sleep_id) DO UPDATE SET
    score_state = EXCLUDED.score_state,
    deleted_at = EXCLUDED.deleted_at,
    raw_payload = EXCLUDED.raw_payload;

  IF EXISTS (
    SELECT 1
    FROM public.whoop_sleeps
    WHERE user_id = user_f5
      AND whoop_sleep_id = sleep_id
      AND deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'F5 webhook validation failed: updated upsert did not clear deleted_at';
  END IF;

  RAISE NOTICE 'WHOOP F5 webhook validation passed';
END;
$validate$;
