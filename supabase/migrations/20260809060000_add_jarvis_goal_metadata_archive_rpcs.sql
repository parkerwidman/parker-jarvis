CREATE OR REPLACE FUNCTION public.update_jarvis_goal_metadata(
  p_goal_id uuid,
  p_title text DEFAULT NULL,
  p_domain text DEFAULT NULL,
  p_goal_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_goal_status text;
  v_trimmed_title text;
  v_next_title text;
  v_next_domain text;
  v_next_goal_type text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  IF p_goal_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_goal');
  END IF;

  IF p_title IS NULL AND p_domain IS NULL AND p_goal_type IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'no_changes');
  END IF;

  SELECT status, title, domain, goal_type
  INTO v_goal_status, v_next_title, v_next_domain, v_next_goal_type
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

  IF v_goal_status NOT IN ('active'::text, 'completed'::text) THEN
    RETURN jsonb_build_object('success', false, 'code', 'goal_not_editable');
  END IF;

  IF p_title IS NOT NULL THEN
    v_trimmed_title := trim(p_title);

    IF char_length(v_trimmed_title) < 1 OR char_length(v_trimmed_title) > 200 THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_title');
    END IF;

    v_next_title := v_trimmed_title;
  END IF;

  IF p_domain IS NOT NULL THEN
    IF p_domain NOT IN ('personal'::text, 'melusi'::text) THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_domain');
    END IF;

    v_next_domain := p_domain;
  END IF;

  IF p_goal_type IS NOT NULL THEN
    IF p_goal_type NOT IN ('short_term'::text, 'three_month'::text, 'long_term'::text) THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_goal_type');
    END IF;

    v_next_goal_type := p_goal_type;
  END IF;

  UPDATE public.jarvis_goals
  SET title = v_next_title,
      domain = v_next_domain,
      goal_type = v_next_goal_type,
      updated_at = now()
  WHERE id = p_goal_id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'updated',
    'goal_id', p_goal_id,
    'title', v_next_title,
    'domain', v_next_domain,
    'goal_type', v_next_goal_type,
    'status', v_goal_status
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.archive_jarvis_goal(
  p_goal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_goal_status text;
  v_goal_completed_at timestamp with time zone;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  IF p_goal_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_goal');
  END IF;

  SELECT status, completed_at
  INTO v_goal_status, v_goal_completed_at
  FROM public.jarvis_goals
  WHERE id = p_goal_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'goal_not_found');
  END IF;

  IF v_goal_status = 'archived'::text THEN
    RETURN jsonb_build_object(
      'success', true,
      'code', 'already_archived',
      'goal_id', p_goal_id,
      'status', v_goal_status,
      'completed_at', v_goal_completed_at
    );
  END IF;

  IF v_goal_status NOT IN ('active'::text, 'completed'::text) THEN
    RETURN jsonb_build_object('success', false, 'code', 'goal_not_archivable');
  END IF;

  UPDATE public.jarvis_goals
  SET status = 'archived'::text,
      updated_at = now()
  WHERE id = p_goal_id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'archived',
    'goal_id', p_goal_id,
    'status', 'archived'::text,
    'completed_at', v_goal_completed_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_jarvis_goal(
  p_goal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_goal_status text;
  v_goal_completed_at timestamp with time zone;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  IF p_goal_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_goal');
  END IF;

  SELECT status, completed_at
  INTO v_goal_status, v_goal_completed_at
  FROM public.jarvis_goals
  WHERE id = p_goal_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'goal_not_found');
  END IF;

  IF v_goal_status <> 'archived'::text THEN
    RETURN jsonb_build_object('success', false, 'code', 'goal_not_archived');
  END IF;

  UPDATE public.jarvis_goals
  SET status = 'active'::text,
      updated_at = now()
  WHERE id = p_goal_id
    AND user_id = v_user_id;

  PERFORM jarvis_internal.reconcile_jarvis_goal_completion(p_goal_id);

  SELECT status, completed_at
  INTO v_goal_status, v_goal_completed_at
  FROM public.jarvis_goals
  WHERE id = p_goal_id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'restored',
    'goal_id', p_goal_id,
    'status', v_goal_status,
    'completed_at', v_goal_completed_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_jarvis_goal_metadata(
  uuid,
  text,
  text,
  text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.update_jarvis_goal_metadata(
  uuid,
  text,
  text,
  text
) FROM anon;

GRANT EXECUTE ON FUNCTION public.update_jarvis_goal_metadata(
  uuid,
  text,
  text,
  text
) TO authenticated;

REVOKE ALL ON FUNCTION public.archive_jarvis_goal(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.archive_jarvis_goal(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.archive_jarvis_goal(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.restore_jarvis_goal(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.restore_jarvis_goal(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.restore_jarvis_goal(uuid) TO authenticated;
