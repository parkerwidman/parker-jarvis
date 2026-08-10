-- PostgREST-like identity validation for jarvis goal task security hardening.
-- Run as authenticator over TCP to model session_user = authenticator.
-- Example:
--   docker exec -i supabase_db_parker-jarvis psql -U postgres -d postgres < supabase/tests/jarvis_goal_task_security_identity_setup.sql
--   docker exec -e PGPASSWORD=postgres -i supabase_db_parker-jarvis psql -h 127.0.0.1 -U authenticator -d postgres < supabase/tests/jarvis_goal_task_security_identity_validation.sql

DO $validate$
DECLARE
  user_a uuid := '14141414-1414-1414-1414-141414141414';
  goal_task uuid;
  standalone uuid;
  result jsonb;
BEGIN
  IF current_user <> 'authenticator' OR session_user <> 'authenticator' THEN
    RAISE EXCEPTION 'identity validation must run under authenticator login, got current_user=%, session_user=%',
      current_user, session_user;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  BEGIN
    SET LOCAL ROLE authenticated;

    SELECT id INTO goal_task
    FROM public.tasks
    WHERE user_id = user_a
      AND title = 'Identity goal task';

    SELECT id INTO standalone
    FROM public.tasks
    WHERE user_id = user_a
      AND title = 'Identity standalone';

    IF goal_task IS NULL OR standalone IS NULL THEN
      RAISE EXCEPTION 'identity fixture missing; run jarvis_goal_task_security_identity_setup.sql first';
    END IF;

    IF current_user <> 'authenticated' OR session_user <> 'authenticator' THEN
      RAISE EXCEPTION 'direct auth identity mismatch: current_user=%, session_user=%',
        current_user, session_user;
    END IF;

    UPDATE public.tasks
    SET title = 'Identity touched standalone'
    WHERE id = standalone;

    BEGIN
      UPDATE public.tasks SET status = 'done' WHERE id = goal_task;
      RAISE EXCEPTION 'expected direct goal status rejection under postgrest-like identity';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%goal_task_completion_requires_rpc%' THEN
          RAISE EXCEPTION 'expected goal_task_completion_requires_rpc under postgrest-like identity, got %', SQLERRM;
        END IF;
    END;

    result := public.set_jarvis_goal_task_completion(goal_task, true);
    IF coalesce(result->>'success', 'false') <> 'true' THEN
      RAISE EXCEPTION 'expected definer completion under postgrest-like identity, got %', result;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.tasks WHERE id = goal_task AND status = 'done'
    ) THEN
      RAISE EXCEPTION 'expected definer completion to persist under postgrest-like identity';
    END IF;

    IF current_user <> 'authenticated' OR session_user <> 'authenticator' THEN
      RAISE EXCEPTION 'post-RPC caller identity mismatch: current_user=%, session_user=%',
        current_user, session_user;
    END IF;

    RESET ROLE;
  END;

  RAISE NOTICE 'jarvis goal task security identity validation passed';
END;
$validate$;
