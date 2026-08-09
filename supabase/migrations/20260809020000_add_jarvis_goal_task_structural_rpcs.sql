CREATE OR REPLACE FUNCTION public.add_jarvis_goal_task(
  p_level_id uuid,
  p_title text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_resolved_goal_id uuid;
  v_level public.jarvis_goal_levels%ROWTYPE;
  v_goal_status text;
  v_trimmed_title text;
  v_position integer;
  v_task_id uuid;
  v_goal_status_after text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  IF p_level_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_level');
  END IF;

  v_trimmed_title := trim(coalesce(p_title, ''));

  IF char_length(v_trimmed_title) < 1 OR char_length(v_trimmed_title) > 200 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_title');
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

  SELECT COALESCE(MAX(t.position), 0) + 10
  INTO v_position
  FROM public.tasks t
  WHERE t.goal_level_id = p_level_id
    AND t.goal_id = v_level.goal_id
    AND t.user_id = v_user_id;

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
    v_trimmed_title,
    'todo'::text,
    'medium'::text,
    v_level.goal_id,
    p_level_id,
    v_position,
    NULL,
    NULL,
    NULL,
    NULL
  )
  RETURNING id INTO v_task_id;

  PERFORM jarvis_internal.reconcile_jarvis_goal_completion(v_level.goal_id);

  SELECT status
  INTO v_goal_status_after
  FROM public.jarvis_goals
  WHERE id = v_level.goal_id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'added',
    'task_id', v_task_id,
    'goal_id', v_level.goal_id,
    'goal_status', v_goal_status_after
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_jarvis_goal_task(
  p_task_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_task public.tasks%ROWTYPE;
  v_goal_status text;
  v_level_goal_id uuid;
  v_task_count integer;
  v_goal_status_after text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  IF p_task_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_task');
  END IF;

  SELECT *
  INTO v_task
  FROM public.tasks
  WHERE id = p_task_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'task_not_found');
  END IF;

  IF v_task.goal_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'not_goal_task');
  END IF;

  IF v_task.goal_level_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'malformed_goal_task');
  END IF;

  SELECT status
  INTO v_goal_status
  FROM public.jarvis_goals
  WHERE id = v_task.goal_id
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

  SELECT goal_id
  INTO v_level_goal_id
  FROM public.jarvis_goal_levels
  WHERE id = v_task.goal_level_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_level_goal_id <> v_task.goal_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'malformed_goal_task');
  END IF;

  SELECT COUNT(*)
  INTO v_task_count
  FROM public.tasks
  WHERE goal_level_id = v_task.goal_level_id
    AND goal_id = v_task.goal_id
    AND user_id = v_user_id;

  IF v_task_count <= 1 THEN
    RETURN jsonb_build_object('success', false, 'code', 'last_task_in_level');
  END IF;

  DELETE FROM public.tasks
  WHERE id = p_task_id
    AND user_id = v_user_id;

  PERFORM jarvis_internal.reconcile_jarvis_goal_completion(v_task.goal_id);

  SELECT status
  INTO v_goal_status_after
  FROM public.jarvis_goals
  WHERE id = v_task.goal_id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'deleted',
    'task_id', p_task_id,
    'goal_id', v_task.goal_id,
    'goal_status', v_goal_status_after
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.add_jarvis_goal_task(uuid, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.add_jarvis_goal_task(uuid, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.add_jarvis_goal_task(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_jarvis_goal_task(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.delete_jarvis_goal_task(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.delete_jarvis_goal_task(uuid) TO authenticated;
