CREATE OR REPLACE FUNCTION public.add_jarvis_goal_level(
  p_goal_id uuid,
  p_level_name text,
  p_first_task_title text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_goal_status text;
  v_trimmed_level_name text;
  v_trimmed_task_title text;
  v_level_position integer;
  v_level_id uuid;
  v_task_id uuid;
  v_goal_status_after text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  IF p_goal_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_goal');
  END IF;

  v_trimmed_level_name := trim(coalesce(p_level_name, ''));

  IF char_length(v_trimmed_level_name) < 1 OR char_length(v_trimmed_level_name) > 200 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_level_name');
  END IF;

  v_trimmed_task_title := trim(coalesce(p_first_task_title, ''));

  IF char_length(v_trimmed_task_title) < 1 OR char_length(v_trimmed_task_title) > 200 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_task_title');
  END IF;

  SELECT status
  INTO v_goal_status
  FROM public.jarvis_goals
  WHERE id = p_goal_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'goal_not_found');
  END IF;

  IF v_goal_status = 'archived'::text THEN
    RETURN jsonb_build_object('success', false, 'code', 'goal_archived');
  END IF;

  IF v_goal_status = 'completed'::text THEN
    RETURN jsonb_build_object('success', false, 'code', 'goal_completed');
  END IF;

  IF v_goal_status <> 'active'::text THEN
    RETURN jsonb_build_object('success', false, 'code', 'goal_not_active');
  END IF;

  IF jarvis_internal.jarvis_goal_has_malformed_tasks(p_goal_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'malformed_goal_structure');
  END IF;

  SELECT COALESCE(MAX(gl.position), 0) + 10
  INTO v_level_position
  FROM public.jarvis_goal_levels gl
  WHERE gl.goal_id = p_goal_id
    AND gl.user_id = v_user_id;

  INSERT INTO public.jarvis_goal_levels (
    user_id,
    goal_id,
    name,
    position
  )
  VALUES (
    v_user_id,
    p_goal_id,
    v_trimmed_level_name,
    v_level_position
  )
  RETURNING id INTO v_level_id;

  INSERT INTO public.tasks (
    user_id,
    title,
    status,
    priority,
    goal_id,
    goal_level_id,
    position,
    notes,
    blocked_at,
    blocked_reason,
    completed_at
  )
  VALUES (
    v_user_id,
    v_trimmed_task_title,
    'todo'::text,
    'medium'::text,
    p_goal_id,
    v_level_id,
    10,
    NULL,
    NULL,
    NULL,
    NULL
  )
  RETURNING id INTO v_task_id;

  PERFORM jarvis_internal.reconcile_jarvis_goal_completion(p_goal_id);

  SELECT status
  INTO v_goal_status_after
  FROM public.jarvis_goals
  WHERE id = p_goal_id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'added',
    'level_id', v_level_id,
    'task_id', v_task_id,
    'goal_id', p_goal_id,
    'goal_status', v_goal_status_after
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_jarvis_goal_level(
  p_level_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_resolved_goal_id uuid;
  v_goal_status text;
  v_level public.jarvis_goal_levels%ROWTYPE;
  v_level_count integer;
  v_deleted_task_count integer;
  v_goal_status_after text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  IF p_level_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_level');
  END IF;

  SELECT goal_id
  INTO v_resolved_goal_id
  FROM public.jarvis_goal_levels
  WHERE id = p_level_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'level_not_found');
  END IF;

  SELECT status
  INTO v_goal_status
  FROM public.jarvis_goals
  WHERE id = v_resolved_goal_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'goal_not_found');
  END IF;

  IF v_goal_status = 'archived'::text THEN
    RETURN jsonb_build_object('success', false, 'code', 'goal_archived');
  END IF;

  IF v_goal_status = 'completed'::text THEN
    RETURN jsonb_build_object('success', false, 'code', 'goal_completed');
  END IF;

  IF v_goal_status <> 'active'::text THEN
    RETURN jsonb_build_object('success', false, 'code', 'goal_not_active');
  END IF;

  IF jarvis_internal.jarvis_goal_has_malformed_tasks(v_resolved_goal_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'malformed_goal_structure');
  END IF;

  SELECT *
  INTO v_level
  FROM public.jarvis_goal_levels
  WHERE id = p_level_id
    AND user_id = v_user_id
    AND goal_id = v_resolved_goal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'level_not_found');
  END IF;

  SELECT COUNT(*)
  INTO v_level_count
  FROM public.jarvis_goal_levels gl
  WHERE gl.goal_id = v_resolved_goal_id
    AND gl.user_id = v_user_id;

  IF v_level_count <= 1 THEN
    RETURN jsonb_build_object('success', false, 'code', 'last_level_in_goal');
  END IF;

  BEGIN
    PERFORM t.id
    FROM public.tasks t
    WHERE t.user_id = v_user_id
      AND t.goal_id = v_resolved_goal_id
      AND t.goal_level_id = p_level_id
    FOR UPDATE NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object('success', false, 'code', 'level_busy');
  END;

  DELETE FROM public.tasks
  WHERE user_id = v_user_id
    AND goal_id = v_resolved_goal_id
    AND goal_level_id = p_level_id;

  GET DIAGNOSTICS v_deleted_task_count = ROW_COUNT;

  DELETE FROM public.jarvis_goal_levels
  WHERE id = p_level_id
    AND user_id = v_user_id
    AND goal_id = v_resolved_goal_id;

  PERFORM jarvis_internal.reconcile_jarvis_goal_completion(v_resolved_goal_id);

  SELECT status
  INTO v_goal_status_after
  FROM public.jarvis_goals
  WHERE id = v_resolved_goal_id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'deleted',
    'level_id', p_level_id,
    'goal_id', v_resolved_goal_id,
    'deleted_task_count', v_deleted_task_count,
    'goal_status', v_goal_status_after
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.add_jarvis_goal_level(uuid, text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.add_jarvis_goal_level(uuid, text, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.add_jarvis_goal_level(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_jarvis_goal_level(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.delete_jarvis_goal_level(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.delete_jarvis_goal_level(uuid) TO authenticated;
