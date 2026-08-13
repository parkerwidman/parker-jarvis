-- D4.2 hotfix: preserve omitted metadata fields on partial updates.
-- The D4.1 RPC loaded domain/goal_type into v_old_* but UPDATE wrote v_next_*
-- variables that were never initialized, nulling NOT NULL columns.

CREATE OR REPLACE FUNCTION public.update_jarvis_goal_metadata(
  p_goal_id uuid,
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_target_date date DEFAULT NULL,
  p_clear_target_date boolean DEFAULT false,
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
  v_old_domain text;
  v_old_goal_type text;
  v_trimmed_title text;
  v_trimmed_description text;
  v_trimmed_notes text;
  v_next_title text;
  v_next_description text;
  v_next_notes text;
  v_next_target_date date;
  v_next_domain text;
  v_next_goal_type text;
  v_description_provided boolean := p_description IS NOT NULL;
  v_notes_provided boolean := p_notes IS NOT NULL;
  v_target_date_provided boolean := p_target_date IS NOT NULL OR p_clear_target_date;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  IF p_goal_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_goal');
  END IF;

  IF p_title IS NULL
     AND NOT v_description_provided
     AND NOT v_notes_provided
     AND NOT v_target_date_provided
     AND p_domain IS NULL
     AND p_goal_type IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'no_changes');
  END IF;

  SELECT status, title, description, notes, target_date, domain, goal_type
  INTO v_goal_status, v_next_title, v_next_description, v_next_notes, v_next_target_date, v_next_domain, v_next_goal_type
  FROM public.jarvis_goals
  WHERE id = p_goal_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'goal_not_found');
  END IF;

  v_old_domain := v_next_domain;
  v_old_goal_type := v_next_goal_type;

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

  IF v_description_provided THEN
    v_trimmed_description := nullif(trim(coalesce(p_description, '')), '');

    IF v_trimmed_description IS NOT NULL AND char_length(v_trimmed_description) > 2000 THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_description');
    END IF;

    v_next_description := v_trimmed_description;
  END IF;

  IF v_notes_provided THEN
    v_trimmed_notes := nullif(trim(coalesce(p_notes, '')), '');

    IF v_trimmed_notes IS NOT NULL AND char_length(v_trimmed_notes) > 2000 THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_notes');
    END IF;

    v_next_notes := v_trimmed_notes;
  END IF;

  IF p_clear_target_date THEN
    v_next_target_date := NULL;
  ELSIF p_target_date IS NOT NULL THEN
    v_next_target_date := p_target_date;
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
      description = v_next_description,
      notes = v_next_notes,
      target_date = v_next_target_date,
      domain = v_next_domain,
      goal_type = v_next_goal_type,
      updated_at = now()
  WHERE id = p_goal_id
    AND user_id = v_user_id;

  IF v_old_domain IS DISTINCT FROM v_next_domain
     OR v_old_goal_type IS DISTINCT FROM v_next_goal_type THEN
    DELETE FROM public.jarvis_goal_priorities
    WHERE user_id = v_user_id
      AND goal_id = p_goal_id;
  END IF;

  PERFORM jarvis_internal.sync_legacy_today_priority_goal(v_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'code', 'updated',
    'goal_id', p_goal_id,
    'title', v_next_title,
    'description', v_next_description,
    'notes', v_next_notes,
    'target_date', v_next_target_date,
    'domain', v_next_domain,
    'goal_type', v_next_goal_type,
    'status', v_goal_status
  );
END;
$function$;
