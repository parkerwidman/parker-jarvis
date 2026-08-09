CREATE SCHEMA jarvis_internal;

REVOKE ALL ON SCHEMA jarvis_internal FROM PUBLIC;

CREATE OR REPLACE FUNCTION jarvis_internal.jarvis_goal_has_malformed_tasks(
  p_goal_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.jarvis_goal_levels gl
    WHERE gl.goal_id = p_goal_id
      AND gl.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.jarvis_goal_levels gl
    WHERE gl.goal_id = p_goal_id
      AND gl.user_id = auth.uid()
      AND NOT EXISTS (
        SELECT 1
        FROM public.tasks t
        WHERE t.goal_level_id = gl.id
          AND t.goal_id = p_goal_id
          AND t.user_id = auth.uid()
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.tasks t
    WHERE t.goal_id = p_goal_id
      AND (
        t.user_id IS DISTINCT FROM auth.uid()
        OR t.goal_level_id IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM public.jarvis_goal_levels gl
          WHERE gl.id = t.goal_level_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.jarvis_goal_levels gl
          WHERE gl.id = t.goal_level_id
            AND (
              gl.goal_id IS DISTINCT FROM p_goal_id
              OR gl.user_id IS DISTINCT FROM auth.uid()
            )
        )
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.tasks t
    INNER JOIN public.jarvis_goal_levels gl ON gl.id = t.goal_level_id
    WHERE gl.goal_id = p_goal_id
      AND gl.user_id = auth.uid()
      AND (
        t.goal_id IS DISTINCT FROM p_goal_id
        OR t.user_id IS DISTINCT FROM auth.uid()
      )
  );
$$;

REVOKE ALL ON FUNCTION jarvis_internal.jarvis_goal_has_malformed_tasks(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION jarvis_internal.reconcile_jarvis_goal_completion(
  p_goal_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_goal_status text;
  v_goal_completed_at timestamp with time zone;
  v_level_count integer;
  v_incomplete_levels integer;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT status, completed_at
  INTO v_goal_status, v_goal_completed_at
  FROM public.jarvis_goals
  WHERE id = p_goal_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'goal_not_found';
  END IF;

  IF v_goal_status = 'archived'::text THEN
    RETURN;
  END IF;

  IF jarvis_internal.jarvis_goal_has_malformed_tasks(p_goal_id) THEN
    IF v_goal_status = 'completed'::text THEN
      UPDATE public.jarvis_goals
      SET status = 'active'::text,
          completed_at = NULL,
          updated_at = now()
      WHERE id = p_goal_id
        AND user_id = v_user_id;
    END IF;

    RETURN;
  END IF;

  SELECT COUNT(*)
  INTO v_level_count
  FROM public.jarvis_goal_levels
  WHERE goal_id = p_goal_id
    AND user_id = v_user_id;

  IF v_level_count = 0 THEN
    IF v_goal_status = 'completed'::text THEN
      UPDATE public.jarvis_goals
      SET status = 'active'::text,
          completed_at = NULL,
          updated_at = now()
      WHERE id = p_goal_id
        AND user_id = v_user_id;
    END IF;

    RETURN;
  END IF;

  SELECT COUNT(*)
  INTO v_incomplete_levels
  FROM public.jarvis_goal_levels gl
  WHERE gl.goal_id = p_goal_id
    AND gl.user_id = v_user_id
    AND (
      NOT EXISTS (
        SELECT 1
        FROM public.tasks t
        WHERE t.goal_level_id = gl.id
          AND t.goal_id = p_goal_id
          AND t.user_id = v_user_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.tasks t
        WHERE t.goal_level_id = gl.id
          AND t.goal_id = p_goal_id
          AND t.user_id = v_user_id
          AND t.status <> 'done'::text
      )
    );

  IF v_incomplete_levels > 0 THEN
    IF v_goal_status = 'completed'::text THEN
      UPDATE public.jarvis_goals
      SET status = 'active'::text,
          completed_at = NULL,
          updated_at = now()
      WHERE id = p_goal_id
        AND user_id = v_user_id;
    END IF;

    RETURN;
  END IF;

  IF v_goal_status <> 'completed'::text THEN
    UPDATE public.jarvis_goals
    SET status = 'completed'::text,
        completed_at = now(),
        updated_at = now()
    WHERE id = p_goal_id
      AND user_id = v_user_id;

    UPDATE public.jarvis_profiles
    SET today_priority_goal_id = NULL,
        updated_at = now()
    WHERE user_id = v_user_id
      AND today_priority_goal_id = p_goal_id;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION jarvis_internal.reconcile_jarvis_goal_completion(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.set_jarvis_goal_task_completion(
  p_task_id uuid,
  p_completed boolean
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
  v_current_level_id uuid;
  v_level_row record;
  v_goal_status_after text;
  v_goal_completed_at_after timestamp with time zone;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  IF p_completed IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_completion_state');
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

  SELECT goal_id
  INTO v_level_goal_id
  FROM public.jarvis_goal_levels
  WHERE id = v_task.goal_level_id
    AND user_id = v_user_id;

  IF NOT FOUND OR v_level_goal_id <> v_task.goal_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'malformed_goal_task');
  END IF;

  IF jarvis_internal.jarvis_goal_has_malformed_tasks(v_task.goal_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'malformed_goal_structure');
  END IF;

  IF p_completed THEN
    IF v_task.status = 'done'::text THEN
      PERFORM jarvis_internal.reconcile_jarvis_goal_completion(v_task.goal_id);

      SELECT status, completed_at
      INTO v_goal_status_after, v_goal_completed_at_after
      FROM public.jarvis_goals
      WHERE id = v_task.goal_id
        AND user_id = v_user_id;

      RETURN jsonb_build_object(
        'success', true,
        'code', 'already_done',
        'task_id', v_task.id,
        'goal_id', v_task.goal_id,
        'goal_status', v_goal_status_after,
        'goal_completed_at', v_goal_completed_at_after
      );
    END IF;

    v_current_level_id := NULL;

    FOR v_level_row IN
      SELECT gl.id
      FROM public.jarvis_goal_levels gl
      WHERE gl.goal_id = v_task.goal_id
        AND gl.user_id = v_user_id
      ORDER BY gl.position ASC, gl.created_at ASC
    LOOP
      IF EXISTS (
        SELECT 1
        FROM public.tasks t
        WHERE t.goal_level_id = v_level_row.id
          AND t.goal_id = v_task.goal_id
          AND t.user_id = v_user_id
          AND t.status <> 'done'::text
      ) THEN
        v_current_level_id := v_level_row.id;
        EXIT;
      END IF;
    END LOOP;

    IF v_current_level_id IS NULL OR v_task.goal_level_id <> v_current_level_id THEN
      RETURN jsonb_build_object('success', false, 'code', 'level_locked');
    END IF;

    UPDATE public.tasks
    SET status = 'done'::text,
        completed_at = now(),
        updated_at = now()
    WHERE id = p_task_id
      AND user_id = v_user_id;

    PERFORM jarvis_internal.reconcile_jarvis_goal_completion(v_task.goal_id);

    SELECT status, completed_at
    INTO v_goal_status_after, v_goal_completed_at_after
    FROM public.jarvis_goals
    WHERE id = v_task.goal_id
      AND user_id = v_user_id;

    RETURN jsonb_build_object(
      'success', true,
      'code', 'completed',
      'task_id', p_task_id,
      'goal_id', v_task.goal_id,
      'goal_status', v_goal_status_after,
      'goal_completed_at', v_goal_completed_at_after
    );
  END IF;

  IF v_task.status <> 'done'::text THEN
    IF v_task.status <> 'todo'::text THEN
      UPDATE public.tasks
      SET status = 'todo'::text,
          completed_at = NULL,
          updated_at = now()
      WHERE id = p_task_id
        AND user_id = v_user_id;
    END IF;

    PERFORM jarvis_internal.reconcile_jarvis_goal_completion(v_task.goal_id);

    SELECT status, completed_at
    INTO v_goal_status_after, v_goal_completed_at_after
    FROM public.jarvis_goals
    WHERE id = v_task.goal_id
      AND user_id = v_user_id;

    RETURN jsonb_build_object(
      'success', true,
      'code', 'already_open',
      'task_id', v_task.id,
      'goal_id', v_task.goal_id,
      'goal_status', v_goal_status_after,
      'goal_completed_at', v_goal_completed_at_after
    );
  END IF;

  UPDATE public.tasks
  SET status = 'todo'::text,
      completed_at = NULL,
      updated_at = now()
  WHERE id = p_task_id
    AND user_id = v_user_id;

  PERFORM jarvis_internal.reconcile_jarvis_goal_completion(v_task.goal_id);

  SELECT status, completed_at
  INTO v_goal_status_after, v_goal_completed_at_after
  FROM public.jarvis_goals
  WHERE id = v_task.goal_id
      AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'reopened',
    'task_id', p_task_id,
    'goal_id', v_task.goal_id,
    'goal_status', v_goal_status_after,
    'goal_completed_at', v_goal_completed_at_after
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_jarvis_goal_task_completion(uuid, boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.set_jarvis_goal_task_completion(uuid, boolean) FROM anon;

GRANT EXECUTE ON FUNCTION public.set_jarvis_goal_task_completion(uuid, boolean) TO authenticated;
