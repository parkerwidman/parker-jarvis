-- Local validation for jarvis goal visibility safety (run against local Supabase DB).
-- Example: docker exec -i supabase_db_parker-jarvis psql -U postgres -d postgres < supabase/tests/jarvis_goal_visibility_safety_validation.sql

DO $validate$
DECLARE
  user_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  user_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  goal_active uuid;
  goal_completed uuid;
  goal_archived uuid;
  goal_other uuid;
  level_active uuid;
  level_completed uuid;
  level_archived uuid;
  task_standalone uuid;
  task_active uuid;
  task_completed uuid;
  task_archived_open uuid;
  task_archived_done uuid;
  task_other uuid;
  original_focus text;
  result jsonb;
BEGIN
  INSERT INTO auth.users (id) VALUES (user_a), (user_b)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.jarvis_profiles (user_id, current_focus)
  VALUES (user_a, 'Keep shipping'), (user_b, 'Other focus')
  ON CONFLICT (user_id) DO UPDATE
    SET current_focus = EXCLUDED.current_focus;

  SELECT current_focus INTO original_focus
  FROM public.jarvis_profiles
  WHERE user_id = user_a;

  INSERT INTO public.jarvis_goals (user_id, title, goal_type, domain, status)
  VALUES (user_a, 'Active goal', 'short_term', 'personal', 'active')
  RETURNING id INTO goal_active;

  INSERT INTO public.jarvis_goals (user_id, title, goal_type, domain, status, completed_at)
  VALUES (user_a, 'Completed goal', 'short_term', 'personal', 'completed', now())
  RETURNING id INTO goal_completed;

  INSERT INTO public.jarvis_goals (user_id, title, goal_type, domain, status)
  VALUES (user_a, 'Archived goal', 'short_term', 'personal', 'archived')
  RETURNING id INTO goal_archived;

  INSERT INTO public.jarvis_goals (user_id, title, goal_type, domain, status)
  VALUES (user_b, 'Other user goal', 'short_term', 'personal', 'active')
  RETURNING id INTO goal_other;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, goal_active, 'Active level', 10)
  RETURNING id INTO level_active;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, goal_completed, 'Completed level', 10)
  RETURNING id INTO level_completed;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, goal_archived, 'Archived level', 10)
  RETURNING id INTO level_archived;

  INSERT INTO public.tasks (user_id, title)
  VALUES (user_a, 'Standalone task')
  RETURNING id INTO task_standalone;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position, status)
  VALUES (user_a, 'Active goal task', goal_active, level_active, 10, 'todo')
  RETURNING id INTO task_active;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position, status, completed_at)
  VALUES (user_a, 'Completed goal task', goal_completed, level_completed, 10, 'done', now())
  RETURNING id INTO task_completed;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position, status)
  VALUES (user_a, 'Archived open task', goal_archived, level_archived, 10, 'todo')
  RETURNING id INTO task_archived_open;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position, status, completed_at)
  VALUES (user_a, 'Archived done task', goal_archived, level_archived, 20, 'done', now())
  RETURNING id INTO task_archived_done;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position, status)
  VALUES (user_b, 'Other user task', goal_other, NULL, NULL, 'todo')
  RETURNING id INTO task_other;

  -- VIEW: standalone visible
  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_visible_tasks WHERE id = task_standalone
  ) THEN
    RAISE EXCEPTION 'standalone task must remain visible';
  END IF;

  -- VIEW: active-goal task visible
  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_visible_tasks WHERE id = task_active
  ) THEN
    RAISE EXCEPTION 'active-goal task must remain visible';
  END IF;

  -- VIEW: completed-goal task visible
  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_visible_tasks WHERE id = task_completed
  ) THEN
    RAISE EXCEPTION 'completed-goal task must remain visible';
  END IF;

  -- VIEW: archived unfinished hidden
  IF EXISTS (
    SELECT 1 FROM public.jarvis_visible_tasks WHERE id = task_archived_open
  ) THEN
    RAISE EXCEPTION 'archived unfinished task must be hidden';
  END IF;

  -- VIEW: archived completed hidden
  IF EXISTS (
    SELECT 1 FROM public.jarvis_visible_tasks WHERE id = task_archived_done
  ) THEN
    RAISE EXCEPTION 'archived completed task must be hidden';
  END IF;

  -- VIEW: underlying task rows remain intact
  IF NOT EXISTS (
    SELECT 1 FROM public.tasks
    WHERE id = task_archived_open
      AND goal_id = goal_archived
      AND status = 'todo'
  ) THEN
    RAISE EXCEPTION 'archived task row must remain intact in public.tasks';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tasks
    WHERE id = task_archived_done
      AND goal_id = goal_archived
      AND status = 'done'
  ) THEN
    RAISE EXCEPTION 'archived completed task row must remain intact in public.tasks';
  END IF;

  -- VIEW: cross-user visibility blocked under authenticated role
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  SET LOCAL ROLE authenticated;

  IF EXISTS (
    SELECT 1 FROM public.jarvis_visible_tasks WHERE id = task_other
  ) THEN
    RESET ROLE;
    RAISE EXCEPTION 'user A must not see user B tasks through jarvis_visible_tasks';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_visible_tasks WHERE id = task_standalone
  ) THEN
    RESET ROLE;
    RAISE EXCEPTION 'user A standalone task must remain visible under authenticated role';
  END IF;

  RESET ROLE;

  -- VIEW: no write privileges through the view
  IF has_table_privilege('authenticated', 'public.jarvis_visible_tasks', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated must not have INSERT on jarvis_visible_tasks';
  END IF;

  IF has_table_privilege('authenticated', 'public.jarvis_visible_tasks', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated must not have UPDATE on jarvis_visible_tasks';
  END IF;

  IF has_table_privilege('authenticated', 'public.jarvis_visible_tasks', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated must not have DELETE on jarvis_visible_tasks';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.jarvis_visible_tasks', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated must have SELECT on jarvis_visible_tasks';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.jarvis_visible_tasks', 'SELECT') THEN
    RAISE EXCEPTION 'service_role must have SELECT on jarvis_visible_tasks';
  END IF;

  -- TODAY PRIORITY: active short_term priority remains valid
  UPDATE public.jarvis_profiles
  SET today_priority_goal_id = goal_active
  WHERE user_id = user_a;

  UPDATE public.jarvis_goals
  SET title = 'Active goal renamed'
  WHERE id = goal_active;

  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_profiles
    WHERE user_id = user_a AND today_priority_goal_id = goal_active
  ) THEN
    RAISE EXCEPTION 'title-only goal update must not clear today priority';
  END IF;

  -- TODAY PRIORITY: short_term -> three_month clears priority
  UPDATE public.jarvis_profiles
  SET today_priority_goal_id = goal_active
  WHERE user_id = user_a;

  UPDATE public.jarvis_goals
  SET goal_type = 'three_month'
  WHERE id = goal_active;

  IF EXISTS (
    SELECT 1 FROM public.jarvis_profiles
    WHERE user_id = user_a AND today_priority_goal_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'short_term -> three_month must clear today priority';
  END IF;

  -- TODAY PRIORITY: short_term -> long_term clears priority
  UPDATE public.jarvis_goals
  SET goal_type = 'short_term'
  WHERE id = goal_active;

  UPDATE public.jarvis_profiles
  SET today_priority_goal_id = goal_active
  WHERE user_id = user_a;

  UPDATE public.jarvis_goals
  SET goal_type = 'long_term'
  WHERE id = goal_active;

  IF EXISTS (
    SELECT 1 FROM public.jarvis_profiles
    WHERE user_id = user_a AND today_priority_goal_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'short_term -> long_term must clear today priority';
  END IF;

  -- TODAY PRIORITY: active -> archived clears priority
  UPDATE public.jarvis_goals
  SET goal_type = 'short_term', status = 'active'
  WHERE id = goal_active;

  UPDATE public.jarvis_profiles
  SET today_priority_goal_id = goal_active
  WHERE user_id = user_a;

  UPDATE public.jarvis_goals
  SET status = 'archived'
  WHERE id = goal_active;

  IF EXISTS (
    SELECT 1 FROM public.jarvis_profiles
    WHERE user_id = user_a AND today_priority_goal_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'active -> archived must clear today priority';
  END IF;

  -- TODAY PRIORITY: direct active -> completed clears priority
  UPDATE public.jarvis_goals
  SET status = 'active', goal_type = 'short_term', completed_at = NULL
  WHERE id = goal_active;

  UPDATE public.jarvis_profiles
  SET today_priority_goal_id = goal_active
  WHERE user_id = user_a;

  UPDATE public.jarvis_goals
  SET status = 'completed', completed_at = now()
  WHERE id = goal_active;

  IF EXISTS (
    SELECT 1 FROM public.jarvis_profiles
    WHERE user_id = user_a AND today_priority_goal_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'active -> completed must clear today priority';
  END IF;

  -- TODAY PRIORITY: unrelated goal update does not clear another priority
  UPDATE public.jarvis_goals
  SET status = 'active', goal_type = 'short_term', completed_at = NULL
  WHERE id = goal_active;

  UPDATE public.jarvis_profiles
  SET today_priority_goal_id = goal_active
  WHERE user_id = user_a;

  UPDATE public.jarvis_goals
  SET title = 'Unrelated title change on completed goal'
  WHERE id = goal_completed;

  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_profiles
    WHERE user_id = user_a AND today_priority_goal_id = goal_active
  ) THEN
    RAISE EXCEPTION 'unrelated goal update must not clear another today priority';
  END IF;

  -- TODAY PRIORITY: NULL priority remains NULL/idempotent
  UPDATE public.jarvis_profiles
  SET today_priority_goal_id = NULL
  WHERE user_id = user_a;

  UPDATE public.jarvis_goals
  SET status = 'archived'
  WHERE id = goal_active;

  IF EXISTS (
    SELECT 1 FROM public.jarvis_profiles
    WHERE user_id = user_a AND today_priority_goal_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'archiving a non-priority goal must leave priority NULL';
  END IF;

  -- TODAY PRIORITY: current_focus untouched
  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_profiles
    WHERE user_id = user_a AND current_focus = original_focus
  ) THEN
    RAISE EXCEPTION 'today priority cleanup must not modify current_focus';
  END IF;

  -- TODAY PRIORITY: existing reconciliation completion behavior still works
  UPDATE public.jarvis_goals
  SET status = 'active', goal_type = 'short_term', completed_at = NULL
  WHERE id = goal_active;

  UPDATE public.jarvis_profiles
  SET today_priority_goal_id = goal_active
  WHERE user_id = user_a;

  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  result := public.set_jarvis_goal_task_completion(task_active, true);

  IF result->>'code' <> 'completed' THEN
    RAISE EXCEPTION 'expected completion RPC to still work, got %', result->>'code';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.jarvis_profiles
    WHERE user_id = user_a AND today_priority_goal_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'reconciliation completion must still clear today priority';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_goals
    WHERE id = goal_active AND status = 'completed' AND completed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'reconciliation completion must still complete the goal';
  END IF;

  -- DELETE: authenticated no longer has DELETE on jarvis_goals
  IF has_table_privilege('authenticated', 'public.jarvis_goals', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated must not have DELETE on jarvis_goals';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.jarvis_goals', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated must retain SELECT on jarvis_goals';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.jarvis_goals', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated must retain INSERT on jarvis_goals';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.jarvis_goals', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated must retain UPDATE on jarvis_goals';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.jarvis_goals', 'SELECT') THEN
    RAISE EXCEPTION 'service_role must retain SELECT on jarvis_goals';
  END IF;
END;
$validate$;
