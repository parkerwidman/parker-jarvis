-- D4.1 Goals foundation: workspace-scoped priorities, optional dates, metadata fields.

ALTER TABLE public.jarvis_goals
  ADD COLUMN IF NOT EXISTS target_date date,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.jarvis_goals
  ADD CONSTRAINT jarvis_goals_notes_check
    CHECK (notes IS NULL OR char_length(notes) <= 2000);

CREATE TABLE public.jarvis_goal_priorities (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id    uuid                     NOT NULL,
  domain     text                     NOT NULL,
  goal_type  text                     NOT NULL,
  goal_id    uuid                     NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.jarvis_goal_priorities
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.jarvis_goal_priorities
  ADD CONSTRAINT jarvis_goal_priorities_pkey PRIMARY KEY (id);

ALTER TABLE public.jarvis_goal_priorities
  ADD CONSTRAINT jarvis_goal_priorities_user_domain_goal_type_key
    UNIQUE (user_id, domain, goal_type);

ALTER TABLE public.jarvis_goal_priorities
  ADD CONSTRAINT jarvis_goal_priorities_domain_check
    CHECK (domain = ANY (ARRAY['personal'::text, 'melusi'::text]));

ALTER TABLE public.jarvis_goal_priorities
  ADD CONSTRAINT jarvis_goal_priorities_goal_type_check
    CHECK (goal_type = ANY (ARRAY['short_term'::text, 'three_month'::text, 'long_term'::text]));

ALTER TABLE public.jarvis_goal_priorities
  ADD CONSTRAINT jarvis_goal_priorities_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.jarvis_goal_priorities
  ADD CONSTRAINT jarvis_goal_priorities_goal_id_fkey
    FOREIGN KEY (goal_id) REFERENCES public.jarvis_goals(id) ON DELETE CASCADE;

CREATE INDEX jarvis_goal_priorities_user_goal_idx
  ON public.jarvis_goal_priorities (user_id, goal_id);

CREATE TRIGGER set_jarvis_goal_priorities_updated_at
  BEFORE UPDATE ON public.jarvis_goal_priorities
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_goal_priorities TO authenticated;

CREATE POLICY "Users manage their own jarvis goal priorities" ON public.jarvis_goal_priorities
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

-- Migrate legacy profile priority into domain+horizon table.
INSERT INTO public.jarvis_goal_priorities (user_id, domain, goal_type, goal_id)
SELECT
  p.user_id,
  g.domain,
  g.goal_type,
  g.id
FROM public.jarvis_profiles p
INNER JOIN public.jarvis_goals g
  ON g.id = p.today_priority_goal_id
  AND g.user_id = p.user_id
WHERE p.today_priority_goal_id IS NOT NULL
  AND g.status = 'active'::text
ON CONFLICT (user_id, domain, goal_type) DO UPDATE
  SET goal_id = EXCLUDED.goal_id,
      updated_at = now();

CREATE OR REPLACE FUNCTION jarvis_internal.clear_jarvis_goal_priority_for_goal(
  p_goal_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  DELETE FROM public.jarvis_goal_priorities
  WHERE goal_id = p_goal_id;
END;
$function$;

REVOKE ALL ON FUNCTION jarvis_internal.clear_jarvis_goal_priority_for_goal(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION jarvis_internal.sync_legacy_today_priority_goal(
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_goal_id uuid;
BEGIN
  SELECT goal_id
  INTO v_goal_id
  FROM public.jarvis_goal_priorities
  WHERE user_id = p_user_id
    AND domain = 'personal'::text
    AND goal_type = 'short_term'::text;

  UPDATE public.jarvis_profiles
  SET today_priority_goal_id = v_goal_id,
      updated_at = now()
  WHERE user_id = p_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION jarvis_internal.sync_legacy_today_priority_goal(uuid) FROM PUBLIC;

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

    PERFORM jarvis_internal.clear_jarvis_goal_priority_for_goal(p_goal_id);
    PERFORM jarvis_internal.sync_legacy_today_priority_goal(v_user_id);
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.clear_jarvis_goal_priority_on_goal_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
BEGIN
  IF NEW.status = 'active'::text
     AND NEW.domain = OLD.domain
     AND NEW.goal_type = OLD.goal_type THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.jarvis_goal_priorities
  WHERE user_id = NEW.user_id
    AND goal_id = NEW.id;

  PERFORM jarvis_internal.sync_legacy_today_priority_goal(NEW.user_id);

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS clear_jarvis_today_priority_on_goal_change ON public.jarvis_goals;

CREATE TRIGGER clear_jarvis_goal_priority_on_goal_change
  AFTER UPDATE OF status, goal_type, domain ON public.jarvis_goals
  FOR EACH ROW
  WHEN (
    OLD.status IS DISTINCT FROM NEW.status
    OR OLD.goal_type IS DISTINCT FROM NEW.goal_type
    OR OLD.domain IS DISTINCT FROM NEW.domain
  )
  EXECUTE FUNCTION public.clear_jarvis_goal_priority_on_goal_change();

CREATE OR REPLACE FUNCTION public.set_jarvis_goal_priority(
  p_goal_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_goal record;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  IF p_goal_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_goal');
  END IF;

  SELECT id, domain, goal_type, status
  INTO v_goal
  FROM public.jarvis_goals
  WHERE id = p_goal_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'goal_not_found');
  END IF;

  IF v_goal.status = 'archived'::text THEN
    RETURN jsonb_build_object('success', false, 'code', 'goal_archived');
  END IF;

  IF v_goal.status = 'completed'::text THEN
    RETURN jsonb_build_object('success', false, 'code', 'goal_completed');
  END IF;

  IF v_goal.status <> 'active'::text THEN
    RETURN jsonb_build_object('success', false, 'code', 'goal_not_active');
  END IF;

  INSERT INTO public.jarvis_goal_priorities (user_id, domain, goal_type, goal_id)
  VALUES (v_user_id, v_goal.domain, v_goal.goal_type, v_goal.id)
  ON CONFLICT (user_id, domain, goal_type)
  DO UPDATE SET goal_id = EXCLUDED.goal_id,
                updated_at = now();

  PERFORM jarvis_internal.sync_legacy_today_priority_goal(v_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'goal_id', v_goal.id,
    'domain', v_goal.domain,
    'goal_type', v_goal.goal_type
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.clear_jarvis_goal_priority(
  p_domain text,
  p_goal_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  IF p_domain NOT IN ('personal'::text, 'melusi'::text) THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_domain');
  END IF;

  IF p_goal_type NOT IN ('short_term'::text, 'three_month'::text, 'long_term'::text) THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_goal_type');
  END IF;

  DELETE FROM public.jarvis_goal_priorities
  WHERE user_id = v_user_id
    AND domain = p_domain
    AND goal_type = p_goal_type;

  PERFORM jarvis_internal.sync_legacy_today_priority_goal(v_user_id);

  RETURN jsonb_build_object('success', true);
END;
$function$;

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
  INTO v_goal_status, v_next_title, v_next_description, v_next_notes, v_next_target_date, v_old_domain, v_old_goal_type
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

CREATE OR REPLACE FUNCTION public.create_jarvis_goal_with_roadmap(
  p_title text,
  p_description text,
  p_notes text,
  p_target_date date,
  p_goal_type text,
  p_domain text,
  p_levels jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_goal_id uuid;
  v_level jsonb;
  v_task_element jsonb;
  v_task_title text;
  v_task_due_at timestamp with time zone;
  v_level_id uuid;
  v_level_index integer := 0;
  v_task_index integer;
  v_level_position integer;
  v_task_position integer;
  v_level_name text;
  v_trimmed_title text;
  v_trimmed_description text;
  v_trimmed_notes text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  v_trimmed_title := trim(coalesce(p_title, ''));
  v_trimmed_description := nullif(trim(coalesce(p_description, '')), '');
  v_trimmed_notes := nullif(trim(coalesce(p_notes, '')), '');

  IF char_length(v_trimmed_title) < 1 OR char_length(v_trimmed_title) > 200 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_title');
  END IF;

  IF v_trimmed_description IS NOT NULL AND char_length(v_trimmed_description) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_description');
  END IF;

  IF v_trimmed_notes IS NOT NULL AND char_length(v_trimmed_notes) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_notes');
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
      IF jsonb_typeof(v_task_element) = 'string'::text THEN
        v_task_title := trim(v_task_element #>> '{}');
      ELSIF jsonb_typeof(v_task_element) = 'object'::text THEN
        v_task_title := trim(coalesce(v_task_element->>'title', ''));
      ELSE
        RETURN jsonb_build_object('success', false, 'code', 'invalid_task_title');
      END IF;

      IF char_length(v_task_title) < 1 OR char_length(v_task_title) > 200 THEN
        RETURN jsonb_build_object('success', false, 'code', 'invalid_task_title');
      END IF;
    END LOOP;
  END LOOP;

  INSERT INTO public.jarvis_goals (
    user_id,
    title,
    description,
    notes,
    target_date,
    goal_type,
    domain,
    status,
    sort_order
  )
  VALUES (
    v_user_id,
    v_trimmed_title,
    v_trimmed_description,
    v_trimmed_notes,
    p_target_date,
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
      v_task_due_at := NULL;

      IF jsonb_typeof(v_task_element) = 'string'::text THEN
        v_task_title := trim(v_task_element #>> '{}');
      ELSE
        v_task_title := trim(coalesce(v_task_element->>'title', ''));

        IF v_task_element ? 'due_at'
           AND v_task_element->>'due_at' IS NOT NULL
           AND trim(v_task_element->>'due_at') <> '' THEN
          v_task_due_at := (v_task_element->>'due_at')::timestamp with time zone;
        END IF;
      END IF;

      INSERT INTO public.tasks (
        user_id,
        title,
        status,
        priority,
        goal_id,
        goal_level_id,
        position,
        notes,
        due_at,
        blocked_at,
        blocked_reason
      )
      VALUES (
        v_user_id,
        v_task_title,
        'todo'::text,
        'medium'::text,
        v_goal_id,
        v_level_id,
        v_task_position,
        NULL,
        v_task_due_at,
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

CREATE OR REPLACE FUNCTION public.add_jarvis_goal_task(
  p_level_id uuid,
  p_title text,
  p_due_at timestamp with time zone DEFAULT NULL
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
    due_at,
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
    p_due_at,
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

CREATE OR REPLACE FUNCTION public.set_jarvis_goal_task_due_at(
  p_task_id uuid,
  p_due_at timestamp with time zone DEFAULT NULL,
  p_clear_due_at boolean DEFAULT false
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

  IF v_task.goal_id IS NULL OR v_task.goal_level_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'not_goal_task');
  END IF;

  SELECT status
  INTO v_goal_status
  FROM public.jarvis_goals
  WHERE id = v_task.goal_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'goal_not_found');
  END IF;

  IF v_goal_status = 'archived'::text THEN
    RETURN jsonb_build_object('success', false, 'code', 'goal_archived');
  END IF;

  UPDATE public.tasks
  SET due_at = CASE
        WHEN p_clear_due_at THEN NULL
        ELSE p_due_at
      END,
      updated_at = now()
  WHERE id = p_task_id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'task_id', p_task_id,
    'due_at', CASE WHEN p_clear_due_at THEN NULL ELSE p_due_at END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_jarvis_goal_priority(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_jarvis_goal_priority(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_jarvis_goal_priority(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.clear_jarvis_goal_priority(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_jarvis_goal_priority(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.clear_jarvis_goal_priority(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.set_jarvis_goal_task_due_at(uuid, timestamp with time zone, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_jarvis_goal_task_due_at(uuid, timestamp with time zone, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_jarvis_goal_task_due_at(uuid, timestamp with time zone, boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.update_jarvis_goal_metadata(
  uuid, text, text, text, date, boolean, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_jarvis_goal_metadata(
  uuid, text, text, text, date, boolean, text, text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_jarvis_goal_metadata(
  uuid, text, text, text, date, boolean, text, text
) TO authenticated;

REVOKE ALL ON FUNCTION public.create_jarvis_goal_with_roadmap(
  text, text, text, date, text, text, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_jarvis_goal_with_roadmap(
  text, text, text, date, text, text, jsonb
) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_jarvis_goal_with_roadmap(
  text, text, text, date, text, text, jsonb
) TO authenticated;

REVOKE ALL ON FUNCTION public.add_jarvis_goal_task(uuid, text, timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_jarvis_goal_task(uuid, text, timestamp with time zone) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_jarvis_goal_task(uuid, text, timestamp with time zone) TO authenticated;

GRANT SELECT ON TABLE public.jarvis_goal_priorities TO service_role;
