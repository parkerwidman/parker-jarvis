CREATE OR REPLACE FUNCTION public.create_jarvis_goal_with_roadmap(
  p_title text,
  p_description text,
  p_goal_type text,
  p_domain text,
  p_levels jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_goal_id uuid;
  v_level jsonb;
  v_task_element jsonb;
  v_task_title text;
  v_level_id uuid;
  v_level_index integer := 0;
  v_task_index integer;
  v_level_position integer;
  v_task_position integer;
  v_level_name text;
  v_trimmed_title text;
  v_trimmed_description text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  v_trimmed_title := trim(coalesce(p_title, ''));
  v_trimmed_description := nullif(trim(coalesce(p_description, '')), '');

  IF char_length(v_trimmed_title) < 1 OR char_length(v_trimmed_title) > 200 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_title');
  END IF;

  IF v_trimmed_description IS NOT NULL AND char_length(v_trimmed_description) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_description');
  END IF;

  IF p_goal_type NOT IN ('short_term'::text, 'three_month'::text, 'long_term'::text) THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_goal_type');
  END IF;

  IF p_domain NOT IN ('personal'::text, 'melusi'::text) THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_domain');
  END IF;

  IF p_levels IS NULL OR jsonb_typeof(p_levels) <> 'array'::text OR jsonb_array_length(p_levels) < 1 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_levels');
  END IF;

  FOR v_level IN
    SELECT value
    FROM jsonb_array_elements(p_levels) AS value
  LOOP
    IF jsonb_typeof(v_level) <> 'object'::text THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_levels');
    END IF;

    v_level_name := trim(coalesce(v_level->>'name', ''));

    IF char_length(v_level_name) < 1 OR char_length(v_level_name) > 200 THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_level_name');
    END IF;

    IF v_level->'tasks' IS NULL OR jsonb_typeof(v_level->'tasks') <> 'array'::text THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_level_tasks');
    END IF;

    IF jsonb_array_length(v_level->'tasks') < 1 THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_level_tasks');
    END IF;

    FOR v_task_element IN
      SELECT value
      FROM jsonb_array_elements(v_level->'tasks') AS value
    LOOP
      IF jsonb_typeof(v_task_element) <> 'string'::text THEN
        RETURN jsonb_build_object('success', false, 'code', 'invalid_task_title');
      END IF;

      v_task_title := trim(v_task_element #>> '{}');

      IF char_length(v_task_title) < 1 OR char_length(v_task_title) > 200 THEN
        RETURN jsonb_build_object('success', false, 'code', 'invalid_task_title');
      END IF;
    END LOOP;
  END LOOP;

  INSERT INTO public.jarvis_goals (
    user_id,
    title,
    description,
    goal_type,
    domain,
    status,
    sort_order
  )
  VALUES (
    v_user_id,
    v_trimmed_title,
    v_trimmed_description,
    p_goal_type,
    p_domain,
    'active'::text,
    0
  )
  RETURNING id INTO v_goal_id;

  FOR v_level IN
    SELECT value
    FROM jsonb_array_elements(p_levels) AS value
  LOOP
    v_level_index := v_level_index + 1;
    v_level_position := v_level_index * 10;
    v_level_name := trim(v_level->>'name');

    INSERT INTO public.jarvis_goal_levels (
      user_id,
      goal_id,
      name,
      position
    )
    VALUES (
      v_user_id,
      v_goal_id,
      v_level_name,
      v_level_position
    )
    RETURNING id INTO v_level_id;

    v_task_index := 0;

    FOR v_task_element IN
      SELECT value
      FROM jsonb_array_elements(v_level->'tasks') AS value
    LOOP
      v_task_index := v_task_index + 1;
      v_task_position := v_task_index * 10;
      v_task_title := trim(v_task_element #>> '{}');

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
        blocked_reason
      )
      VALUES (
        v_user_id,
        trim(v_task_title),
        'todo'::text,
        'medium'::text,
        v_goal_id,
        v_level_id,
        v_task_position,
        NULL,
        NULL,
        NULL
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'goal_id', v_goal_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_jarvis_goal_with_roadmap(
  text,
  text,
  text,
  text,
  jsonb
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_jarvis_goal_with_roadmap(
  text,
  text,
  text,
  text,
  jsonb
) FROM anon;

GRANT EXECUTE ON FUNCTION public.create_jarvis_goal_with_roadmap(
  text,
  text,
  text,
  text,
  jsonb
) TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_jarvis_goal_task_mutations()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
DECLARE
  is_direct_auth boolean;
BEGIN
  is_direct_auth := current_user = 'authenticated';

  IF TG_OP = 'INSERT' THEN
    IF is_direct_auth
       AND (
         NEW.goal_id IS NOT NULL
         OR NEW.goal_level_id IS NOT NULL
       ) THEN
      RAISE EXCEPTION 'goal_task_insert_requires_rpc';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.goal_id IS DISTINCT FROM NEW.goal_id
       OR OLD.goal_level_id IS DISTINCT FROM NEW.goal_level_id THEN
      RAISE EXCEPTION 'goal_task_attachment_immutable';
    END IF;

    IF is_direct_auth AND OLD.goal_id IS NOT NULL THEN
      IF OLD.status IS DISTINCT FROM NEW.status
         OR OLD.completed_at IS DISTINCT FROM NEW.completed_at THEN
        RAISE EXCEPTION 'goal_task_completion_requires_rpc';
      END IF;

      IF OLD.position IS DISTINCT FROM NEW.position THEN
        RAISE EXCEPTION 'goal_task_position_requires_rpc';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF is_direct_auth AND OLD.goal_id IS NOT NULL THEN
      RAISE EXCEPTION 'goal_task_delete_requires_rpc';
    END IF;

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS protect_jarvis_goal_task_mutations ON public.tasks;

CREATE TRIGGER protect_jarvis_goal_task_mutations
  BEFORE INSERT OR UPDATE OR DELETE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_jarvis_goal_task_mutations();
