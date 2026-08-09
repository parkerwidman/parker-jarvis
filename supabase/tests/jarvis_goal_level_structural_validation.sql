-- Local validation for jarvis goal level structural RPCs (run against local Supabase DB).
-- Example: docker exec -i supabase_db_parker-jarvis psql -U postgres -d postgres < supabase/tests/jarvis_goal_level_structural_validation.sql

DO $validate$
DECLARE
  user_a uuid := '55555555-5555-5555-5555-555555555555';
  user_b uuid := '66666666-6666-6666-6666-666666666666';
  v_goal_id uuid;
  level_1 uuid;
  level_2 uuid;
  level_3 uuid;
  new_level uuid;
  new_task uuid;
  result jsonb;
  original_focus text;
  task_count integer;
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
  VALUES (user_a, 'Active level structural goal', 'short_term', 'personal')
  RETURNING id INTO v_goal_id;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, v_goal_id, 'Level 1', 10)
  RETURNING id INTO level_1;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, v_goal_id, 'Level 2', 20)
  RETURNING id INTO level_2;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, v_goal_id, 'Locked Level', 30)
  RETURNING id INTO level_3;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
  VALUES (user_a, 'Task A', v_goal_id, level_1, 10);

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
  VALUES (user_a, 'Task B', v_goal_id, level_1, 20);

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position, status, completed_at)
  VALUES (user_a, 'Task C', v_goal_id, level_2, 10, 'done', now());

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
  VALUES (user_a, 'Task D', v_goal_id, level_2, 20);

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
  VALUES (user_a, 'Locked Task', v_goal_id, level_3, 10);

  UPDATE public.jarvis_profiles
  SET today_priority_goal_id = v_goal_id
  WHERE user_id = user_a;

  IF has_function_privilege('authenticated', 'public.add_jarvis_goal_level(uuid, text, text)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'authenticated must execute add_jarvis_goal_level';
  END IF;

  IF has_function_privilege('authenticated', 'public.delete_jarvis_goal_level(uuid)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'authenticated must execute delete_jarvis_goal_level';
  END IF;

  IF has_function_privilege('anon', 'public.add_jarvis_goal_level(uuid, text, text)', 'EXECUTE') IS NOT FALSE THEN
    RAISE EXCEPTION 'anon must not execute add_jarvis_goal_level';
  END IF;

  IF has_function_privilege('anon', 'public.delete_jarvis_goal_level(uuid)', 'EXECUTE') IS NOT FALSE THEN
    RAISE EXCEPTION 'anon must not execute delete_jarvis_goal_level';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(
      COALESCE(p.proacl, acldefault('f', p.proowner))
    ) AS acl
    WHERE p.oid IN (
      'public.add_jarvis_goal_level(uuid, text, text)'::regprocedure,
      'public.delete_jarvis_goal_level(uuid)'::regprocedure
    )
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PUBLIC must not execute structural goal level RPCs';
  END IF;

  IF has_function_privilege('authenticated', 'jarvis_internal.reconcile_jarvis_goal_completion(uuid)', 'EXECUTE') IS NOT FALSE THEN
    RAISE EXCEPTION 'internal reconcile must remain inaccessible to authenticated';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  result := public.add_jarvis_goal_level(v_goal_id, 'New level', 'First task');
  IF (result->>'success')::boolean IS NOT FALSE OR result->>'code' <> 'unauthenticated' THEN
    RAISE EXCEPTION 'expected unauthenticated add rejection';
  END IF;

  result := public.delete_jarvis_goal_level(level_3);
  IF (result->>'success')::boolean IS NOT FALSE OR result->>'code' <> 'unauthenticated' THEN
    RAISE EXCEPTION 'expected unauthenticated delete rejection';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
  result := public.add_jarvis_goal_level(v_goal_id, 'Cross user', 'Task');
  IF result->>'code' <> 'goal_not_found' THEN
    RAISE EXCEPTION 'expected cross-user add rejection';
  END IF;

  result := public.delete_jarvis_goal_level(level_3);
  IF result->>'code' <> 'level_not_found' THEN
    RAISE EXCEPTION 'expected cross-user delete rejection';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  result := public.add_jarvis_goal_level(v_goal_id, '   ', 'Task');
  IF result->>'code' <> 'invalid_level_name' THEN
    RAISE EXCEPTION 'expected blank level name rejection';
  END IF;

  result := public.add_jarvis_goal_level(v_goal_id, 'Level', '   ');
  IF result->>'code' <> 'invalid_task_title' THEN
    RAISE EXCEPTION 'expected blank task title rejection';
  END IF;

  UPDATE public.jarvis_goals SET status = 'archived' WHERE id = v_goal_id;
  result := public.add_jarvis_goal_level(v_goal_id, 'Archived level', 'Task');
  IF result->>'code' <> 'goal_archived' THEN
    RAISE EXCEPTION 'expected archived add rejection';
  END IF;

  result := public.delete_jarvis_goal_level(level_3);
  IF result->>'code' <> 'goal_archived' THEN
    RAISE EXCEPTION 'expected archived delete rejection';
  END IF;

  UPDATE public.jarvis_goals SET status = 'active', completed_at = NULL WHERE id = v_goal_id;

  UPDATE public.jarvis_goals
  SET status = 'completed', completed_at = now()
  WHERE id = v_goal_id;

  result := public.add_jarvis_goal_level(v_goal_id, 'Completed level', 'Task');
  IF result->>'code' <> 'goal_completed' THEN
    RAISE EXCEPTION 'expected completed add rejection';
  END IF;

  result := public.delete_jarvis_goal_level(level_3);
  IF result->>'code' <> 'goal_completed' THEN
    RAISE EXCEPTION 'expected completed delete rejection';
  END IF;

  UPDATE public.jarvis_goals
  SET status = 'active', completed_at = NULL
  WHERE id = v_goal_id;

  result := public.add_jarvis_goal_level(v_goal_id, '  Appended Level  ', '  First task  ');
  IF result->>'code' <> 'added' THEN
    RAISE EXCEPTION 'expected add level success';
  END IF;

  new_level := (result->>'level_id')::uuid;
  new_task := (result->>'task_id')::uuid;

  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_goal_levels gl
    WHERE gl.id = new_level
      AND gl.user_id = user_a
      AND gl.goal_id = v_goal_id
      AND gl.name = 'Appended Level'
      AND gl.position = 40
  ) THEN
    RAISE EXCEPTION 'expected append position 40 for new level';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = new_task
      AND t.user_id = user_a
      AND t.goal_id = v_goal_id
      AND t.goal_level_id = new_level
      AND t.title = 'First task'
      AND t.status = 'todo'
      AND t.priority = 'medium'
      AND t.position = 10
      AND t.completed_at IS NULL
      AND t.notes IS NULL
      AND t.blocked_at IS NULL
      AND t.blocked_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'expected atomic first task defaults on add level';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_profiles
    WHERE user_id = user_a AND today_priority_goal_id = v_goal_id
  ) THEN
    RAISE EXCEPTION 'expected today priority unchanged after add level';
  END IF;

  SELECT COUNT(*) INTO task_count
  FROM public.tasks
  WHERE goal_level_id = level_3
    AND goal_id = v_goal_id
    AND user_id = user_a;

  result := public.delete_jarvis_goal_level(level_3);
  IF result->>'code' <> 'deleted' THEN
    RAISE EXCEPTION 'expected locked level delete success';
  END IF;

  IF (result->>'deleted_task_count')::integer <> task_count THEN
    RAISE EXCEPTION 'expected deleted_task_count to match attached tasks';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tasks
    WHERE goal_level_id = level_3
      AND goal_id = v_goal_id
      AND user_id = user_a
  ) THEN
    RAISE EXCEPTION 'attached tasks must be removed before level delete completes';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.jarvis_goal_levels
    WHERE id = level_3
  ) THEN
    RAISE EXCEPTION 'deleted level row must be removed';
  END IF;

  UPDATE public.tasks
  SET status = 'done', completed_at = now()
  WHERE goal_level_id = level_2
    AND goal_id = v_goal_id
    AND user_id = user_a;

  UPDATE public.tasks
  SET status = 'done', completed_at = now()
  WHERE goal_level_id = level_1
    AND goal_id = v_goal_id
    AND user_id = user_a;

  UPDATE public.tasks
  SET status = 'done', completed_at = now()
  WHERE goal_level_id = new_level
    AND goal_id = v_goal_id
    AND user_id = user_a;

  result := public.delete_jarvis_goal_level(level_2);
  IF result->>'code' <> 'deleted' THEN
    RAISE EXCEPTION 'expected current level delete success';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_goals
    WHERE id = v_goal_id AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'expected goal completion after deleting final open level';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.jarvis_profiles
    WHERE user_id = user_a AND today_priority_goal_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'expected today priority cleared when delete completes goal';
  END IF;

  UPDATE public.jarvis_goals
  SET status = 'active', completed_at = NULL
  WHERE id = v_goal_id;

  UPDATE public.jarvis_profiles
  SET today_priority_goal_id = v_goal_id
  WHERE user_id = user_a;

  DELETE FROM public.tasks
  WHERE goal_id = v_goal_id AND goal_level_id <> level_1;

  DELETE FROM public.jarvis_goal_levels
  WHERE goal_id = v_goal_id AND id <> level_1;

  IF (
    SELECT COUNT(*)
    FROM public.jarvis_goal_levels
    WHERE goal_id = v_goal_id
      AND user_id = user_a
  ) <> 1 THEN
    RAISE EXCEPTION 'expected single level before sole-level rejection test';
  END IF;

  SELECT COUNT(*) INTO task_count
  FROM public.tasks
  WHERE goal_level_id = level_1
    AND goal_id = v_goal_id
    AND user_id = user_a;

  result := public.delete_jarvis_goal_level(level_1);
  IF result->>'code' <> 'last_level_in_goal' THEN
    RAISE EXCEPTION 'expected sole level delete rejection';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_goal_levels WHERE id = level_1
  ) THEN
    RAISE EXCEPTION 'sole level rejection must preserve level row';
  END IF;

  IF (SELECT COUNT(*) FROM public.tasks WHERE goal_level_id = level_1) <> task_count THEN
    RAISE EXCEPTION 'sole level rejection must preserve attached tasks';
  END IF;

  IF (SELECT current_focus FROM public.jarvis_profiles WHERE user_id = user_a) <> original_focus THEN
    RAISE EXCEPTION 'current_focus must remain unchanged';
  END IF;

  RAISE NOTICE 'jarvis goal level structural validation passed';
END;
$validate$;
