-- Local validation for jarvis goal task security hardening (run against local Supabase DB).
-- Example:
--   npx supabase db reset --local
--   docker exec -i supabase_db_parker-jarvis psql -U postgres -d postgres < supabase/tests/jarvis_goal_task_security_validation.sql
-- PostgREST-like identity proof (session_user = authenticator):
--   docker exec -e PGPASSWORD=postgres -i supabase_db_parker-jarvis psql -h 127.0.0.1 -U authenticator -d postgres < supabase/tests/jarvis_goal_task_security_identity_validation.sql

DO $validate$
DECLARE
  user_a uuid := '12121212-1212-1212-1212-121212121212';
  user_b uuid := '13131313-1313-1313-1313-131313131313';
  goal_id uuid;
  level_1 uuid;
  level_2 uuid;
  goal_task uuid;
  goal_task_b uuid;
  standalone uuid;
  project_id uuid;
  life_area_id uuid;
  result jsonb;
  original_focus text;
  proc_row record;
BEGIN
  INSERT INTO auth.users (id) VALUES (user_a), (user_b)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.jarvis_profiles (user_id, current_focus)
  VALUES (user_a, 'Keep shipping'), (user_b, 'Other focus')
  ON CONFLICT (user_id) DO UPDATE SET current_focus = EXCLUDED.current_focus;

  SELECT current_focus
  INTO original_focus
  FROM public.jarvis_profiles
  WHERE user_id = user_a;

  DELETE FROM public.tasks WHERE user_id IN (user_a, user_b);
  DELETE FROM public.jarvis_goal_levels WHERE user_id IN (user_a, user_b);
  DELETE FROM public.jarvis_goals WHERE user_id IN (user_a, user_b);

  INSERT INTO public.jarvis_goals (user_id, title, goal_type, domain)
  VALUES (user_a, 'Security goal', 'short_term', 'personal')
  RETURNING id INTO goal_id;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, goal_id, 'Level 1', 10)
  RETURNING id INTO level_1;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, goal_id, 'Level 2', 20)
  RETURNING id INTO level_2;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position, notes)
  VALUES (user_a, 'Goal task', goal_id, level_1, 10, 'keep-notes')
  RETURNING id INTO goal_task;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
  VALUES (user_a, 'Goal task B', goal_id, level_1, 20)
  RETURNING id INTO goal_task_b;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
  VALUES (user_a, 'Level 2 anchor', goal_id, level_2, 10);

  INSERT INTO public.tasks (user_id, title)
  VALUES (user_a, 'Standalone task')
  RETURNING id INTO standalone;

  UPDATE public.jarvis_profiles
  SET today_priority_goal_id = goal_id
  WHERE user_id = user_a;

  SELECT id INTO life_area_id
  FROM public.life_areas
  WHERE user_id = user_a
  LIMIT 1;

  IF life_area_id IS NULL THEN
    INSERT INTO public.life_areas (user_id, name, active)
    VALUES (user_a, 'Personal', true)
    RETURNING id INTO life_area_id;
  END IF;

  INSERT INTO public.projects (user_id, life_area_id, name, status, priority)
  VALUES (user_a, life_area_id, 'Security project', 'active', 'medium')
  RETURNING id INTO project_id;

  -- Security: create RPC is SECURITY DEFINER with hardened search_path and grants.
  SELECT p.prosecdef, pg_get_userbyid(p.proowner) AS owner
  INTO proc_row
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'create_jarvis_goal_with_roadmap';

  IF proc_row.prosecdef IS NOT TRUE THEN
    RAISE EXCEPTION 'create_jarvis_goal_with_roadmap must be SECURITY DEFINER';
  END IF;

  IF proc_row.owner <> 'postgres' THEN
    RAISE EXCEPTION 'create_jarvis_goal_with_roadmap owner must be postgres';
  END IF;

  IF position('SET search_path TO' in pg_get_functiondef(
    'public.create_jarvis_goal_with_roadmap(text, text, text, text, jsonb)'::regprocedure
  )) = 0 THEN
    RAISE EXCEPTION 'create_jarvis_goal_with_roadmap must harden search_path';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.create_jarvis_goal_with_roadmap(text, text, text, text, jsonb)',
    'EXECUTE'
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'authenticated must execute create_jarvis_goal_with_roadmap';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.create_jarvis_goal_with_roadmap(text, text, text, text, jsonb)',
    'EXECUTE'
  ) IS NOT FALSE THEN
    RAISE EXCEPTION 'anon must not execute create_jarvis_goal_with_roadmap';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(
      COALESCE(p.proacl, acldefault('f', p.proowner))
    ) AS acl
    WHERE p.oid = 'public.create_jarvis_goal_with_roadmap(text, text, text, text, jsonb)'::regprocedure
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PUBLIC must not execute create_jarvis_goal_with_roadmap';
  END IF;

  IF pg_has_role('authenticated', 'postgres', 'member') THEN
    RAISE EXCEPTION 'authenticated must not impersonate postgres';
  END IF;

  IF to_regprocedure('public.protect_jarvis_goal_task_mutations()') IS NULL THEN
    RAISE EXCEPTION 'protect_jarvis_goal_task_mutations trigger function must exist';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- 1-2. Direct auth standalone/project INSERT succeeds.
  SET LOCAL ROLE authenticated;
  INSERT INTO public.tasks (user_id, title)
  VALUES (user_a, 'Standalone via auth');
  INSERT INTO public.tasks (user_id, title, project_id, life_area_id)
  VALUES (user_a, 'Project via auth', project_id, life_area_id);
  RESET ROLE;

  -- 3-4. Direct auth goal attachment INSERT fails.
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
    VALUES (user_a, 'Injected', goal_id, level_1, 99);
    RESET ROLE;
    RAISE EXCEPTION 'expected goal_id direct insert rejection';
  EXCEPTION
    WHEN OTHERS THEN
      RESET ROLE;
      IF SQLERRM NOT LIKE '%goal_task_insert_requires_rpc%' THEN
        RAISE EXCEPTION 'expected goal_task_insert_requires_rpc, got %', SQLERRM;
      END IF;
  END;

  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.tasks (user_id, title, goal_level_id, position)
    VALUES (user_a, 'Injected level only', level_1, 98);
    RESET ROLE;
    RAISE EXCEPTION 'expected goal_level_id direct insert rejection';
  EXCEPTION
    WHEN OTHERS THEN
      RESET ROLE;
      IF SQLERRM NOT LIKE '%goal_task_insert_requires_rpc%' THEN
        RAISE EXCEPTION 'expected goal_task_insert_requires_rpc for level-only insert, got %', SQLERRM;
      END IF;
  END;

  -- 5-8. Attachment UPDATE immutability.
  BEGIN
    EXECUTE 'UPDATE public.tasks SET goal_id = $1, goal_level_id = $2 WHERE id = $3'
    USING goal_id, level_1, standalone;
    RAISE EXCEPTION 'expected standalone attachment rejection';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%goal_task_attachment_immutable%' THEN
        RAISE EXCEPTION 'expected goal_task_attachment_immutable for standalone attach, got %', SQLERRM;
      END IF;
  END;

  BEGIN
    UPDATE public.tasks SET goal_id = NULL, goal_level_id = NULL WHERE id = goal_task;
    RAISE EXCEPTION 'expected goal detach rejection';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%goal_task_attachment_immutable%' THEN
        RAISE EXCEPTION 'expected goal_task_attachment_immutable for detach, got %', SQLERRM;
      END IF;
  END;

  BEGIN
    UPDATE public.tasks SET goal_level_id = level_2 WHERE id = goal_task;
    RAISE EXCEPTION 'expected level reassignment rejection';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%goal_task_attachment_immutable%' THEN
        RAISE EXCEPTION 'expected goal_task_attachment_immutable for level reassignment, got %', SQLERRM;
      END IF;
  END;

  -- 9. Attachment immutability during trusted postgres context.
  BEGIN
    UPDATE public.tasks SET goal_level_id = level_2 WHERE id = goal_task;
    RAISE EXCEPTION 'expected trusted attachment rejection';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%goal_task_attachment_immutable%' THEN
        RAISE EXCEPTION 'expected attachment immutability under postgres, got %', SQLERRM;
      END IF;
  END;

  -- 10-12. Direct auth goal-task protected column updates fail.
  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.tasks SET status = 'done' WHERE id = goal_task;
    RESET ROLE;
    RAISE EXCEPTION 'expected direct status rejection';
  EXCEPTION
    WHEN OTHERS THEN
      RESET ROLE;
      IF SQLERRM NOT LIKE '%goal_task_completion_requires_rpc%' THEN
        RAISE EXCEPTION 'expected goal_task_completion_requires_rpc for status, got %', SQLERRM;
      END IF;
  END;

  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.tasks SET completed_at = now() WHERE id = goal_task;
    RESET ROLE;
    RAISE EXCEPTION 'expected direct completed_at rejection';
  EXCEPTION
    WHEN OTHERS THEN
      RESET ROLE;
      IF SQLERRM NOT LIKE '%goal_task_completion_requires_rpc%' THEN
        RAISE EXCEPTION 'expected goal_task_completion_requires_rpc for completed_at, got %', SQLERRM;
      END IF;
  END;

  BEGIN
    SET LOCAL ROLE authenticated;
    UPDATE public.tasks SET position = 99 WHERE id = goal_task;
    RESET ROLE;
    RAISE EXCEPTION 'expected direct position rejection';
  EXCEPTION
    WHEN OTHERS THEN
      RESET ROLE;
      IF SQLERRM NOT LIKE '%goal_task_position_requires_rpc%' THEN
        RAISE EXCEPTION 'expected goal_task_position_requires_rpc, got %', SQLERRM;
      END IF;
  END;

  -- 13-15. Direct auth metadata edits succeed.
  SET LOCAL ROLE authenticated;
  UPDATE public.tasks SET title = 'Renamed goal task' WHERE id = goal_task;
  UPDATE public.tasks SET notes = 'Updated notes' WHERE id = goal_task;
  UPDATE public.tasks
  SET blocked_at = now(), blocked_reason = 'Waiting'
  WHERE id = goal_task;
  RESET ROLE;

  IF NOT EXISTS (
    SELECT 1 FROM public.tasks
    WHERE id = goal_task
      AND title = 'Renamed goal task'
      AND notes = 'Updated notes'
      AND blocked_reason = 'Waiting'
      AND blocked_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'expected direct metadata edits to persist';
  END IF;

  -- 16-17. DELETE rules.
  BEGIN
    SET LOCAL ROLE authenticated;
    DELETE FROM public.tasks WHERE id = goal_task_b;
    RESET ROLE;
    RAISE EXCEPTION 'expected direct goal-task delete rejection';
  EXCEPTION
    WHEN OTHERS THEN
      RESET ROLE;
      IF SQLERRM NOT LIKE '%goal_task_delete_requires_rpc%' THEN
        RAISE EXCEPTION 'expected goal_task_delete_requires_rpc, got %', SQLERRM;
      END IF;
  END;

  SET LOCAL ROLE authenticated;
  DELETE FROM public.tasks WHERE id = standalone;
  RESET ROLE;

  IF EXISTS (SELECT 1 FROM public.tasks WHERE id = standalone) THEN
    RAISE EXCEPTION 'standalone delete should remain allowed';
  END IF;

  INSERT INTO public.tasks (user_id, title)
  VALUES (user_a, 'Standalone completion')
  RETURNING id INTO standalone;

  -- 18. Standalone completion via direct auth still succeeds.
  SET LOCAL ROLE authenticated;
  UPDATE public.tasks
  SET status = 'done', completed_at = now()
  WHERE id = standalone;
  RESET ROLE;

  IF NOT EXISTS (
    SELECT 1 FROM public.tasks WHERE id = standalone AND status = 'done'
  ) THEN
    RAISE EXCEPTION 'expected standalone direct completion';
  END IF;

  -- 19. create_jarvis_goal_with_roadmap succeeds under authenticated caller context.
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  SET LOCAL ROLE authenticated;
  result := public.create_jarvis_goal_with_roadmap(
    'Created via RPC',
    'desc',
    'short_term',
    'personal',
    jsonb_build_array(
      jsonb_build_object(
        'name', 'RPC Level',
        'tasks', jsonb_build_array('RPC task one', 'RPC task two')
      )
    )
  );
  RESET ROLE;

  IF coalesce(result->>'success', 'false') <> 'true' THEN
    RAISE EXCEPTION 'create_jarvis_goal_with_roadmap failed: %', result;
  END IF;

  SELECT gl.id
  INTO level_1
  FROM public.jarvis_goal_levels gl
  WHERE gl.goal_id = (result->>'goal_id')::uuid
  ORDER BY gl.position ASC
  LIMIT 1;

  -- 20-21. add task/level RPCs succeed.
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  result := public.add_jarvis_goal_task(level_1, 'Added later');
  IF coalesce(result->>'success', 'false') <> 'true' THEN
    RAISE EXCEPTION 'add_jarvis_goal_task failed: %', result;
  END IF;

  result := public.add_jarvis_goal_level(
    (result->>'goal_id')::uuid,
    'Added level',
    'First added task'
  );
  IF coalesce(result->>'success', 'false') <> 'true' THEN
    RAISE EXCEPTION 'add_jarvis_goal_level failed: %', result;
  END IF;

  -- 22-23. completion + reopen on original security goal.
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  result := public.set_jarvis_goal_task_completion(goal_task, true);
  IF coalesce(result->>'success', 'false') <> 'true' THEN
    RAISE EXCEPTION 'goal completion failed: %', result;
  END IF;

  result := public.set_jarvis_goal_task_completion(goal_task, false);
  IF coalesce(result->>'success', 'false') <> 'true' THEN
    RAISE EXCEPTION 'goal reopen failed: %', result;
  END IF;

  -- 24. move/reorder succeeds.
  result := public.move_jarvis_goal_task(goal_task_b, 'up');
  IF coalesce(result->>'success', 'false') <> 'true' THEN
    RAISE EXCEPTION 'move_jarvis_goal_task failed: %', result;
  END IF;

  -- 25. delete goal task when legal.
  result := public.add_jarvis_goal_task(level_1, 'Delete candidate');
  IF coalesce(result->>'success', 'false') <> 'true' THEN
    RAISE EXCEPTION 'add delete candidate failed: %', result;
  END IF;

  result := public.delete_jarvis_goal_task((result->>'task_id')::uuid);
  IF coalesce(result->>'success', 'false') <> 'true' THEN
    RAISE EXCEPTION 'delete_jarvis_goal_task failed: %', result;
  END IF;

  -- 26. delete level when legal (requires >=2 levels and tasks only on deleted level).
  SELECT gl.id
  INTO level_2
  FROM public.jarvis_goal_levels gl
  INNER JOIN public.jarvis_goals jg ON jg.id = gl.goal_id
  WHERE jg.user_id = user_a
    AND jg.title = 'Security goal'
  ORDER BY gl.position DESC
  LIMIT 1;

  DELETE FROM public.tasks
  WHERE goal_level_id = level_2
    AND user_id = user_a;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
  VALUES (user_a, 'Only level-2 task', goal_id, level_2, 10);

  result := public.delete_jarvis_goal_level(level_2);
  IF coalesce(result->>'success', 'false') <> 'true' THEN
    RAISE EXCEPTION 'delete_jarvis_goal_level failed: %', result;
  END IF;

  -- 35-37. current_focus untouched and reconciliation still works.
  IF EXISTS (
    SELECT 1
    FROM public.jarvis_profiles
    WHERE user_id = user_a
      AND current_focus IS DISTINCT FROM original_focus
  ) THEN
    RAISE EXCEPTION 'current_focus must remain unchanged';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tasks
    WHERE id = goal_task
      AND status = 'todo'
  ) THEN
    RAISE EXCEPTION 'expected reopened goal task to remain todo after RPC reopen';
  END IF;

  RAISE NOTICE 'jarvis goal task security validation passed';
END;
$validate$;
