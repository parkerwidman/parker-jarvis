-- Local validation for WHOOP Fitness F1 foundation (run against local Supabase DB).
-- Example:
--   npx supabase db reset --local
--   docker exec -i supabase_db_parker-jarvis psql -U postgres -d postgres < supabase/tests/whoop_foundation_validation.sql

DO $validate$
DECLARE
  user_a uuid := 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
  user_b uuid := 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2';
  connection_a uuid;
  connection_b uuid;
  sleep_id uuid := 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3';
  workout_id uuid := 'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4';
  cycle_row_id uuid;
  sleep_row_id uuid;
  recovery_row_id uuid;
  workout_row_id uuid;
  webhook_row_id uuid;
  policy_count integer;
BEGIN
  INSERT INTO auth.users (id) VALUES (user_a), (user_b)
  ON CONFLICT DO NOTHING;

  -- Seed provider data as trusted postgres/service paths.
  INSERT INTO public.whoop_connections (user_id, whoop_user_id, status, granted_scopes)
  VALUES (user_a, 10129, 'connected', ARRAY['offline', 'read:recovery'])
  RETURNING id INTO connection_a;

  INSERT INTO public.whoop_connections (user_id, whoop_user_id, status)
  VALUES (user_b, 20239, 'connected')
  RETURNING id INTO connection_b;

  INSERT INTO public.whoop_connection_credentials (
    connection_id,
    encrypted_access_token,
    encrypted_refresh_token,
    encryption_version
  )
  VALUES (
    connection_a,
    'encrypted-access-placeholder',
    'encrypted-refresh-placeholder',
    1
  );

  INSERT INTO public.whoop_cycles (
    user_id,
    whoop_cycle_id,
    start_at,
    score_state,
    strain,
    raw_payload
  )
  VALUES (
    user_a,
    93845,
    now() - interval '1 day',
    'SCORED',
    5.29,
    '{"id":93845}'::jsonb
  )
  RETURNING id INTO cycle_row_id;

  INSERT INTO public.whoop_sleeps (
    user_id,
    whoop_sleep_id,
    whoop_cycle_id,
    start_at,
    score_state,
    sleep_performance_pct,
    raw_payload
  )
  VALUES (
    user_a,
    sleep_id,
    93845,
    now() - interval '10 hours',
    'SCORED',
    98,
    '{"id":"sleep"}'::jsonb
  )
  RETURNING id INTO sleep_row_id;

  INSERT INTO public.whoop_recoveries (
    user_id,
    whoop_sleep_id,
    whoop_cycle_id,
    score_state,
    recovery_score,
    hrv_rmssd_milli,
    raw_payload
  )
  VALUES (
    user_a,
    sleep_id,
    93845,
    'SCORED',
    44,
    31.8,
    '{"sleep_id":"recovery"}'::jsonb
  )
  RETURNING id INTO recovery_row_id;

  INSERT INTO public.whoop_workouts (
    user_id,
    whoop_workout_id,
    sport_name,
    start_at,
    score_state,
    strain,
    raw_payload
  )
  VALUES (
    user_a,
    workout_id,
    'running',
    now() - interval '2 hours',
    'SCORED',
    8.2,
    '{"id":"workout"}'::jsonb
  )
  RETURNING id INTO workout_row_id;

  INSERT INTO public.whoop_body_measurements (
    user_id,
    height_meter,
    weight_kilogram,
    max_heart_rate,
    synced_at,
    raw_payload
  )
  VALUES (
    user_a,
    1.82,
    90.7,
    200,
    now(),
    '{"height_meter":1.82}'::jsonb
  );

  INSERT INTO public.whoop_webhook_events (
    trace_id,
    user_id,
    event_type,
    resource_id,
    status
  )
  VALUES (
    'trace-whoop-f1-validation',
    user_a,
    'sleep.updated',
    sleep_id::text,
    'pending'
  )
  RETURNING id INTO webhook_row_id;

  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- 1. User A can SELECT own connection metadata.
  SET LOCAL ROLE authenticated;
  IF NOT EXISTS (
    SELECT 1
    FROM public.whoop_connections
    WHERE id = connection_a AND user_id = user_a
  ) THEN
    RAISE EXCEPTION 'user A must SELECT own whoop_connections row';
  END IF;

  -- 2. User A cannot SELECT User B connection.
  IF EXISTS (
    SELECT 1
    FROM public.whoop_connections
    WHERE id = connection_b
  ) THEN
    RAISE EXCEPTION 'user A must not SELECT user B whoop_connections row';
  END IF;

  RESET ROLE;

  -- 3-5. authenticated cannot write connection metadata directly.
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
    INSERT INTO public.whoop_connections (user_id, status)
    VALUES (user_a, 'connected');
    RAISE EXCEPTION 'authenticated must not INSERT whoop_connections';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
    UPDATE public.whoop_connections
    SET status = 'error'
    WHERE id = connection_a;
    RAISE EXCEPTION 'authenticated must not UPDATE whoop_connections';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
    DELETE FROM public.whoop_connections
    WHERE id = connection_a;
    RAISE EXCEPTION 'authenticated must not DELETE whoop_connections';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  RESET ROLE;

  -- 6-10. credentials table blocked for authenticated and anon.
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
    PERFORM 1
    FROM public.whoop_connection_credentials
    WHERE connection_id = connection_a;
    RAISE EXCEPTION 'authenticated must not SELECT whoop_connection_credentials';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
    INSERT INTO public.whoop_connection_credentials (
      connection_id,
      encrypted_access_token,
      encrypted_refresh_token
    )
    VALUES (connection_a, 'x', 'y');
    RAISE EXCEPTION 'authenticated must not INSERT whoop_connection_credentials';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
    UPDATE public.whoop_connection_credentials
    SET encrypted_access_token = 'tampered'
    WHERE connection_id = connection_a;
    RAISE EXCEPTION 'authenticated must not UPDATE whoop_connection_credentials';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
    DELETE FROM public.whoop_connection_credentials
    WHERE connection_id = connection_a;
    RAISE EXCEPTION 'authenticated must not DELETE whoop_connection_credentials';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    SET LOCAL ROLE anon;
    PERFORM 1
    FROM public.whoop_connection_credentials
    WHERE connection_id = connection_a;
    RAISE EXCEPTION 'anon must not SELECT whoop_connection_credentials';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  RESET ROLE;

  -- 11. service_role can manage credentials.
  SET LOCAL ROLE service_role;
  UPDATE public.whoop_connection_credentials
  SET encrypted_access_token = 'rotated-access-placeholder'
  WHERE connection_id = connection_a;

  IF NOT EXISTS (
    SELECT 1
    FROM public.whoop_connection_credentials
    WHERE connection_id = connection_a
      AND encrypted_access_token = 'rotated-access-placeholder'
  ) THEN
    RAISE EXCEPTION 'service_role must UPDATE whoop_connection_credentials';
  END IF;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- 12-16. metric SELECT own / not other / no writes.
  SET LOCAL ROLE authenticated;
  IF NOT EXISTS (
    SELECT 1 FROM public.whoop_cycles WHERE id = cycle_row_id AND user_id = user_a
  ) THEN
    RAISE EXCEPTION 'user A must SELECT own whoop_cycles row';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.whoop_cycles WHERE user_id = user_b
  ) THEN
    RAISE EXCEPTION 'user A must not SELECT user B whoop_cycles rows';
  END IF;

  BEGIN
    INSERT INTO public.whoop_cycles (user_id, whoop_cycle_id, raw_payload)
    VALUES (user_a, 99999, '{}'::jsonb);
    RAISE EXCEPTION 'authenticated must not INSERT whoop_cycles';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    UPDATE public.whoop_cycles SET strain = 99 WHERE id = cycle_row_id;
    RAISE EXCEPTION 'authenticated must not UPDATE whoop_cycles';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    DELETE FROM public.whoop_cycles WHERE id = cycle_row_id;
    RAISE EXCEPTION 'authenticated must not DELETE whoop_cycles';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  IF NOT EXISTS (
    SELECT 1 FROM public.whoop_sleeps WHERE id = sleep_row_id AND user_id = user_a
  ) THEN
    RAISE EXCEPTION 'user A must SELECT own whoop_sleeps row';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.whoop_recoveries WHERE id = recovery_row_id AND user_id = user_a
  ) THEN
    RAISE EXCEPTION 'user A must SELECT own whoop_recoveries row';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.whoop_workouts WHERE id = workout_row_id AND user_id = user_a
  ) THEN
    RAISE EXCEPTION 'user A must SELECT own whoop_workouts row';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.whoop_body_measurements WHERE user_id = user_a
  ) THEN
    RAISE EXCEPTION 'user A must SELECT own whoop_body_measurements row';
  END IF;

  BEGIN
    INSERT INTO public.whoop_sleeps (user_id, whoop_sleep_id, raw_payload)
    VALUES (user_a, gen_random_uuid(), '{}'::jsonb);
    RAISE EXCEPTION 'authenticated must not INSERT whoop_sleeps';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  RESET ROLE;

  -- 17-20. webhook events server-only.
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
    PERFORM 1 FROM public.whoop_webhook_events WHERE id = webhook_row_id;
    RAISE EXCEPTION 'authenticated must not SELECT whoop_webhook_events';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
    INSERT INTO public.whoop_webhook_events (trace_id, event_type, resource_id, status)
    VALUES ('trace-auth-write', 'sleep.updated', sleep_id::text, 'pending');
    RAISE EXCEPTION 'authenticated must not INSERT whoop_webhook_events';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  BEGIN
    SET LOCAL ROLE anon;
    PERFORM 1 FROM public.whoop_webhook_events WHERE id = webhook_row_id;
    RAISE EXCEPTION 'anon must not SELECT whoop_webhook_events';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;

  SET LOCAL ROLE service_role;
  UPDATE public.whoop_webhook_events
  SET status = 'processed', processed_at = now()
  WHERE id = webhook_row_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.whoop_webhook_events
    WHERE id = webhook_row_id AND status = 'processed'
  ) THEN
    RAISE EXCEPTION 'service_role must manage whoop_webhook_events';
  END IF;
  RESET ROLE;

  -- 21-29. structural checks.
  IF (
    SELECT COUNT(*)
    FROM public.whoop_connections
    WHERE user_id = user_a
  ) <> 1 THEN
    RAISE EXCEPTION 'unique connection per user violated';
  END IF;

  IF to_regclass('public.whoop_connection_credentials') IS NULL THEN
    RAISE EXCEPTION 'whoop_connection_credentials table must exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'whoop_connections'
      AND column_name IN (
        'encrypted_access_token',
        'encrypted_refresh_token',
        'access_token_encrypted',
        'refresh_token_encrypted'
      )
  ) THEN
    RAISE EXCEPTION 'whoop_connections must not contain token columns';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'whoop_cycles_user_id_whoop_cycle_id_key'
  ) THEN
    RAISE EXCEPTION 'unique cycle provider key must exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'whoop_sleeps_user_id_whoop_sleep_id_key'
  ) THEN
    RAISE EXCEPTION 'unique sleep provider key must exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'whoop_recoveries_user_id_whoop_sleep_id_key'
  ) THEN
    RAISE EXCEPTION 'unique recovery provider key must exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'whoop_workouts_user_id_whoop_workout_id_key'
  ) THEN
    RAISE EXCEPTION 'unique workout provider key must exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'whoop_webhook_events_trace_id_key'
  ) THEN
    RAISE EXCEPTION 'unique webhook trace_id must exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'whoop_cycles'
      AND column_name = 'raw_payload'
      AND udt_name = 'jsonb'
  ) THEN
    RAISE EXCEPTION 'raw_payload jsonb must exist on metric tables';
  END IF;

  INSERT INTO public.whoop_sleeps (
    user_id,
    whoop_sleep_id,
    whoop_cycle_id,
    score_state,
    raw_payload
  )
  VALUES (
    user_a,
    gen_random_uuid(),
    NULL,
    'PENDING',
    '{"score_state":"PENDING"}'::jsonb
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.whoop_sleeps
    WHERE user_id = user_a
      AND whoop_cycle_id IS NULL
      AND score_state = 'PENDING'
      AND sleep_performance_pct IS NULL
  ) THEN
    RAISE EXCEPTION 'nullable scoring fields must support pending WHOOP state';
  END IF;

  SELECT COUNT(*)
  INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'whoop_connection_credentials';

  IF policy_count <> 0 THEN
    RAISE EXCEPTION 'whoop_connection_credentials must not expose authenticated RLS policies';
  END IF;

  RAISE NOTICE 'WHOOP F1 foundation validation passed';
END;
$validate$;
