CREATE OR REPLACE FUNCTION public.move_jarvis_goal_level(
  p_level_id uuid,
  p_direction text
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
  v_target_id uuid;
  v_target_position integer;
  v_adjacent_id uuid;
  v_adjacent_position integer;
  v_max_position integer;
  v_temporary_position integer;
  v_direction text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  IF p_level_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_level');
  END IF;

  v_direction := lower(trim(coalesce(p_direction, '')));

  IF v_direction NOT IN ('up', 'down') THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_direction');
  END IF;

  SELECT id, goal_id
  INTO v_target_id, v_resolved_goal_id
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

  SELECT gl.position
  INTO v_target_position
  FROM public.jarvis_goal_levels gl
  WHERE gl.id = v_target_id
    AND gl.user_id = v_user_id
    AND gl.goal_id = v_resolved_goal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'level_not_found');
  END IF;

  IF v_direction = 'up' THEN
    SELECT gl.id, gl.position
    INTO v_adjacent_id, v_adjacent_position
    FROM public.jarvis_goal_levels gl
    WHERE gl.goal_id = v_resolved_goal_id
      AND gl.user_id = v_user_id
      AND gl.position < v_target_position
    ORDER BY gl.position DESC
    LIMIT 1;
  ELSE
    SELECT gl.id, gl.position
    INTO v_adjacent_id, v_adjacent_position
    FROM public.jarvis_goal_levels gl
    WHERE gl.goal_id = v_resolved_goal_id
      AND gl.user_id = v_user_id
      AND gl.position > v_target_position
    ORDER BY gl.position ASC
    LIMIT 1;
  END IF;

  IF v_adjacent_id IS NULL THEN
    IF v_direction = 'up' THEN
      RETURN jsonb_build_object(
        'success', true,
        'code', 'already_first',
        'level_id', v_target_id,
        'goal_id', v_resolved_goal_id,
        'direction', v_direction,
        'old_position', v_target_position,
        'new_position', v_target_position
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'code', 'already_last',
      'level_id', v_target_id,
      'goal_id', v_resolved_goal_id,
      'direction', v_direction,
      'old_position', v_target_position,
      'new_position', v_target_position
    );
  END IF;

  SELECT gl.position
  INTO v_adjacent_position
  FROM public.jarvis_goal_levels gl
  WHERE gl.id = v_adjacent_id
    AND gl.user_id = v_user_id
    AND gl.goal_id = v_resolved_goal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'level_not_found');
  END IF;

  IF v_direction = 'up' THEN
    IF v_adjacent_position >= v_target_position THEN
      RETURN jsonb_build_object('success', false, 'code', 'level_not_found');
    END IF;
  ELSE
    IF v_adjacent_position <= v_target_position THEN
      RETURN jsonb_build_object('success', false, 'code', 'level_not_found');
    END IF;
  END IF;

  SELECT COALESCE(MAX(gl.position), 0)
  INTO v_max_position
  FROM public.jarvis_goal_levels gl
  WHERE gl.goal_id = v_resolved_goal_id
    AND gl.user_id = v_user_id;

  IF v_max_position > 2147483637 THEN
    RETURN jsonb_build_object('success', false, 'code', 'position_overflow');
  END IF;

  v_temporary_position := v_max_position + 10;

  UPDATE public.jarvis_goal_levels
  SET position = v_temporary_position,
      updated_at = now()
  WHERE id = v_target_id
    AND user_id = v_user_id
    AND goal_id = v_resolved_goal_id;

  UPDATE public.jarvis_goal_levels
  SET position = v_target_position,
      updated_at = now()
  WHERE id = v_adjacent_id
    AND user_id = v_user_id
    AND goal_id = v_resolved_goal_id;

  UPDATE public.jarvis_goal_levels
  SET position = v_adjacent_position,
      updated_at = now()
  WHERE id = v_target_id
    AND user_id = v_user_id
    AND goal_id = v_resolved_goal_id;

  PERFORM jarvis_internal.reconcile_jarvis_goal_completion(v_resolved_goal_id);

  RETURN jsonb_build_object(
    'success', true,
    'code', 'moved',
    'level_id', v_target_id,
    'goal_id', v_resolved_goal_id,
    'direction', v_direction,
    'old_position', v_target_position,
    'new_position', v_adjacent_position
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.move_jarvis_goal_task(
  p_task_id uuid,
  p_direction text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_resolved_goal_id uuid;
  v_resolved_level_id uuid;
  v_goal_status text;
  v_level_goal_id uuid;
  v_target_id uuid;
  v_target_position integer;
  v_adjacent_id uuid;
  v_adjacent_position integer;
  v_target_position_locked integer;
  v_adjacent_position_locked integer;
  v_max_position integer;
  v_temporary_position integer;
  v_direction text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  IF p_task_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_task');
  END IF;

  v_direction := lower(trim(coalesce(p_direction, '')));

  IF v_direction NOT IN ('up', 'down') THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_direction');
  END IF;

  SELECT t.id, t.goal_id, t.goal_level_id
  INTO v_target_id, v_resolved_goal_id, v_resolved_level_id
  FROM public.tasks t
  WHERE t.id = p_task_id
    AND t.user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'task_not_found');
  END IF;

  IF v_resolved_goal_id IS NULL OR v_resolved_level_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'malformed_goal_task');
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

  SELECT goal_id
  INTO v_level_goal_id
  FROM public.jarvis_goal_levels
  WHERE id = v_resolved_level_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_level_goal_id <> v_resolved_goal_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'malformed_goal_task');
  END IF;

  SELECT t.position
  INTO v_target_position
  FROM public.tasks t
  WHERE t.id = v_target_id
    AND t.user_id = v_user_id
    AND t.goal_id = v_resolved_goal_id
    AND t.goal_level_id = v_resolved_level_id;

  IF NOT FOUND OR v_target_position IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'task_not_found');
  END IF;

  IF v_direction = 'up' THEN
    SELECT t.id, t.position
    INTO v_adjacent_id, v_adjacent_position
    FROM public.tasks t
    WHERE t.user_id = v_user_id
      AND t.goal_id = v_resolved_goal_id
      AND t.goal_level_id = v_resolved_level_id
      AND t.position < v_target_position
    ORDER BY t.position DESC
    LIMIT 1;
  ELSE
    SELECT t.id, t.position
    INTO v_adjacent_id, v_adjacent_position
    FROM public.tasks t
    WHERE t.user_id = v_user_id
      AND t.goal_id = v_resolved_goal_id
      AND t.goal_level_id = v_resolved_level_id
      AND t.position > v_target_position
    ORDER BY t.position ASC
    LIMIT 1;
  END IF;

  IF v_adjacent_id IS NULL THEN
    IF v_direction = 'up' THEN
      RETURN jsonb_build_object(
        'success', true,
        'code', 'already_first',
        'task_id', v_target_id,
        'goal_id', v_resolved_goal_id,
        'level_id', v_resolved_level_id,
        'direction', v_direction,
        'old_position', v_target_position,
        'new_position', v_target_position
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'code', 'already_last',
      'task_id', v_target_id,
      'goal_id', v_resolved_goal_id,
      'level_id', v_resolved_level_id,
      'direction', v_direction,
      'old_position', v_target_position,
      'new_position', v_target_position
    );
  END IF;

  BEGIN
    PERFORM t.id
    FROM public.tasks t
    WHERE t.id IN (v_target_id, v_adjacent_id)
      AND t.user_id = v_user_id
      AND t.goal_id = v_resolved_goal_id
      AND t.goal_level_id = v_resolved_level_id
    ORDER BY t.id
    FOR UPDATE NOWAIT;
  EXCEPTION
    WHEN lock_not_available THEN
      RETURN jsonb_build_object('success', false, 'code', 'task_busy');
  END;

  SELECT t.position
  INTO v_target_position_locked
  FROM public.tasks t
  WHERE t.id = v_target_id
    AND t.user_id = v_user_id
    AND t.goal_id = v_resolved_goal_id
    AND t.goal_level_id = v_resolved_level_id;

  SELECT t.position
  INTO v_adjacent_position_locked
  FROM public.tasks t
  WHERE t.id = v_adjacent_id
    AND t.user_id = v_user_id
    AND t.goal_id = v_resolved_goal_id
    AND t.goal_level_id = v_resolved_level_id;

  IF v_target_position_locked IS NULL OR v_adjacent_position_locked IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'task_not_found');
  END IF;

  v_target_position := v_target_position_locked;
  v_adjacent_position := v_adjacent_position_locked;

  IF v_direction = 'up' THEN
    IF v_adjacent_position >= v_target_position THEN
      RETURN jsonb_build_object('success', false, 'code', 'task_not_found');
    END IF;
  ELSE
    IF v_adjacent_position <= v_target_position THEN
      RETURN jsonb_build_object('success', false, 'code', 'task_not_found');
    END IF;
  END IF;

  SELECT COALESCE(MAX(t.position), 0)
  INTO v_max_position
  FROM public.tasks t
  WHERE t.user_id = v_user_id
    AND t.goal_id = v_resolved_goal_id
    AND t.goal_level_id = v_resolved_level_id;

  IF v_max_position > 2147483637 THEN
    RETURN jsonb_build_object('success', false, 'code', 'position_overflow');
  END IF;

  v_temporary_position := v_max_position + 10;

  UPDATE public.tasks
  SET position = v_temporary_position,
      updated_at = now()
  WHERE id = v_target_id
    AND user_id = v_user_id
    AND goal_id = v_resolved_goal_id
    AND goal_level_id = v_resolved_level_id;

  UPDATE public.tasks
  SET position = v_target_position,
      updated_at = now()
  WHERE id = v_adjacent_id
    AND user_id = v_user_id
    AND goal_id = v_resolved_goal_id
    AND goal_level_id = v_resolved_level_id;

  UPDATE public.tasks
  SET position = v_adjacent_position,
      updated_at = now()
  WHERE id = v_target_id
    AND user_id = v_user_id
    AND goal_id = v_resolved_goal_id
    AND goal_level_id = v_resolved_level_id;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'moved',
    'task_id', v_target_id,
    'goal_id', v_resolved_goal_id,
    'level_id', v_resolved_level_id,
    'direction', v_direction,
    'old_position', v_target_position,
    'new_position', v_adjacent_position
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.move_jarvis_goal_level(uuid, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.move_jarvis_goal_level(uuid, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.move_jarvis_goal_level(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.move_jarvis_goal_task(uuid, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.move_jarvis_goal_task(uuid, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.move_jarvis_goal_task(uuid, text) TO authenticated;
