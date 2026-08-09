-- Local validation for jarvis goal reorder RPCs (run against local Supabase DB).
-- Example: docker exec -i supabase_db_parker-jarvis psql -U postgres -d postgres < supabase/tests/jarvis_goal_reorder_validation.sql

DO $validate$
DECLARE
  user_a uuid := '77777777-7777-7777-7777-777777777777';
  user_b uuid := '88888888-8888-8888-8888-888888888888';
  v_goal_id uuid;
  level_1 uuid;
  level_2 uuid;
  level_3 uuid;
  task_a uuid;
  task_b uuid;
  task_c uuid;
  task_d uuid;
  result jsonb;
  original_focus text;
  snap_title text;
  snap_status text;
  snap_priority text;
  snap_notes text;
  snap_blocked_at timestamp with time zone;
  snap_blocked_reason text;
  snap_completed_at timestamp with time zone;
  snap_goal_id uuid;
  snap_level_id uuid;
BEGIN
  INSERT INTO auth.users (id) VALUES (user_a), (user_b)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.jarvis_profiles (user_id, current_focus)
  VALUES (user_a, 'Keep shipping'), (user_b, 'Other focus')
  ON CONFLICT (user_id) DO UPDATE SET current_focus = EXCLUDED.current_focus;

  SELECT current_focus INTO original_focus
  FROM public.jarvis_profiles
  WHERE user_id = user_a;

  INSERT INTO public.jarvis_goals (user_id, title, goal_type, domain)
  VALUES (user_a, 'Reorder goal', 'short_term', 'personal')
  RETURNING id INTO v_goal_id;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, v_goal_id, 'Alpha', 10)
  RETURNING id INTO level_1;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, v_goal_id, 'Beta', 20)
  RETURNING id INTO level_2;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, v_goal_id, 'Gamma', 30)
  RETURNING id INTO level_3;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position, status, priority, notes, blocked_at, blocked_reason, completed_at)
  VALUES (user_a, 'Task A', v_goal_id, level_1, 10, 'todo', 'medium', 'note a', NULL, NULL, NULL)
  RETURNING id INTO task_a;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position, status, priority)
  VALUES (user_a, 'Task B', v_goal_id, level_1, 20, 'todo', 'medium')
  RETURNING id INTO task_b;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position, status, priority, completed_at)
  VALUES (user_a, 'Task C', v_goal_id, level_2, 10, 'done', 'high', now())
  RETURNING id INTO task_c;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position, status, priority, blocked_at, blocked_reason)
  VALUES (user_a, 'Task D', v_goal_id, level_2, 20, 'todo', 'low', now(), 'waiting')
  RETURNING id INTO task_d;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position, status, priority)
  VALUES (user_a, 'Task E', v_goal_id, level_3, 10, 'todo', 'medium');

  UPDATE public.jarvis_profiles
  SET today_priority_goal_id = v_goal_id
  WHERE user_id = user_a;

  IF has_function_privilege('authenticated', 'public.move_jarvis_goal_level(uuid, text)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'authenticated must execute move_jarvis_goal_level';
  END IF;

  IF has_function_privilege('authenticated', 'public.move_jarvis_goal_task(uuid, text)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'authenticated must execute move_jarvis_goal_task';
  END IF;

  IF has_function_privilege('anon', 'public.move_jarvis_goal_level(uuid, text)', 'EXECUTE') IS NOT FALSE THEN
    RAISE EXCEPTION 'anon must not execute move_jarvis_goal_level';
  END IF;

  IF has_function_privilege('anon', 'public.move_jarvis_goal_task(uuid, text)', 'EXECUTE') IS NOT FALSE THEN
    RAISE EXCEPTION 'anon must not execute move_jarvis_goal_task';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(
      COALESCE(p.proacl, acldefault('f', p.proowner))
    ) AS acl
    WHERE p.oid IN (
      'public.move_jarvis_goal_level(uuid, text)'::regprocedure,
      'public.move_jarvis_goal_task(uuid, text)'::regprocedure
    )
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PUBLIC must not execute reorder RPCs';
  END IF;

  IF has_function_privilege('authenticated', 'jarvis_internal.reconcile_jarvis_goal_completion(uuid)', 'EXECUTE') IS NOT FALSE THEN
    RAISE EXCEPTION 'internal reconcile must remain inaccessible to authenticated';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  result := public.move_jarvis_goal_level(level_2, 'up');
  IF (result->>'success')::boolean IS NOT FALSE OR result->>'code' <> 'unauthenticated' THEN
    RAISE EXCEPTION 'expected unauthenticated level move rejection';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
  result := public.move_jarvis_goal_level(level_2, 'up');
  IF result->>'code' <> 'level_not_found' THEN
    RAISE EXCEPTION 'expected cross-user level move rejection';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  result := public.move_jarvis_goal_level(level_2, 'sideways');
  IF result->>'code' <> 'invalid_direction' THEN
    RAISE EXCEPTION 'expected invalid direction on level move';
  END IF;

  UPDATE public.jarvis_goals SET status = 'archived' WHERE id = v_goal_id;
  result := public.move_jarvis_goal_level(level_2, 'up');
  IF result->>'code' <> 'goal_archived' THEN
    RAISE EXCEPTION 'expected archived level move rejection';
  END IF;

  UPDATE public.jarvis_goals SET status = 'active' WHERE id = v_goal_id;
  UPDATE public.jarvis_goals SET status = 'completed', completed_at = now() WHERE id = v_goal_id;
  result := public.move_jarvis_goal_level(level_2, 'up');
  IF result->>'code' <> 'goal_completed' THEN
    RAISE EXCEPTION 'expected completed level move rejection';
  END IF;

  UPDATE public.jarvis_goals SET status = 'active', completed_at = NULL WHERE id = v_goal_id;

  result := public.move_jarvis_goal_level(level_1, 'up');
  IF result->>'code' <> 'already_first' THEN
    RAISE EXCEPTION 'expected already_first on first level up';
  END IF;

  IF (SELECT position FROM public.jarvis_goal_levels WHERE id = level_1) <> 10 THEN
    RAISE EXCEPTION 'already_first must not change positions';
  END IF;

  result := public.move_jarvis_goal_level(level_3, 'down');
  IF result->>'code' <> 'already_last' THEN
    RAISE EXCEPTION 'expected already_last on last level down';
  END IF;

  result := public.move_jarvis_goal_level(level_3, 'up');
  IF result->>'code' <> 'moved' THEN
    RAISE EXCEPTION 'expected level move up success';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_goal_levels
    WHERE id = level_3 AND position = 20
  ) OR NOT EXISTS (
    SELECT 1 FROM public.jarvis_goal_levels
    WHERE id = level_2 AND position = 30
  ) THEN
    RAISE EXCEPTION 'expected adjacent level position swap without renumbering';
  END IF;

  IF (
    SELECT array_agg(position ORDER BY position)
    FROM public.jarvis_goal_levels
    WHERE goal_id = v_goal_id AND user_id = user_a
  ) <> ARRAY[10, 20, 30] THEN
    RAISE EXCEPTION 'level position numeric set must remain 10/20/30';
  END IF;

  IF (SELECT title FROM public.tasks WHERE id = task_a) <> 'Task A'
     OR (SELECT status FROM public.tasks WHERE id = task_c) <> 'done' THEN
    RAISE EXCEPTION 'level reorder must not mutate tasks';
  END IF;

  result := public.move_jarvis_goal_task(task_b, 'invalid');
  IF result->>'code' <> 'invalid_direction' THEN
    RAISE EXCEPTION 'expected invalid direction on task move';
  END IF;

  result := public.move_jarvis_goal_task(task_a, 'up');
  IF result->>'code' <> 'already_first' THEN
    RAISE EXCEPTION 'expected already_first on first task up';
  END IF;

  SELECT title, status, priority, notes, blocked_at, blocked_reason, completed_at, goal_id, goal_level_id
  INTO snap_title, snap_status, snap_priority, snap_notes, snap_blocked_at, snap_blocked_reason, snap_completed_at, snap_goal_id, snap_level_id
  FROM public.tasks
  WHERE id = task_d;

  result := public.move_jarvis_goal_task(task_d, 'up');
  IF result->>'code' <> 'moved' THEN
    RAISE EXCEPTION 'expected blocked task move up success';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tasks WHERE id = task_d AND position = 10
  ) OR NOT EXISTS (
    SELECT 1 FROM public.tasks WHERE id = task_c AND position = 20
  ) THEN
    RAISE EXCEPTION 'expected adjacent task position swap';
  END IF;

  IF (
    SELECT array_agg(position ORDER BY position)
    FROM public.tasks
    WHERE goal_level_id = level_2 AND goal_id = v_goal_id AND user_id = user_a
  ) <> ARRAY[10, 20] THEN
    RAISE EXCEPTION 'task position numeric set must remain 10/20';
  END IF;

  IF (SELECT title FROM public.tasks WHERE id = task_d) <> snap_title
     OR (SELECT status FROM public.tasks WHERE id = task_d) <> snap_status
     OR (SELECT priority FROM public.tasks WHERE id = task_d) <> snap_priority
     OR (SELECT notes FROM public.tasks WHERE id = task_d) IS DISTINCT FROM snap_notes
     OR (SELECT blocked_at FROM public.tasks WHERE id = task_d) IS DISTINCT FROM snap_blocked_at
     OR (SELECT blocked_reason FROM public.tasks WHERE id = task_d) IS DISTINCT FROM snap_blocked_reason
     OR (SELECT completed_at FROM public.tasks WHERE id = task_d) IS DISTINCT FROM snap_completed_at
     OR (SELECT goal_id FROM public.tasks WHERE id = task_d) <> snap_goal_id
     OR (SELECT goal_level_id FROM public.tasks WHERE id = task_d) <> snap_level_id THEN
    RAISE EXCEPTION 'task reorder must not mutate non-position fields';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_profiles
    WHERE user_id = user_a AND today_priority_goal_id = v_goal_id
  ) THEN
    RAISE EXCEPTION 'today priority must remain unchanged after reorder';
  END IF;

  IF (SELECT current_focus FROM public.jarvis_profiles WHERE user_id = user_a) <> original_focus THEN
    RAISE EXCEPTION 'current_focus must remain unchanged';
  END IF;

  RAISE NOTICE 'jarvis goal reorder validation passed';
END;
$validate$;
