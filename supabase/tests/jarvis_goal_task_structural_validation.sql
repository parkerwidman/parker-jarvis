-- Local validation for jarvis goal task structural RPCs (run against local Supabase DB).
-- Example: docker exec -i supabase_db_parker-jarvis psql -U postgres -d postgres < supabase/tests/jarvis_goal_task_structural_validation.sql

DO $validate$
DECLARE
  user_a uuid := '33333333-3333-3333-3333-333333333333';
  user_b uuid := '44444444-4444-4444-4444-444444444444';
  v_goal_id uuid;
  level_1 uuid;
  level_2 uuid;
  locked_level uuid;
  task_a uuid;
  task_b uuid;
  task_c uuid;
  task_d uuid;
  standalone uuid;
  new_task uuid;
  added_task_id uuid;
  result jsonb;
  original_focus text;
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
  VALUES (user_a, 'Active structural goal', 'short_term', 'personal')
  RETURNING id INTO v_goal_id;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, v_goal_id, 'Level 1', 10)
  RETURNING id INTO level_1;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, v_goal_id, 'Level 2', 20)
  RETURNING id INTO level_2;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, v_goal_id, 'Locked Level', 30)
  RETURNING id INTO locked_level;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
  VALUES (user_a, 'Task A', v_goal_id, level_1, 10)
  RETURNING id INTO task_a;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
  VALUES (user_a, 'Task B', v_goal_id, level_1, 20)
  RETURNING id INTO task_b;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position, status, completed_at)
  VALUES (user_a, 'Task C', v_goal_id, level_2, 10, 'done', now())
  RETURNING id INTO task_c;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
  VALUES (user_a, 'Task D', v_goal_id, level_2, 20)
  RETURNING id INTO task_d;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
  VALUES (user_a, 'Locked Task', v_goal_id, locked_level, 10);

  INSERT INTO public.tasks (user_id, title)
  VALUES (user_a, 'Standalone')
  RETURNING id INTO standalone;

  UPDATE public.jarvis_profiles
  SET today_priority_goal_id = v_goal_id
  WHERE user_id = user_a;

  IF has_function_privilege('authenticated', 'public.add_jarvis_goal_task(uuid, text)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'authenticated must execute add_jarvis_goal_task';
  END IF;

  IF has_function_privilege('authenticated', 'public.delete_jarvis_goal_task(uuid)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'authenticated must execute delete_jarvis_goal_task';
  END IF;

  IF has_function_privilege('anon', 'public.add_jarvis_goal_task(uuid, text)', 'EXECUTE') IS NOT FALSE THEN
    RAISE EXCEPTION 'anon must not execute add_jarvis_goal_task';
  END IF;

  IF has_function_privilege('anon', 'public.delete_jarvis_goal_task(uuid)', 'EXECUTE') IS NOT FALSE THEN
    RAISE EXCEPTION 'anon must not execute delete_jarvis_goal_task';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(
      COALESCE(p.proacl, acldefault('f', p.proowner))
    ) AS acl
    WHERE p.oid IN (
      'public.add_jarvis_goal_task(uuid, text)'::regprocedure,
      'public.delete_jarvis_goal_task(uuid)'::regprocedure
    )
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PUBLIC must not execute structural goal task RPCs';
  END IF;

  IF has_function_privilege('authenticated', 'jarvis_internal.reconcile_jarvis_goal_completion(uuid)', 'EXECUTE') IS NOT FALSE THEN
    RAISE EXCEPTION 'internal reconcile must remain inaccessible to authenticated';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  result := public.add_jarvis_goal_task(level_1, 'New task');
  IF (result->>'success')::boolean IS NOT FALSE OR result->>'code' <> 'unauthenticated' THEN
    RAISE EXCEPTION 'expected unauthenticated add rejection';
  END IF;

  result := public.delete_jarvis_goal_task(task_a);
  IF (result->>'success')::boolean IS NOT FALSE OR result->>'code' <> 'unauthenticated' THEN
    RAISE EXCEPTION 'expected unauthenticated delete rejection';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
  result := public.add_jarvis_goal_task(level_1, 'Cross user');
  IF result->>'code' <> 'level_not_found' THEN
    RAISE EXCEPTION 'expected cross-user add rejection';
  END IF;

  result := public.delete_jarvis_goal_task(task_a);
  IF result->>'code' <> 'task_not_found' THEN
    RAISE EXCEPTION 'expected cross-user delete rejection';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  result := public.add_jarvis_goal_task(level_1, '   ');
  IF result->>'code' <> 'invalid_title' THEN
    RAISE EXCEPTION 'expected blank title rejection on add';
  END IF;

  UPDATE public.jarvis_goals SET status = 'archived' WHERE id = v_goal_id;
  result := public.add_jarvis_goal_task(level_1, 'Archived add');
  IF result->>'code' <> 'goal_archived' THEN
    RAISE EXCEPTION 'expected archived add rejection';
  END IF;

  result := public.delete_jarvis_goal_task(task_a);
  IF result->>'code' <> 'goal_archived' THEN
    RAISE EXCEPTION 'expected archived delete rejection';
  END IF;

  UPDATE public.jarvis_goals SET status = 'active', completed_at = NULL WHERE id = v_goal_id;

  UPDATE public.jarvis_goals
  SET status = 'completed', completed_at = now()
  WHERE id = v_goal_id;

  result := public.add_jarvis_goal_task(level_1, 'Completed add');
  IF result->>'code' <> 'goal_completed' THEN
    RAISE EXCEPTION 'expected completed add rejection';
  END IF;

  result := public.delete_jarvis_goal_task(task_a);
  IF result->>'code' <> 'goal_completed' THEN
    RAISE EXCEPTION 'expected completed delete rejection';
  END IF;

  UPDATE public.jarvis_goals
  SET status = 'active', completed_at = NULL
  WHERE id = v_goal_id;

  result := public.add_jarvis_goal_task(locked_level, 'Future task');
  IF result->>'code' <> 'added' THEN
    RAISE EXCEPTION 'expected locked level add success';
  END IF;

  new_task := (result->>'task_id')::uuid;

  IF NOT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = new_task
      AND t.user_id = user_a
      AND t.goal_id = v_goal_id
      AND t.goal_level_id = locked_level
      AND t.title = 'Future task'
      AND t.status = 'todo'
      AND t.priority = 'medium'
      AND t.completed_at IS NULL
      AND t.notes IS NULL
      AND t.blocked_at IS NULL
      AND t.blocked_reason IS NULL
      AND t.position = 20
  ) THEN
    RAISE EXCEPTION 'expected canonical defaults and append position 20 on locked level add';
  END IF;

  result := public.add_jarvis_goal_task(level_1, 'Third task');
  IF result->>'code' <> 'added' THEN
    RAISE EXCEPTION 'expected current level add success';
  END IF;

  added_task_id := (result->>'task_id')::uuid;

  IF NOT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.goal_level_id = level_1
      AND t.goal_id = v_goal_id
      AND t.user_id = user_a
      AND t.position = 30
  ) THEN
    RAISE EXCEPTION 'expected append MAX+10 position 30 on level with 10 and 20';
  END IF;

  result := public.delete_jarvis_goal_task(task_a);
  IF result->>'code' <> 'deleted' THEN
    RAISE EXCEPTION 'expected multi-task delete success';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tasks WHERE id = task_a) THEN
    RAISE EXCEPTION 'deleted task row must be removed';
  END IF;

  result := public.delete_jarvis_goal_task(added_task_id);
  IF result->>'code' <> 'deleted' THEN
    RAISE EXCEPTION 'expected second multi-task delete success';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tasks WHERE id = added_task_id) THEN
    RAISE EXCEPTION 'second deleted task row must be removed';
  END IF;

  result := public.delete_jarvis_goal_task(task_b);
  IF result->>'code' <> 'last_task_in_level' THEN
    RAISE EXCEPTION 'expected sole remaining task delete rejection';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE id = task_b) THEN
    RAISE EXCEPTION 'last task rejection must not delete row';
  END IF;

  UPDATE public.tasks
  SET status = 'done', completed_at = now()
  WHERE id = task_b;

  UPDATE public.tasks
  SET status = 'done', completed_at = now()
  WHERE goal_level_id = locked_level
    AND goal_id = v_goal_id
    AND user_id = user_a;

  UPDATE public.tasks
  SET status = 'done', completed_at = now()
  WHERE id = task_d;

  result := public.delete_jarvis_goal_task(task_d);
  IF result->>'code' <> 'deleted' THEN
    RAISE EXCEPTION 'expected done task delete success';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_goals
    WHERE id = v_goal_id AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'expected goal completion after deleting last open task in final level';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.jarvis_profiles
    WHERE user_id = user_a AND today_priority_goal_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'expected today priority cleared when delete completes goal';
  END IF;

  IF (SELECT current_focus FROM public.jarvis_profiles WHERE user_id = user_a) <> original_focus THEN
    RAISE EXCEPTION 'current_focus must remain unchanged';
  END IF;

  result := public.delete_jarvis_goal_task(standalone);
  IF result->>'code' <> 'not_goal_task' THEN
    RAISE EXCEPTION 'expected non-goal delete rejection';
  END IF;

  RAISE NOTICE 'jarvis goal task structural validation passed';
END;
$validate$;
