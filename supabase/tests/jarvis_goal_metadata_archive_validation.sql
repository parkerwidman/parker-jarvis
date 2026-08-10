-- Local validation for jarvis goal metadata/archive/restore RPCs.
-- Example: docker exec -i supabase_db_parker-jarvis psql -U postgres -d postgres < supabase/tests/jarvis_goal_metadata_archive_validation.sql

DO $validate$
DECLARE
  user_a uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  user_b uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  goal_active uuid;
  goal_completed uuid;
  goal_archived uuid;
  goal_other uuid;
  level_active uuid;
  level_completed uuid;
  level_restore uuid;
  task_active uuid;
  task_completed uuid;
  task_restore uuid;
  original_focus text;
  original_description text;
  original_sort_order integer;
  original_completed_at timestamp with time zone;
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

  INSERT INTO public.jarvis_goals (
    user_id, title, description, goal_type, domain, status, sort_order
  )
  VALUES (
    user_a, 'Active goal', 'Keep description', 'short_term', 'personal', 'active', 7
  )
  RETURNING id INTO goal_active;

  INSERT INTO public.jarvis_goals (
    user_id, title, description, goal_type, domain, status, sort_order, completed_at
  )
  VALUES (
    user_a, 'Completed goal', 'Done description', 'short_term', 'personal', 'completed', 3, now()
  )
  RETURNING id INTO goal_completed;

  INSERT INTO public.jarvis_goals (user_id, title, goal_type, domain, status)
  VALUES (user_a, 'Archived goal', 'short_term', 'personal', 'archived')
  RETURNING id INTO goal_archived;

  INSERT INTO public.jarvis_goals (user_id, title, goal_type, domain, status)
  VALUES (user_b, 'Other goal', 'short_term', 'personal', 'active')
  RETURNING id INTO goal_other;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, goal_active, 'Active level', 10)
  RETURNING id INTO level_active;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, goal_completed, 'Completed level', 10)
  RETURNING id INTO level_completed;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, goal_active, 'Restore level', 20)
  RETURNING id INTO level_restore;

  INSERT INTO public.tasks (
    user_id, title, goal_id, goal_level_id, position, status, notes, blocked_at, blocked_reason
  )
  VALUES (
    user_a, 'Active task', goal_active, level_active, 10, 'todo', 'keep-note', now(), 'waiting'
  )
  RETURNING id INTO task_active;

  INSERT INTO public.tasks (
    user_id, title, goal_id, goal_level_id, position, status, completed_at
  )
  VALUES (
    user_a, 'Completed task', goal_completed, level_completed, 10, 'done', now()
  )
  RETURNING id INTO task_completed;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position, status)
  VALUES (user_a, 'Restore task', goal_active, level_restore, 10, 'todo')
  RETURNING id INTO task_restore;

  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);

  -- METADATA: active title edit + trim
  result := public.update_jarvis_goal_metadata(goal_active, '  Renamed goal  ', NULL, NULL);
  IF result->>'code' <> 'updated' OR result->>'title' <> 'Renamed goal' THEN
    RAISE EXCEPTION 'active title edit failed';
  END IF;

  result := public.update_jarvis_goal_metadata(goal_active, '   ', NULL, NULL);
  IF result->>'code' <> 'invalid_title' THEN
    RAISE EXCEPTION 'empty title must be rejected';
  END IF;

  result := public.update_jarvis_goal_metadata(
    goal_active,
    repeat('x', 201),
    NULL,
    NULL
  );
  IF result->>'code' <> 'invalid_title' THEN
    RAISE EXCEPTION 'overlong title must be rejected';
  END IF;

  result := public.update_jarvis_goal_metadata(goal_active, NULL, 'melusi', NULL);
  IF result->>'code' <> 'updated' OR result->>'domain' <> 'melusi' THEN
    RAISE EXCEPTION 'active domain change failed';
  END IF;

  result := public.update_jarvis_goal_metadata(goal_active, NULL, NULL, 'three_month');
  IF result->>'code' <> 'updated' OR result->>'goal_type' <> 'three_month' THEN
    RAISE EXCEPTION 'active horizon change failed';
  END IF;

  result := public.update_jarvis_goal_metadata(goal_completed, 'Completed rename', NULL, NULL);
  IF result->>'code' <> 'updated' THEN
    RAISE EXCEPTION 'completed title edit failed';
  END IF;

  result := public.update_jarvis_goal_metadata(goal_completed, NULL, 'melusi', NULL);
  IF result->>'code' <> 'updated' OR result->>'domain' <> 'melusi' THEN
    RAISE EXCEPTION 'completed domain change failed';
  END IF;

  result := public.update_jarvis_goal_metadata(goal_completed, NULL, NULL, 'long_term');
  IF result->>'code' <> 'updated' OR result->>'goal_type' <> 'long_term' THEN
    RAISE EXCEPTION 'completed horizon change failed';
  END IF;

  result := public.update_jarvis_goal_metadata(goal_archived, 'Nope', NULL, NULL);
  IF result->>'code' <> 'goal_archived' THEN
    RAISE EXCEPTION 'archived metadata edit must be rejected';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
  result := public.update_jarvis_goal_metadata(goal_active, 'Cross user', NULL, NULL);
  IF result->>'code' <> 'goal_not_found' THEN
    RAISE EXCEPTION 'cross-user metadata edit must be rejected';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);

  SELECT description, sort_order
  INTO original_description, original_sort_order
  FROM public.jarvis_goals
  WHERE id = goal_active;

  result := public.update_jarvis_goal_metadata(goal_active, 'Only title', NULL, NULL);
  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_goals
    WHERE id = goal_active
      AND title = 'Only title'
      AND description = original_description
      AND sort_order = original_sort_order
      AND domain = 'melusi'
      AND goal_type = 'three_month'
  ) THEN
    RAISE EXCEPTION 'untouched metadata fields must remain unchanged';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_profiles
    WHERE user_id = user_a AND current_focus = original_focus
  ) THEN
    RAISE EXCEPTION 'metadata edit must not modify current_focus';
  END IF;

  -- PRIORITY: title/domain preserve, horizon clears
  UPDATE public.jarvis_goals
  SET goal_type = 'short_term', status = 'active'
  WHERE id = goal_active;

  UPDATE public.jarvis_profiles
  SET today_priority_goal_id = goal_active
  WHERE user_id = user_a;

  result := public.update_jarvis_goal_metadata(goal_active, 'Priority title', NULL, NULL);
  IF result->>'code' <> 'updated' THEN
    RAISE EXCEPTION 'title-only metadata edit failed under priority';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_profiles
    WHERE user_id = user_a AND today_priority_goal_id = goal_active
  ) THEN
    RAISE EXCEPTION 'title-only edit must preserve today priority';
  END IF;

  result := public.update_jarvis_goal_metadata(goal_active, NULL, 'personal', NULL);
  IF result->>'code' <> 'updated' THEN
    RAISE EXCEPTION 'domain-only metadata edit failed under priority';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_profiles
    WHERE user_id = user_a AND today_priority_goal_id = goal_active
  ) THEN
    RAISE EXCEPTION 'domain-only edit must preserve today priority';
  END IF;

  result := public.update_jarvis_goal_metadata(goal_active, NULL, NULL, 'three_month');
  IF result->>'code' <> 'updated' THEN
    RAISE EXCEPTION 'horizon metadata edit failed under priority';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.jarvis_profiles
    WHERE user_id = user_a AND today_priority_goal_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'short_term -> three_month must clear today priority';
  END IF;

  UPDATE public.jarvis_goals
  SET goal_type = 'short_term'
  WHERE id = goal_active;

  UPDATE public.jarvis_profiles
  SET today_priority_goal_id = goal_active
  WHERE user_id = user_a;

  result := public.update_jarvis_goal_metadata(goal_active, NULL, NULL, 'long_term');
  IF result->>'code' <> 'updated' THEN
    RAISE EXCEPTION 'long_term metadata edit failed under priority';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.jarvis_profiles
    WHERE user_id = user_a AND today_priority_goal_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'short_term -> long_term must clear today priority';
  END IF;

  -- ARCHIVE: active + completed
  UPDATE public.jarvis_goals
  SET goal_type = 'short_term', status = 'active', completed_at = NULL
  WHERE id = goal_active;

  result := public.archive_jarvis_goal(goal_active);
  IF result->>'code' <> 'archived' OR result->>'status' <> 'archived' THEN
    RAISE EXCEPTION 'active goal archive failed';
  END IF;

  result := public.archive_jarvis_goal(goal_active);
  IF result->>'code' <> 'already_archived' THEN
    RAISE EXCEPTION 'archive must be idempotent';
  END IF;

  UPDATE public.jarvis_goals
  SET status = 'active', completed_at = NULL
  WHERE id = goal_active;

  UPDATE public.jarvis_profiles
  SET today_priority_goal_id = goal_active
  WHERE user_id = user_a;

  result := public.archive_jarvis_goal(goal_active);
  IF result->>'code' <> 'archived' THEN
    RAISE EXCEPTION 'priority goal archive failed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.jarvis_profiles
    WHERE user_id = user_a AND today_priority_goal_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'priority goal archive must clear today priority';
  END IF;

  SELECT completed_at INTO original_completed_at
  FROM public.jarvis_goals
  WHERE id = goal_completed;

  result := public.archive_jarvis_goal(goal_completed);
  IF result->>'code' <> 'archived' THEN
    RAISE EXCEPTION 'completed goal archive failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_goals
    WHERE id = goal_completed
      AND status = 'archived'
      AND completed_at = original_completed_at
  ) THEN
    RAISE EXCEPTION 'completed_at must be preserved on archive';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_goal_levels WHERE goal_id = goal_completed
  ) THEN
    RAISE EXCEPTION 'archive must retain levels';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tasks
    WHERE id = task_completed
      AND goal_id = goal_completed
      AND goal_level_id = level_completed
      AND status = 'done'
  ) THEN
    RAISE EXCEPTION 'archive must retain task attachments and completion state';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tasks
    WHERE id = task_active
      AND goal_id = goal_active
      AND goal_level_id = level_active
      AND notes = 'keep-note'
      AND blocked_reason = 'waiting'
  ) THEN
    RAISE EXCEPTION 'archive must retain notes and blockers';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
  result := public.archive_jarvis_goal(goal_completed);
  IF result->>'code' <> 'goal_not_found' THEN
    RAISE EXCEPTION 'cross-user archive must be rejected';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);

  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_profiles
    WHERE user_id = user_a AND current_focus = original_focus
  ) THEN
    RAISE EXCEPTION 'archive must not modify current_focus';
  END IF;

  -- RESTORE: unfinished -> active
  result := public.restore_jarvis_goal(goal_active);
  IF result->>'code' <> 'restored' OR result->>'status' <> 'active' THEN
    RAISE EXCEPTION 'archived unfinished goal must restore active';
  END IF;

  -- RESTORE: fully completed -> completed via reconciliation
  result := public.restore_jarvis_goal(goal_completed);
  IF result->>'code' <> 'restored' OR result->>'status' <> 'completed' THEN
    RAISE EXCEPTION 'archived completed goal must restore completed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_goals
    WHERE id = goal_completed
      AND status = 'completed'
      AND completed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'restore must leave completed_at from reconciliation';
  END IF;

  -- RESTORE: stale completed_at cannot force completed
  UPDATE public.jarvis_goals
  SET status = 'archived', completed_at = now()
  WHERE id = goal_completed;

  UPDATE public.tasks
  SET status = 'todo', completed_at = NULL
  WHERE id = task_completed;

  result := public.restore_jarvis_goal(goal_completed);
  IF result->>'code' <> 'restored' OR result->>'status' <> 'active' THEN
    RAISE EXCEPTION 'stale completed_at must not force completed restore';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.jarvis_profiles
    WHERE user_id = user_a AND today_priority_goal_id = goal_completed
  ) THEN
    RAISE EXCEPTION 'restore must not set today priority';
  END IF;

  result := public.restore_jarvis_goal(goal_active);
  IF result->>'code' <> 'goal_not_archived' THEN
    RAISE EXCEPTION 'non-archived restore must be rejected';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
  result := public.restore_jarvis_goal(goal_archived);
  IF result->>'code' <> 'goal_not_found' THEN
    RAISE EXCEPTION 'cross-user restore must be rejected';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);

  IF NOT EXISTS (
    SELECT 1 FROM public.jarvis_profiles
    WHERE user_id = user_a AND current_focus = original_focus
  ) THEN
    RAISE EXCEPTION 'restore must not modify current_focus';
  END IF;

  -- SECURITY
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    WHERE p.oid = to_regprocedure('public.update_jarvis_goal_metadata(uuid, text, text, text)')
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PUBLIC must not execute update_jarvis_goal_metadata';
  END IF;

  IF has_function_privilege('anon', 'public.archive_jarvis_goal(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute archive_jarvis_goal';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.restore_jarvis_goal(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must execute restore_jarvis_goal';
  END IF;

  IF has_table_privilege('authenticated', 'public.jarvis_goals', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated must not have DELETE on jarvis_goals';
  END IF;
END;
$validate$;
