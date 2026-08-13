-- D7.4: atomic manual schedule mutation RPCs

CREATE OR REPLACE FUNCTION public.jarvis_schedule_monday_zero_dow(p_date date)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT (EXTRACT(ISODOW FROM p_date)::integer - 1)::smallint;
$$;

CREATE OR REPLACE FUNCTION public.jarvis_schedule_item_effective_on_date(
  p_day_of_week smallint,
  p_effective_start date,
  p_effective_end date,
  p_occurrence_date date
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
  SELECT
    public.jarvis_schedule_monday_zero_dow(p_occurrence_date) = p_day_of_week
    AND p_occurrence_date >= p_effective_start
    AND (p_effective_end IS NULL OR p_occurrence_date <= p_effective_end);
$$;

CREATE OR REPLACE FUNCTION public.jarvis_schedule_assert_schedule_owned(
  p_schedule_id uuid,
  p_user_id uuid
)
RETURNS public.jarvis_schedules
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_schedule public.jarvis_schedules;
BEGIN
  SELECT *
  INTO v_schedule
  FROM public.jarvis_schedules
  WHERE id = p_schedule_id
    AND user_id = p_user_id;

  IF v_schedule.id IS NULL THEN
    RAISE EXCEPTION 'schedule_not_found';
  END IF;

  RETURN v_schedule;
END;
$function$;

CREATE OR REPLACE FUNCTION public.jarvis_schedule_assert_item_owned(
  p_schedule_id uuid,
  p_schedule_item_id uuid,
  p_user_id uuid
)
RETURNS public.jarvis_schedule_items
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_item public.jarvis_schedule_items;
BEGIN
  SELECT *
  INTO v_item
  FROM public.jarvis_schedule_items
  WHERE id = p_schedule_item_id
    AND schedule_id = p_schedule_id
    AND user_id = p_user_id;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'schedule_item_not_found';
  END IF;

  RETURN v_item;
END;
$function$;

CREATE OR REPLACE FUNCTION public.jarvis_schedule_upsert_replace_override(
  p_schedule_id uuid,
  p_schedule_item_id uuid,
  p_occurrence_date date,
  p_title text,
  p_category text,
  p_start_time time,
  p_end_time time,
  p_notes text,
  p_override_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_schedule public.jarvis_schedules;
  v_item public.jarvis_schedule_items;
  v_override_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  v_schedule := public.jarvis_schedule_assert_schedule_owned(p_schedule_id, v_user_id);
  v_item := public.jarvis_schedule_assert_item_owned(
    p_schedule_id,
    p_schedule_item_id,
    v_user_id
  );

  IF p_occurrence_date < v_schedule.start_date OR p_occurrence_date > v_schedule.end_date THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_date');
  END IF;

  IF NOT public.jarvis_schedule_item_effective_on_date(
    v_item.day_of_week,
    v_item.effective_start_date,
    v_item.effective_end_date,
    p_occurrence_date
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_occurrence');
  END IF;

  IF char_length(btrim(coalesce(p_title, ''))) < 1 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_title');
  END IF;

  IF p_end_time IS NOT NULL AND p_end_time <= p_start_time THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_time_range');
  END IF;

  DELETE FROM public.jarvis_schedule_overrides
  WHERE schedule_id = p_schedule_id
    AND user_id = v_user_id
    AND schedule_item_id = p_schedule_item_id
    AND occurrence_date = p_occurrence_date
    AND override_type = 'skip'::text;

  IF p_override_id IS NOT NULL THEN
    UPDATE public.jarvis_schedule_overrides
    SET
      title = btrim(p_title),
      category = p_category,
      start_time = p_start_time,
      end_time = p_end_time,
      notes = nullif(btrim(coalesce(p_notes, '')), '')
    WHERE id = p_override_id
      AND user_id = v_user_id
      AND schedule_id = p_schedule_id
      AND schedule_item_id = p_schedule_item_id
      AND occurrence_date = p_occurrence_date
      AND override_type = 'replace'::text
    RETURNING id INTO v_override_id;
  END IF;

  IF v_override_id IS NULL THEN
    SELECT id
    INTO v_override_id
    FROM public.jarvis_schedule_overrides
    WHERE schedule_id = p_schedule_id
      AND user_id = v_user_id
      AND schedule_item_id = p_schedule_item_id
      AND occurrence_date = p_occurrence_date
      AND override_type = 'replace'::text
    LIMIT 1;
  END IF;

  IF v_override_id IS NOT NULL THEN
    UPDATE public.jarvis_schedule_overrides
    SET
      title = btrim(p_title),
      category = p_category,
      start_time = p_start_time,
      end_time = p_end_time,
      notes = nullif(btrim(coalesce(p_notes, '')), '')
    WHERE id = v_override_id;
  ELSE
    INSERT INTO public.jarvis_schedule_overrides (
      user_id,
      schedule_id,
      schedule_item_id,
      occurrence_date,
      override_type,
      start_time,
      end_time,
      title,
      category,
      notes
    )
    VALUES (
      v_user_id,
      p_schedule_id,
      p_schedule_item_id,
      p_occurrence_date,
      'replace'::text,
      p_start_time,
      p_end_time,
      btrim(p_title),
      p_category,
      nullif(btrim(coalesce(p_notes, '')), '')
    )
    RETURNING id INTO v_override_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'override_id', v_override_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.jarvis_schedule_skip_occurrence(
  p_schedule_id uuid,
  p_schedule_item_id uuid,
  p_occurrence_date date,
  p_override_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_schedule public.jarvis_schedules;
  v_item public.jarvis_schedule_items;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  v_schedule := public.jarvis_schedule_assert_schedule_owned(p_schedule_id, v_user_id);
  v_item := public.jarvis_schedule_assert_item_owned(
    p_schedule_id,
    p_schedule_item_id,
    v_user_id
  );

  IF p_occurrence_date < v_schedule.start_date OR p_occurrence_date > v_schedule.end_date THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_date');
  END IF;

  IF NOT public.jarvis_schedule_item_effective_on_date(
    v_item.day_of_week,
    v_item.effective_start_date,
    v_item.effective_end_date,
    p_occurrence_date
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_occurrence');
  END IF;

  IF p_override_id IS NOT NULL THEN
    DELETE FROM public.jarvis_schedule_overrides
    WHERE id = p_override_id
      AND user_id = v_user_id
      AND schedule_id = p_schedule_id
      AND schedule_item_id = p_schedule_item_id
      AND override_type = 'replace'::text;
  END IF;

  DELETE FROM public.jarvis_schedule_overrides
  WHERE schedule_id = p_schedule_id
    AND user_id = v_user_id
    AND schedule_item_id = p_schedule_item_id
    AND occurrence_date = p_occurrence_date
    AND override_type = 'replace'::text;

  DELETE FROM public.jarvis_schedule_overrides
  WHERE schedule_id = p_schedule_id
    AND user_id = v_user_id
    AND schedule_item_id = p_schedule_item_id
    AND occurrence_date = p_occurrence_date
    AND override_type IN ('skip'::text, 'replace'::text);

  INSERT INTO public.jarvis_schedule_overrides (
    user_id,
    schedule_id,
    schedule_item_id,
    occurrence_date,
    override_type
  )
  VALUES (
    v_user_id,
    p_schedule_id,
    p_schedule_item_id,
    p_occurrence_date,
    'skip'::text
  );

  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.jarvis_schedule_move_occurrence(
  p_schedule_id uuid,
  p_schedule_item_id uuid,
  p_source_date date,
  p_target_date date,
  p_title text,
  p_category text,
  p_start_time time,
  p_end_time time,
  p_notes text,
  p_source_override_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_schedule public.jarvis_schedules;
  v_item public.jarvis_schedule_items;
  v_add_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  v_schedule := public.jarvis_schedule_assert_schedule_owned(p_schedule_id, v_user_id);
  v_item := public.jarvis_schedule_assert_item_owned(
    p_schedule_id,
    p_schedule_item_id,
    v_user_id
  );

  IF p_source_date = p_target_date THEN
    RETURN jsonb_build_object('success', false, 'code', 'same_date');
  END IF;

  IF p_source_date < v_schedule.start_date OR p_source_date > v_schedule.end_date THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_date');
  END IF;

  IF p_target_date < v_schedule.start_date OR p_target_date > v_schedule.end_date THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_date');
  END IF;

  IF NOT public.jarvis_schedule_item_effective_on_date(
    v_item.day_of_week,
    v_item.effective_start_date,
    v_item.effective_end_date,
    p_source_date
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_occurrence');
  END IF;

  IF char_length(btrim(coalesce(p_title, ''))) < 1 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_title');
  END IF;

  IF p_end_time IS NOT NULL AND p_end_time <= p_start_time THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_time_range');
  END IF;

  IF p_source_override_id IS NOT NULL THEN
    DELETE FROM public.jarvis_schedule_overrides
    WHERE id = p_source_override_id
      AND user_id = v_user_id
      AND schedule_id = p_schedule_id
      AND schedule_item_id = p_schedule_item_id
      AND override_type = 'replace'::text;
  END IF;

  DELETE FROM public.jarvis_schedule_overrides
  WHERE schedule_id = p_schedule_id
    AND user_id = v_user_id
    AND schedule_item_id = p_schedule_item_id
    AND occurrence_date = p_source_date
    AND override_type IN ('skip'::text, 'replace'::text);

  INSERT INTO public.jarvis_schedule_overrides (
    user_id,
    schedule_id,
    schedule_item_id,
    occurrence_date,
    override_type
  )
  VALUES (
    v_user_id,
    p_schedule_id,
    p_schedule_item_id,
    p_source_date,
    'skip'::text
  );

  INSERT INTO public.jarvis_schedule_overrides (
    user_id,
    schedule_id,
    schedule_item_id,
    occurrence_date,
    override_type,
    start_time,
    end_time,
    title,
    category,
    notes
  )
  VALUES (
    v_user_id,
    p_schedule_id,
    NULL,
    p_target_date,
    'add'::text,
    p_start_time,
    p_end_time,
    btrim(p_title),
    p_category,
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  RETURNING id INTO v_add_id;

  RETURN jsonb_build_object('success', true, 'override_id', v_add_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.jarvis_schedule_split_item_this_and_future(
  p_schedule_id uuid,
  p_schedule_item_id uuid,
  p_split_date date,
  p_title text,
  p_category text,
  p_day_of_week smallint,
  p_start_time time,
  p_end_time time,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_schedule public.jarvis_schedules;
  v_item public.jarvis_schedule_items;
  v_new_item_id uuid;
  v_split_minus_one date;
  v_old_effective_end date;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  v_schedule := public.jarvis_schedule_assert_schedule_owned(p_schedule_id, v_user_id);
  v_item := public.jarvis_schedule_assert_item_owned(
    p_schedule_id,
    p_schedule_item_id,
    v_user_id
  );

  IF p_split_date < v_schedule.start_date OR p_split_date > v_schedule.end_date THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_date');
  END IF;

  IF NOT public.jarvis_schedule_item_effective_on_date(
    v_item.day_of_week,
    v_item.effective_start_date,
    v_item.effective_end_date,
    p_split_date
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_occurrence');
  END IF;

  IF char_length(btrim(coalesce(p_title, ''))) < 1 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_title');
  END IF;

  IF p_end_time IS NOT NULL AND p_end_time <= p_start_time THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_time_range');
  END IF;

  v_split_minus_one := (p_split_date - INTERVAL '1 day')::date;

  IF v_split_minus_one < v_item.effective_start_date THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_split_date');
  END IF;

  v_old_effective_end := v_item.effective_end_date;

  UPDATE public.jarvis_schedule_items
  SET effective_end_date = v_split_minus_one
  WHERE id = v_item.id
    AND user_id = v_user_id;

  INSERT INTO public.jarvis_schedule_items (
    user_id,
    schedule_id,
    day_of_week,
    effective_start_date,
    effective_end_date,
    start_time,
    end_time,
    title,
    category,
    notes,
    metadata,
    sort_order
  )
  VALUES (
    v_user_id,
    p_schedule_id,
    p_day_of_week,
    p_split_date,
    v_old_effective_end,
    p_start_time,
    p_end_time,
    btrim(p_title),
    p_category,
    nullif(btrim(coalesce(p_notes, '')), ''),
    v_item.metadata,
    v_item.sort_order
  )
  RETURNING id INTO v_new_item_id;

  UPDATE public.jarvis_schedule_overrides
  SET schedule_item_id = v_new_item_id
  WHERE schedule_id = p_schedule_id
    AND user_id = v_user_id
    AND schedule_item_id = p_schedule_item_id
    AND occurrence_date >= p_split_date
    AND override_type IN ('skip'::text, 'replace'::text)
    AND public.jarvis_schedule_monday_zero_dow(occurrence_date) = p_day_of_week;

  DELETE FROM public.jarvis_schedule_overrides
  WHERE schedule_id = p_schedule_id
    AND user_id = v_user_id
    AND schedule_item_id = p_schedule_item_id
    AND occurrence_date >= p_split_date
    AND override_type IN ('skip'::text, 'replace'::text);

  RETURN jsonb_build_object(
    'success', true,
    'new_schedule_item_id', v_new_item_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.jarvis_schedule_end_item_this_and_future(
  p_schedule_id uuid,
  p_schedule_item_id uuid,
  p_split_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_schedule public.jarvis_schedules;
  v_item public.jarvis_schedule_items;
  v_split_minus_one date;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  v_schedule := public.jarvis_schedule_assert_schedule_owned(p_schedule_id, v_user_id);
  v_item := public.jarvis_schedule_assert_item_owned(
    p_schedule_id,
    p_schedule_item_id,
    v_user_id
  );

  IF p_split_date < v_schedule.start_date OR p_split_date > v_schedule.end_date THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_date');
  END IF;

  IF NOT public.jarvis_schedule_item_effective_on_date(
    v_item.day_of_week,
    v_item.effective_start_date,
    v_item.effective_end_date,
    p_split_date
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_occurrence');
  END IF;

  v_split_minus_one := (p_split_date - INTERVAL '1 day')::date;

  IF v_split_minus_one < v_item.effective_start_date THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_split_date');
  END IF;

  UPDATE public.jarvis_schedule_items
  SET effective_end_date = v_split_minus_one
  WHERE id = v_item.id
    AND user_id = v_user_id;

  DELETE FROM public.jarvis_schedule_overrides
  WHERE schedule_id = p_schedule_id
    AND user_id = v_user_id
    AND schedule_item_id = p_schedule_item_id
    AND occurrence_date >= p_split_date;

  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.jarvis_schedule_delete_item_entire_series(
  p_schedule_id uuid,
  p_schedule_item_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  PERFORM public.jarvis_schedule_assert_item_owned(
    p_schedule_id,
    p_schedule_item_id,
    v_user_id
  );

  DELETE FROM public.jarvis_schedule_items
  WHERE id = p_schedule_item_id
    AND schedule_id = p_schedule_id
    AND user_id = v_user_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.jarvis_schedule_upsert_one_off_override(
  p_schedule_id uuid,
  p_occurrence_date date,
  p_title text,
  p_category text,
  p_start_time time,
  p_end_time time,
  p_notes text,
  p_override_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_schedule public.jarvis_schedules;
  v_override_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  v_schedule := public.jarvis_schedule_assert_schedule_owned(p_schedule_id, v_user_id);

  IF p_occurrence_date < v_schedule.start_date OR p_occurrence_date > v_schedule.end_date THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_date');
  END IF;

  IF char_length(btrim(coalesce(p_title, ''))) < 1 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_title');
  END IF;

  IF p_end_time IS NOT NULL AND p_end_time <= p_start_time THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_time_range');
  END IF;

  IF p_override_id IS NOT NULL THEN
    UPDATE public.jarvis_schedule_overrides
    SET
      occurrence_date = p_occurrence_date,
      start_time = p_start_time,
      end_time = p_end_time,
      title = btrim(p_title),
      category = p_category,
      notes = nullif(btrim(coalesce(p_notes, '')), '')
    WHERE id = p_override_id
      AND user_id = v_user_id
      AND schedule_id = p_schedule_id
      AND override_type = 'add'::text
      AND schedule_item_id IS NULL
    RETURNING id INTO v_override_id;
  END IF;

  IF v_override_id IS NULL THEN
    INSERT INTO public.jarvis_schedule_overrides (
      user_id,
      schedule_id,
      schedule_item_id,
      occurrence_date,
      override_type,
      start_time,
      end_time,
      title,
      category,
      notes
    )
    VALUES (
      v_user_id,
      p_schedule_id,
      NULL,
      p_occurrence_date,
      'add'::text,
      p_start_time,
      p_end_time,
      btrim(p_title),
      p_category,
      nullif(btrim(coalesce(p_notes, '')), '')
    )
    RETURNING id INTO v_override_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'override_id', v_override_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.jarvis_schedule_delete_one_off_override(
  p_schedule_id uuid,
  p_override_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  PERFORM public.jarvis_schedule_assert_schedule_owned(p_schedule_id, v_user_id);

  DELETE FROM public.jarvis_schedule_overrides
  WHERE id = p_override_id
    AND user_id = v_user_id
    AND schedule_id = p_schedule_id
    AND override_type = 'add'::text
    AND schedule_item_id IS NULL;

  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.jarvis_schedule_add_recurring_item(
  p_schedule_id uuid,
  p_day_of_week smallint,
  p_effective_start_date date,
  p_title text,
  p_category text,
  p_start_time time,
  p_end_time time,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_schedule public.jarvis_schedules;
  v_item_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  v_schedule := public.jarvis_schedule_assert_schedule_owned(p_schedule_id, v_user_id);

  IF p_effective_start_date < v_schedule.start_date
    OR p_effective_start_date > v_schedule.end_date THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_date');
  END IF;

  IF char_length(btrim(coalesce(p_title, ''))) < 1 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_title');
  END IF;

  IF p_end_time IS NOT NULL AND p_end_time <= p_start_time THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_time_range');
  END IF;

  INSERT INTO public.jarvis_schedule_items (
    user_id,
    schedule_id,
    day_of_week,
    effective_start_date,
    effective_end_date,
    start_time,
    end_time,
    title,
    category,
    notes
  )
  VALUES (
    v_user_id,
    p_schedule_id,
    p_day_of_week,
    p_effective_start_date,
    NULL,
    p_start_time,
    p_end_time,
    btrim(p_title),
    p_category,
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  RETURNING id INTO v_item_id;

  RETURN jsonb_build_object('success', true, 'schedule_item_id', v_item_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.jarvis_schedule_update_item_entire_series(
  p_schedule_id uuid,
  p_schedule_item_id uuid,
  p_title text,
  p_category text,
  p_day_of_week smallint,
  p_start_time time,
  p_end_time time,
  p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  PERFORM public.jarvis_schedule_assert_item_owned(
    p_schedule_id,
    p_schedule_item_id,
    v_user_id
  );

  IF char_length(btrim(coalesce(p_title, ''))) < 1 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_title');
  END IF;

  IF p_end_time IS NOT NULL AND p_end_time <= p_start_time THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_time_range');
  END IF;

  UPDATE public.jarvis_schedule_items
  SET
    title = btrim(p_title),
    category = p_category,
    day_of_week = p_day_of_week,
    start_time = p_start_time,
    end_time = p_end_time,
    notes = nullif(btrim(coalesce(p_notes, '')), '')
  WHERE id = p_schedule_item_id
    AND schedule_id = p_schedule_id
    AND user_id = v_user_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.jarvis_schedule_upsert_replace_override(
  uuid, uuid, date, text, text, time, time, text, uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.jarvis_schedule_skip_occurrence(
  uuid, uuid, date, uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.jarvis_schedule_move_occurrence(
  uuid, uuid, date, date, text, text, time, time, text, uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.jarvis_schedule_split_item_this_and_future(
  uuid, uuid, date, text, text, smallint, time, time, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.jarvis_schedule_end_item_this_and_future(
  uuid, uuid, date
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.jarvis_schedule_delete_item_entire_series(
  uuid, uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.jarvis_schedule_upsert_one_off_override(
  uuid, date, text, text, time, time, text, uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.jarvis_schedule_delete_one_off_override(
  uuid, uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.jarvis_schedule_add_recurring_item(
  uuid, smallint, date, text, text, time, time, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.jarvis_schedule_update_item_entire_series(
  uuid, uuid, text, text, smallint, time, time, text
) TO authenticated;
