-- Local validation for jarvis goal task completion RPC (run against local Supabase DB).
-- Example: docker exec -i supabase_db_parker-jarvis psql -U postgres -d postgres < supabase/tests/jarvis_goal_task_completion_validation.sql

DO $validate$
DECLARE
  user_a uuid := '11111111-1111-1111-1111-111111111111';
  user_b uuid := '22222222-2222-2222-2222-222222222222';
  goal_id uuid;
  level_1 uuid;
  level_2 uuid;
  level_3 uuid;
  task_a uuid;
  task_b uuid;
  task_c uuid;
  task_d uuid;
  standalone uuid;
  result jsonb;
  original_completed_at timestamp with time zone;
BEGIN
  INSERT INTO auth.users (id) VALUES (user_a), (user_b)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.jarvis_profiles (user_id) VALUES (user_a), (user_b)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.jarvis_goals (user_id, title, goal_type, domain)
  VALUES (user_a, 'Sequential goal', 'short_term', 'personal')
  RETURNING id INTO goal_id;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, goal_id, 'Level 1', 10)
  RETURNING id INTO level_1;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, goal_id, 'Level 2', 20)
  RETURNING id INTO level_2;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, goal_id, 'Level 3', 30)
  RETURNING id INTO level_3;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position, priority, notes, blocked_at, blocked_reason)
  VALUES (user_a, 'Task A', goal_id, level_1, 10, 'medium', 'keep-notes', now(), 'waiting')
  RETURNING id INTO task_a;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
  VALUES (user_a, 'Task B', goal_id, level_2, 10)
  RETURNING id INTO task_b;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
  VALUES (user_a, 'Task C', goal_id, level_3, 10)
  RETURNING id INTO task_c;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
  VALUES (user_a, 'Task D', goal_id, level_3, 20)
  RETURNING id INTO task_d;

  INSERT INTO public.tasks (user_id, title)
  VALUES (user_a, 'Standalone')
  RETURNING id INTO standalone;

  UPDATE public.jarvis_profiles
  SET today_priority_goal_id = goal_id
  WHERE user_id = user_a;

  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  result := public.set_jarvis_goal_task_completion(task_a, NULL);
  IF result->>'code' <> 'invalid_completion_state' THEN
    RAISE EXCEPTION 'expected invalid_completion_state for NULL p_completed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tasks WHERE id = task_a AND status <> 'todo'
  ) THEN
    RAISE EXCEPTION 'NULL p_completed must not mutate task row';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.jarvis_goals
    WHERE id = goal_id AND status <> 'active'
  ) THEN
    RAISE EXCEPTION 'NULL p_completed must not mutate goal row';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  result := public.set_jarvis_goal_task_completion(task_a, true);
  IF (result->>'success')::boolean IS NOT FALSE OR result->>'code' <> 'unauthenticated' THEN
    RAISE EXCEPTION 'expected unauthenticated rejection';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
  result := public.set_jarvis_goal_task_completion(task_a, true);
  IF (result->>'success')::boolean IS NOT FALSE OR result->>'code' <> 'task_not_found' THEN
    RAISE EXCEPTION 'expected cross-user rejection';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  result := public.set_jarvis_goal_task_completion(standalone, true);
  IF result->>'code' <> 'not_goal_task' THEN
    RAISE EXCEPTION 'expected not_goal_task rejection';
  END IF;

  result := public.set_jarvis_goal_task_completion(task_b, true);
  IF result->>'code' <> 'level_locked' THEN
    RAISE EXCEPTION 'expected level_locked for Task B';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tasks WHERE id = task_b AND status = 'done') THEN
    RAISE EXCEPTION 'locked completion must not mutate task';
  END IF;

  result := public.set_jarvis_goal_task_completion(task_a, true);
  IF result->>'code' <> 'completed' THEN
    RAISE EXCEPTION 'expected Task A completion';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tasks
    WHERE id = task_a AND status = 'done' AND completed_at IS NOT NULL
      AND notes = 'keep-notes' AND blocked_at IS NOT NULL AND blocked_reason = 'waiting'
  ) THEN
    RAISE EXCEPTION 'completion must preserve unrelated and blocker fields';
  END IF;

  UPDATE public.tasks
  SET status = 'done', completed_at = '2026-01-01T00:00:00Z'::timestamptz
  WHERE id = task_a;

  SELECT completed_at INTO original_completed_at FROM public.tasks WHERE id = task_a;

  result := public.set_jarvis_goal_task_completion(task_a, true);
  IF result->>'code' <> 'already_done' THEN
    RAISE EXCEPTION 'expected idempotent already_done';
  END IF;

  IF (SELECT completed_at FROM public.tasks WHERE id = task_a) <> original_completed_at THEN
    RAISE EXCEPTION 'idempotent complete must preserve completed_at';
  END IF;

  UPDATE public.tasks SET status = 'todo', completed_at = NULL WHERE id = task_a;

  result := public.set_jarvis_goal_task_completion(task_a, true);
  IF result->>'code' <> 'completed' THEN
    RAISE EXCEPTION 'expected Task A completion after reset';
  END IF;

  result := public.set_jarvis_goal_task_completion(task_b, true);
  IF result->>'code' <> 'completed' THEN
    RAISE EXCEPTION 'expected Task B completion after Level 1 done';
  END IF;

  result := public.set_jarvis_goal_task_completion(task_a, false);
  IF result->>'code' <> 'reopened' THEN
    RAISE EXCEPTION 'expected Task A reopen';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tasks
    WHERE id = task_a AND status = 'todo' AND completed_at IS NULL
      AND blocked_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'reopen must preserve blocker metadata';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE id = task_b AND status = 'done') THEN
    RAISE EXCEPTION 'reopening earlier task must not undo later completed tasks';
  END IF;

  result := public.set_jarvis_goal_task_completion(task_c, true);
  IF result->>'code' <> 'level_locked' THEN
    RAISE EXCEPTION 'expected Task C locked after reopening Task A';
  END IF;

  PERFORM public.set_jarvis_goal_task_completion(task_a, true);
  PERFORM public.set_jarvis_goal_task_completion(task_c, true);
  PERFORM public.set_jarvis_goal_task_completion(task_d, true);

  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_goals
    WHERE id = goal_id AND status = 'completed' AND completed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'expected goal completion after final task';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.jarvis_profiles
    WHERE user_id = user_a AND today_priority_goal_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'expected today priority cleared on goal completion';
  END IF;

  PERFORM public.set_jarvis_goal_task_completion(task_d, false);

  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_goals
    WHERE id = goal_id AND status = 'active' AND completed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'expected goal reopen after task reopen';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'jarvis_internal.reconcile_jarvis_goal_completion(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated must not have execute on internal helper';
  END IF;

  IF has_schema_privilege('authenticated', 'jarvis_internal', 'USAGE') THEN
    RAISE EXCEPTION 'authenticated must not have usage on jarvis_internal schema';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  SET LOCAL ROLE authenticated;
  result := public.set_jarvis_goal_task_completion(task_d, true);
  RESET ROLE;

  IF result->>'code' <> 'completed' THEN
    RAISE EXCEPTION 'expected authenticated public RPC completion, got %', result->>'code';
  END IF;

  UPDATE public.jarvis_goals SET status = 'archived' WHERE id = goal_id;
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  result := public.set_jarvis_goal_task_completion(task_a, true);
  IF result->>'code' <> 'goal_archived' THEN
    RAISE EXCEPTION 'expected archived goal rejection';
  END IF;

  RAISE NOTICE 'jarvis goal task completion validation passed';
END;
$validate$;

DO $malformed$
DECLARE
  user_a uuid := '33333333-3333-3333-3333-333333333333';
  goal_a uuid;
  goal_b uuid;
  level_a1 uuid;
  level_a2 uuid;
  level_b1 uuid;
  task_valid uuid;
  task_level_two uuid;
  task_on_a_level uuid;
  result jsonb;
BEGIN
  INSERT INTO auth.users (id) VALUES (user_a) ON CONFLICT DO NOTHING;
  INSERT INTO public.jarvis_profiles (user_id) VALUES (user_a) ON CONFLICT DO NOTHING;

  INSERT INTO public.jarvis_goals (user_id, title, goal_type, domain)
  VALUES (user_a, 'Malformed A', 'short_term', 'personal')
  RETURNING id INTO goal_a;

  INSERT INTO public.jarvis_goals (user_id, title, goal_type, domain)
  VALUES (user_a, 'Malformed B', 'short_term', 'personal')
  RETURNING id INTO goal_b;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, goal_a, 'A1', 10)
  RETURNING id INTO level_a1;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, goal_a, 'A2', 20)
  RETURNING id INTO level_a2;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, goal_b, 'B1', 10)
  RETURNING id INTO level_b1;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
  VALUES (user_a, 'Valid A1', goal_a, level_a1, 10)
  RETURNING id INTO task_valid;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
  VALUES (user_a, 'Valid A2', goal_a, level_a2, 10)
  RETURNING id INTO task_level_two;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
  VALUES (user_a, 'Valid B1', goal_b, level_b1, 10)
  RETURNING id INTO task_on_a_level;

  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);

  ALTER TABLE public.tasks DISABLE TRIGGER validate_task_goal_references;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, status, position)
  VALUES (user_a, 'Done orphan', goal_a, NULL, 'done', NULL);

  ALTER TABLE public.tasks ENABLE TRIGGER validate_task_goal_references;

  result := public.set_jarvis_goal_task_completion(task_valid, true);
  IF result->>'code' <> 'malformed_goal_structure' THEN
    RAISE EXCEPTION 'done orphan must block completion with malformed_goal_structure';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.jarvis_goals
    WHERE id = goal_a AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'done orphan must prevent false goal completion';
  END IF;

  DELETE FROM public.tasks
  WHERE user_id = user_a AND title = 'Done orphan';

  ALTER TABLE public.tasks DISABLE TRIGGER validate_task_goal_references;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, status, position)
  VALUES (user_a, 'Todo orphan', goal_a, NULL, 'todo', NULL);

  ALTER TABLE public.tasks ENABLE TRIGGER validate_task_goal_references;

  result := public.set_jarvis_goal_task_completion(task_valid, true);
  IF result->>'code' <> 'malformed_goal_structure' THEN
    RAISE EXCEPTION 'todo orphan must block completion with malformed_goal_structure';
  END IF;

  DELETE FROM public.tasks
  WHERE user_id = user_a AND title = 'Todo orphan';

  ALTER TABLE public.tasks DISABLE TRIGGER validate_task_goal_references;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, status, position)
  VALUES (user_a, 'Cross goal mismatch', goal_b, level_a1, 'todo', 20);

  ALTER TABLE public.tasks ENABLE TRIGGER validate_task_goal_references;

  result := public.set_jarvis_goal_task_completion(task_valid, true);
  IF result->>'code' <> 'malformed_goal_structure' THEN
    RAISE EXCEPTION 'goal/level mismatch must block goal A completion, got %', result->>'code';
  END IF;

  DELETE FROM public.tasks
  WHERE user_id = user_a AND title = 'Cross goal mismatch';

  result := public.set_jarvis_goal_task_completion(task_level_two, true);
  IF result->>'code' <> 'level_locked' THEN
    RAISE EXCEPTION 'expected level 2 locked before level 1 completes, got %', result->>'code';
  END IF;

  UPDATE public.tasks SET status = 'done', completed_at = now() WHERE id = task_valid;

  ALTER TABLE public.tasks DISABLE TRIGGER validate_task_goal_references;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, status, position)
  VALUES (user_a, 'Wrong goal on A1', goal_b, level_a1, 'todo', 30);

  ALTER TABLE public.tasks ENABLE TRIGGER validate_task_goal_references;

  result := public.set_jarvis_goal_task_completion(task_level_two, true);
  IF result->>'code' <> 'malformed_goal_structure' THEN
    RAISE EXCEPTION 'malformed task must not unlock later level completion, got %', result->>'code';
  END IF;

  DELETE FROM public.tasks
  WHERE user_id = user_a AND title = 'Wrong goal on A1';

  UPDATE public.tasks
  SET status = 'todo', completed_at = NULL
  WHERE id = task_valid;

  result := public.set_jarvis_goal_task_completion(task_valid, true);
  IF result->>'code' <> 'completed' THEN
    RAISE EXCEPTION 'valid goal must still complete normally after cleanup, got %', result->>'code';
  END IF;

  result := public.set_jarvis_goal_task_completion(task_valid, false);
  IF result->>'code' <> 'reopened' THEN
    RAISE EXCEPTION 'valid reopen must still work after cleanup, got %', result->>'code';
  END IF;

  UPDATE public.jarvis_goals
  SET status = 'completed', completed_at = now()
  WHERE id = goal_a;

  ALTER TABLE public.tasks DISABLE TRIGGER validate_task_goal_references;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, status, position)
  VALUES (user_a, 'Completed orphan', goal_a, NULL, 'done', NULL);

  ALTER TABLE public.tasks ENABLE TRIGGER validate_task_goal_references;

  PERFORM jarvis_internal.reconcile_jarvis_goal_completion(goal_a);

  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_goals
    WHERE id = goal_a AND status = 'active' AND completed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'malformed structure must reopen previously completed goal';
  END IF;

  RAISE NOTICE 'jarvis goal malformed-structure validation passed';
END;
$malformed$;

DO $wrong_user$
DECLARE
  user_a uuid := '44444444-4444-4444-4444-444444444444';
  user_b uuid := '55555555-5555-5555-5555-555555555555';
  goal_a uuid;
  goal_b uuid;
  level_a1 uuid;
  level_b1 uuid;
  task_valid uuid;
  result jsonb;
BEGIN
  INSERT INTO auth.users (id) VALUES (user_a), (user_b) ON CONFLICT DO NOTHING;
  INSERT INTO public.jarvis_profiles (user_id) VALUES (user_a), (user_b)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.jarvis_goals (user_id, title, goal_type, domain)
  VALUES (user_a, 'Wrong user A', 'short_term', 'personal')
  RETURNING id INTO goal_a;

  INSERT INTO public.jarvis_goals (user_id, title, goal_type, domain)
  VALUES (user_a, 'Wrong user B', 'short_term', 'personal')
  RETURNING id INTO goal_b;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, goal_a, 'A1', 10)
  RETURNING id INTO level_a1;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, goal_b, 'B1', 10)
  RETURNING id INTO level_b1;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
  VALUES (user_a, 'Valid A1', goal_a, level_a1, 10)
  RETURNING id INTO task_valid;

  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);

  ALTER TABLE public.tasks DISABLE TRIGGER validate_task_goal_references;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, status, position)
  VALUES (user_b, 'Wrong user orphan', goal_a, NULL, 'todo', NULL);

  ALTER TABLE public.tasks ENABLE TRIGGER validate_task_goal_references;

  result := public.set_jarvis_goal_task_completion(task_valid, true);
  IF result->>'code' <> 'malformed_goal_structure' THEN
    RAISE EXCEPTION 'wrong-user orphan must block completion, got %', result->>'code';
  END IF;

  DELETE FROM public.tasks WHERE title = 'Wrong user orphan';

  ALTER TABLE public.tasks DISABLE TRIGGER validate_task_goal_references;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, status, position)
  VALUES (user_b, 'Wrong user wrong level', goal_a, level_b1, 'todo', 20);

  ALTER TABLE public.tasks ENABLE TRIGGER validate_task_goal_references;

  result := public.set_jarvis_goal_task_completion(task_valid, true);
  IF result->>'code' <> 'malformed_goal_structure' THEN
    RAISE EXCEPTION 'wrong-user task with mismatched level must block completion, got %', result->>'code';
  END IF;

  DELETE FROM public.tasks WHERE title = 'Wrong user wrong level';

  ALTER TABLE public.tasks DISABLE TRIGGER validate_task_goal_references;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, status, position)
  VALUES (user_b, 'Wrong user on level', goal_b, level_a1, 'todo', 30);

  ALTER TABLE public.tasks ENABLE TRIGGER validate_task_goal_references;

  result := public.set_jarvis_goal_task_completion(task_valid, true);
  IF result->>'code' <> 'malformed_goal_structure' THEN
    RAISE EXCEPTION 'wrong-user task on goal level must block completion, got %', result->>'code';
  END IF;

  DELETE FROM public.tasks WHERE title = 'Wrong user on level';

  RAISE NOTICE 'jarvis goal wrong-user malformed validation passed';
END;
$wrong_user$;

DO $empty_level$
DECLARE
  user_a uuid := '66666666-6666-6666-6666-666666666666';
  goal_id uuid;
  level_1 uuid;
  level_2 uuid;
  task_l1 uuid;
  task_l2 uuid;
  result jsonb;
BEGIN
  INSERT INTO auth.users (id) VALUES (user_a) ON CONFLICT DO NOTHING;
  INSERT INTO public.jarvis_profiles (user_id) VALUES (user_a) ON CONFLICT DO NOTHING;

  INSERT INTO public.jarvis_goals (user_id, title, goal_type, domain)
  VALUES (user_a, 'Empty level goal', 'short_term', 'personal')
  RETURNING id INTO goal_id;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, goal_id, 'Empty L1', 10)
  RETURNING id INTO level_1;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, goal_id, 'L2 with task', 20)
  RETURNING id INTO level_2;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
  VALUES (user_a, 'Level 2 task', goal_id, level_2, 10)
  RETURNING id INTO task_l2;

  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);

  result := public.set_jarvis_goal_task_completion(task_l2, true);
  IF result->>'code' <> 'malformed_goal_structure' THEN
    RAISE EXCEPTION 'empty level 1 must reject level 2 completion, got %', result->>'code';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tasks WHERE id = task_l2 AND status = 'done') THEN
    RAISE EXCEPTION 'empty level must not mutate level 2 task';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.jarvis_goals
    WHERE id = goal_id AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'empty level must not complete goal';
  END IF;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
  VALUES (user_a, 'Level 1 task', goal_id, level_1, 10)
  RETURNING id INTO task_l1;

  result := public.set_jarvis_goal_task_completion(task_l1, true);
  IF result->>'code' <> 'completed' THEN
    RAISE EXCEPTION 'valid level 1 completion must succeed, got %', result->>'code';
  END IF;

  result := public.set_jarvis_goal_task_completion(task_l2, true);
  IF result->>'code' <> 'completed' THEN
    RAISE EXCEPTION 'valid level 2 completion after level 1 must succeed, got %', result->>'code';
  END IF;

  RAISE NOTICE 'jarvis goal empty-level validation passed';
END;
$empty_level$;
