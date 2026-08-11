-- Local validation for WHOOP Fitness F5B reconcile claim + webhook sweep semantics.
-- Example:
--   npx supabase db reset --local
--   docker exec -i supabase_db_parker-jarvis psql -U postgres -d postgres < supabase/tests/whoop_f5b_reconcile_validation.sql

DO $validate$
DECLARE
  user_f5b uuid := 'f5b5b5b5-b5b5-45b5-b5b5-b5b5b5b5b5b5';
  trace_failed text := 'f5b-trace-failed';
  trace_stale text := 'f5b-trace-stale';
  reclaimed_rows integer;
BEGIN
  DELETE FROM public.whoop_webhook_events
  WHERE trace_id IN (trace_failed, trace_stale);
  DELETE FROM public.whoop_connections WHERE user_id = user_f5b;
  DELETE FROM auth.users WHERE id = user_f5b;

  INSERT INTO auth.users (id) VALUES (user_f5b);

  INSERT INTO public.whoop_connections (
    user_id,
    whoop_user_id,
    status,
    granted_scopes
  )
  VALUES (user_f5b, 10129, 'connected', ARRAY['read:sleep']);

  INSERT INTO public.whoop_webhook_events (
    trace_id, user_id, event_type, resource_id, status, error_code
  )
  VALUES (
    trace_failed,
    user_f5b,
    'workout.updated',
    'f5a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1',
    'failed',
    'whoop_webhook_provider_failed'
  );

  UPDATE public.whoop_webhook_events
  SET status = 'pending', error_code = NULL, processed_at = NULL
  WHERE trace_id = trace_failed AND status = 'failed';

  GET DIAGNOSTICS reclaimed_rows = ROW_COUNT;

  IF reclaimed_rows <> 1 THEN
    RAISE EXCEPTION 'F5B validation failed: failed webhook reclaim did not win one row';
  END IF;

  INSERT INTO public.whoop_webhook_events (
    trace_id, user_id, event_type, resource_id, status, received_at, updated_at
  )
  VALUES (
    trace_stale,
    user_f5b,
    'sleep.updated',
    'f5c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1',
    'pending',
    now() - interval '16 minutes',
    now() - interval '16 minutes'
  );

  UPDATE public.whoop_webhook_events
  SET error_code = NULL, processed_at = NULL
  WHERE trace_id = trace_stale
    AND status = 'pending'
    AND updated_at < now() - interval '15 minutes';

  GET DIAGNOSTICS reclaimed_rows = ROW_COUNT;

  IF reclaimed_rows <> 1 THEN
    RAISE EXCEPTION 'F5B validation failed: stale pending webhook reclaim did not win one row';
  END IF;

  UPDATE public.whoop_connections
  SET sync_in_progress_at = now()
  WHERE user_id = user_f5b;

  UPDATE public.whoop_connections
  SET sync_in_progress_at = now()
  WHERE user_id = user_f5b
    AND status = 'connected'
    AND (
      sync_in_progress_at IS NULL
      OR sync_in_progress_at < now() - interval '10 minutes'
    );

  GET DIAGNOSTICS reclaimed_rows = ROW_COUNT;

  IF reclaimed_rows <> 0 THEN
    RAISE EXCEPTION 'F5B validation failed: active sync claim was reclaimable while fresh';
  END IF;

  UPDATE public.whoop_connections
  SET sync_in_progress_at = now() - interval '11 minutes'
  WHERE user_id = user_f5b;

  UPDATE public.whoop_connections
  SET sync_in_progress_at = now()
  WHERE user_id = user_f5b
    AND status = 'connected'
    AND (
      sync_in_progress_at IS NULL
      OR sync_in_progress_at < now() - interval '10 minutes'
    );

  GET DIAGNOSTICS reclaimed_rows = ROW_COUNT;

  IF reclaimed_rows <> 1 THEN
    RAISE EXCEPTION 'F5B validation failed: stale sync claim was not reclaimable';
  END IF;

  RAISE NOTICE 'WHOOP F5B reconcile validation passed';
END;
$validate$;
