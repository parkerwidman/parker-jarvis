CREATE TABLE public.jarvis_schedules (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id      uuid                     DEFAULT auth.uid() NOT NULL,
  name         text                     NOT NULL,
  description  text,
  start_date   date                     NOT NULL,
  end_date     date                     NOT NULL,
  timezone     text                     NOT NULL,
  status       text                     DEFAULT 'active'::text NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  updated_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.jarvis_schedules
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.jarvis_schedules
  ADD CONSTRAINT jarvis_schedules_pkey PRIMARY KEY (id);

ALTER TABLE public.jarvis_schedules
  ADD CONSTRAINT jarvis_schedules_id_user_id_key UNIQUE (id, user_id);

ALTER TABLE public.jarvis_schedules
  ADD CONSTRAINT jarvis_schedules_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.jarvis_schedules
  ADD CONSTRAINT jarvis_schedules_name_check
    CHECK (char_length(btrim(name)) >= 1);

ALTER TABLE public.jarvis_schedules
  ADD CONSTRAINT jarvis_schedules_timezone_check
    CHECK (char_length(btrim(timezone)) >= 1);

ALTER TABLE public.jarvis_schedules
  ADD CONSTRAINT jarvis_schedules_date_range_check
    CHECK (end_date >= start_date);

ALTER TABLE public.jarvis_schedules
  ADD CONSTRAINT jarvis_schedules_status_check
    CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text]));

ALTER TABLE public.jarvis_schedules
  ADD CONSTRAINT jarvis_schedules_user_id_name_start_date_key
    UNIQUE (user_id, name, start_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_schedules TO authenticated;

CREATE INDEX jarvis_schedules_user_start_date_idx
  ON public.jarvis_schedules (user_id, start_date DESC);

CREATE INDEX jarvis_schedules_user_status_idx
  ON public.jarvis_schedules (user_id, status);

CREATE UNIQUE INDEX jarvis_schedules_one_active_per_user_idx
  ON public.jarvis_schedules (user_id)
  WHERE status = 'active'::text;

CREATE TRIGGER set_jarvis_schedules_updated_at
  BEFORE UPDATE ON public.jarvis_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own jarvis schedules" ON public.jarvis_schedules
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.jarvis_schedule_items (
  id                    uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id               uuid                     DEFAULT auth.uid() NOT NULL,
  schedule_id           uuid                     NOT NULL,
  day_of_week           smallint                 NOT NULL,
  effective_start_date  date                     NOT NULL,
  effective_end_date    date,
  start_time            time                     NOT NULL,
  end_time              time,
  title                 text                     NOT NULL,
  category              text                     NOT NULL,
  notes                 text,
  metadata              jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  sort_order            smallint                 DEFAULT 0 NOT NULL,
  created_at            timestamp with time zone DEFAULT now() NOT NULL,
  updated_at            timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.jarvis_schedule_items
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.jarvis_schedule_items
  ADD CONSTRAINT jarvis_schedule_items_pkey PRIMARY KEY (id);

ALTER TABLE public.jarvis_schedule_items
  ADD CONSTRAINT jarvis_schedule_items_id_user_id_key UNIQUE (id, user_id);

ALTER TABLE public.jarvis_schedule_items
  ADD CONSTRAINT jarvis_schedule_items_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.jarvis_schedule_items
  ADD CONSTRAINT jarvis_schedule_items_schedule_user_fkey
    FOREIGN KEY (schedule_id, user_id)
    REFERENCES public.jarvis_schedules(id, user_id) ON DELETE CASCADE;

ALTER TABLE public.jarvis_schedule_items
  ADD CONSTRAINT jarvis_schedule_items_day_of_week_check
    CHECK (day_of_week >= 0 AND day_of_week <= 6);

ALTER TABLE public.jarvis_schedule_items
  ADD CONSTRAINT jarvis_schedule_items_effective_date_check
    CHECK (effective_end_date IS NULL OR effective_end_date >= effective_start_date);

ALTER TABLE public.jarvis_schedule_items
  ADD CONSTRAINT jarvis_schedule_items_title_check
    CHECK (char_length(btrim(title)) >= 1);

ALTER TABLE public.jarvis_schedule_items
  ADD CONSTRAINT jarvis_schedule_items_category_check
    CHECK (category = ANY (ARRAY[
      'class'::text,
      'gym'::text,
      'morning_routine'::text,
      'work'::text,
      'reading'::text,
      'night_routine'::text,
      'sleep'::text,
      'reset'::text,
      'planning'::text,
      'recovery'::text,
      'other'::text
    ]));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_schedule_items TO authenticated;

CREATE INDEX jarvis_schedule_items_schedule_day_start_idx
  ON public.jarvis_schedule_items (schedule_id, day_of_week, start_time);

CREATE INDEX jarvis_schedule_items_schedule_effective_idx
  ON public.jarvis_schedule_items (schedule_id, effective_start_date, effective_end_date);

CREATE INDEX jarvis_schedule_items_user_schedule_idx
  ON public.jarvis_schedule_items (user_id, schedule_id);

CREATE TRIGGER set_jarvis_schedule_items_updated_at
  BEFORE UPDATE ON public.jarvis_schedule_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own jarvis schedule items" ON public.jarvis_schedule_items
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.jarvis_schedule_overrides (
  id               uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id          uuid                     DEFAULT auth.uid() NOT NULL,
  schedule_id      uuid                     NOT NULL,
  schedule_item_id uuid,
  occurrence_date  date                     NOT NULL,
  override_type    text                     NOT NULL,
  start_time       time,
  end_time         time,
  title            text,
  category         text,
  notes            text,
  metadata         jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  created_at       timestamp with time zone DEFAULT now() NOT NULL,
  updated_at       timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.jarvis_schedule_overrides
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.jarvis_schedule_overrides
  ADD CONSTRAINT jarvis_schedule_overrides_pkey PRIMARY KEY (id);

ALTER TABLE public.jarvis_schedule_overrides
  ADD CONSTRAINT jarvis_schedule_overrides_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.jarvis_schedule_overrides
  ADD CONSTRAINT jarvis_schedule_overrides_schedule_user_fkey
    FOREIGN KEY (schedule_id, user_id)
    REFERENCES public.jarvis_schedules(id, user_id) ON DELETE CASCADE;

ALTER TABLE public.jarvis_schedule_overrides
  ADD CONSTRAINT jarvis_schedule_overrides_item_user_fkey
    FOREIGN KEY (schedule_item_id, user_id)
    REFERENCES public.jarvis_schedule_items(id, user_id) ON DELETE CASCADE;

ALTER TABLE public.jarvis_schedule_overrides
  ADD CONSTRAINT jarvis_schedule_overrides_type_check
    CHECK (override_type = ANY (ARRAY['skip'::text, 'replace'::text, 'add'::text]));

ALTER TABLE public.jarvis_schedule_overrides
  ADD CONSTRAINT jarvis_schedule_overrides_shape_check
    CHECK (
      (
        override_type = 'skip'::text
        AND schedule_item_id IS NOT NULL
      )
      OR (
        override_type = 'replace'::text
        AND schedule_item_id IS NOT NULL
        AND start_time IS NOT NULL
      )
      OR (
        override_type = 'add'::text
        AND schedule_item_id IS NULL
        AND start_time IS NOT NULL
        AND title IS NOT NULL
        AND char_length(btrim(title)) >= 1
        AND category IS NOT NULL
      )
    );

ALTER TABLE public.jarvis_schedule_overrides
  ADD CONSTRAINT jarvis_schedule_overrides_category_check
    CHECK (
      category IS NULL
      OR category = ANY (ARRAY[
        'class'::text,
        'gym'::text,
        'morning_routine'::text,
        'work'::text,
        'reading'::text,
        'night_routine'::text,
        'sleep'::text,
        'reset'::text,
        'planning'::text,
        'recovery'::text,
        'other'::text
      ])
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_schedule_overrides TO authenticated;

CREATE INDEX jarvis_schedule_overrides_schedule_date_idx
  ON public.jarvis_schedule_overrides (schedule_id, occurrence_date);

CREATE INDEX jarvis_schedule_overrides_item_date_idx
  ON public.jarvis_schedule_overrides (schedule_item_id, occurrence_date);

CREATE UNIQUE INDEX jarvis_schedule_overrides_item_date_skip_replace_idx
  ON public.jarvis_schedule_overrides (schedule_item_id, occurrence_date)
  WHERE schedule_item_id IS NOT NULL
    AND override_type = ANY (ARRAY['skip'::text, 'replace'::text]);

CREATE TRIGGER set_jarvis_schedule_overrides_updated_at
  BEFORE UPDATE ON public.jarvis_schedule_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own jarvis schedule overrides" ON public.jarvis_schedule_overrides
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.jarvis_pending_schedule_actions (
  id                 uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id            uuid                     DEFAULT auth.uid() NOT NULL,
  action_type        text                     NOT NULL,
  status             text                     DEFAULT 'pending'::text NOT NULL,
  summary            text                     NOT NULL,
  payload            jsonb                    NOT NULL,
  agent_key          text                     DEFAULT 'main'::text NOT NULL,
  thread_id          uuid,
  expires_at         timestamp with time zone NOT NULL,
  confirmed_at       timestamp with time zone,
  executed_at        timestamp with time zone,
  result             jsonb,
  safe_error_message text,
  created_at         timestamp with time zone DEFAULT now() NOT NULL,
  updated_at         timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.jarvis_pending_schedule_actions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.jarvis_pending_schedule_actions
  ADD CONSTRAINT jarvis_pending_schedule_actions_pkey PRIMARY KEY (id);

ALTER TABLE public.jarvis_pending_schedule_actions
  ADD CONSTRAINT jarvis_pending_schedule_actions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.jarvis_pending_schedule_actions
  ADD CONSTRAINT jarvis_pending_schedule_actions_action_type_check
    CHECK (action_type = ANY (ARRAY['add'::text, 'update'::text, 'move'::text, 'remove'::text, 'skip'::text]));

ALTER TABLE public.jarvis_pending_schedule_actions
  ADD CONSTRAINT jarvis_pending_schedule_actions_status_check
    CHECK (status = ANY (ARRAY[
      'pending'::text,
      'confirmed'::text,
      'executed'::text,
      'cancelled'::text,
      'expired'::text,
      'failed'::text
    ]));

ALTER TABLE public.jarvis_pending_schedule_actions
  ADD CONSTRAINT jarvis_pending_schedule_actions_agent_key_check
    CHECK (agent_key = ANY (ARRAY['main'::text, 'melusi'::text]));

ALTER TABLE public.jarvis_pending_schedule_actions
  ADD CONSTRAINT jarvis_pending_schedule_actions_summary_check
    CHECK (char_length(btrim(summary)) >= 1);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_pending_schedule_actions TO authenticated;

CREATE INDEX jarvis_pending_schedule_actions_user_status_created_idx
  ON public.jarvis_pending_schedule_actions (user_id, status, created_at DESC);

CREATE INDEX jarvis_pending_schedule_actions_thread_status_idx
  ON public.jarvis_pending_schedule_actions (thread_id, status)
  WHERE thread_id IS NOT NULL;

CREATE TRIGGER set_jarvis_pending_schedule_actions_updated_at
  BEFORE UPDATE ON public.jarvis_pending_schedule_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own jarvis pending schedule actions" ON public.jarvis_pending_schedule_actions
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE OR REPLACE FUNCTION public.validate_jarvis_schedule_override_references()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
AS $function$
DECLARE
  item_schedule_id uuid;
BEGIN
  IF NEW.schedule_item_id IS NOT NULL THEN
    SELECT schedule_id
    INTO item_schedule_id
    FROM public.jarvis_schedule_items
    WHERE id = NEW.schedule_item_id
      AND user_id = NEW.user_id;

    IF item_schedule_id IS NULL OR item_schedule_id <> NEW.schedule_id THEN
      RAISE EXCEPTION 'jarvis schedule override item must belong to the same schedule';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER validate_jarvis_schedule_override_references
  BEFORE INSERT OR UPDATE ON public.jarvis_schedule_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_jarvis_schedule_override_references();

CREATE OR REPLACE FUNCTION public.bootstrap_jarvis_schedule_with_items(
  p_name text,
  p_description text,
  p_start_date date,
  p_end_date date,
  p_timezone text,
  p_status text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_existing_id uuid;
  v_schedule_id uuid;
  v_item jsonb;
  v_item_count integer := 0;
  v_trimmed_name text;
  v_trimmed_timezone text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  v_trimmed_name := btrim(coalesce(p_name, ''));
  v_trimmed_timezone := btrim(coalesce(p_timezone, ''));

  IF char_length(v_trimmed_name) < 1 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_name');
  END IF;

  IF char_length(v_trimmed_timezone) < 1 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_timezone');
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_date_range');
  END IF;

  IF p_status NOT IN ('draft'::text, 'active'::text, 'archived'::text) THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_status');
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'::text THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_items');
  END IF;

  SELECT id
  INTO v_existing_id
  FROM public.jarvis_schedules
  WHERE user_id = v_user_id
    AND name = v_trimmed_name
    AND start_date = p_start_date
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    SELECT count(*)
    INTO v_item_count
    FROM public.jarvis_schedule_items
    WHERE schedule_id = v_existing_id
      AND user_id = v_user_id;

    RETURN jsonb_build_object(
      'success', true,
      'seeded', false,
      'schedule_id', v_existing_id,
      'item_count', v_item_count
    );
  END IF;

  INSERT INTO public.jarvis_schedules (
    user_id,
    name,
    description,
    start_date,
    end_date,
    timezone,
    status
  )
  VALUES (
    v_user_id,
    v_trimmed_name,
    nullif(btrim(coalesce(p_description, '')), ''),
    p_start_date,
    p_end_date,
    v_trimmed_timezone,
    p_status
  )
  RETURNING id INTO v_schedule_id;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_items) AS value
  LOOP
    IF jsonb_typeof(v_item) <> 'object'::text THEN
      RAISE EXCEPTION 'invalid schedule item payload';
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
      notes,
      metadata,
      sort_order
    )
    VALUES (
      v_user_id,
      v_schedule_id,
      (v_item->>'day_of_week')::smallint,
      (v_item->>'effective_start_date')::date,
      NULLIF(v_item->>'effective_end_date', '')::date,
      (v_item->>'start_time')::time,
      NULLIF(v_item->>'end_time', '')::time,
      btrim(v_item->>'title'),
      v_item->>'category',
      nullif(btrim(coalesce(v_item->>'notes', '')), ''),
      coalesce(v_item->'metadata', '{}'::jsonb),
      coalesce((v_item->>'sort_order')::smallint, 0)
    );

    v_item_count := v_item_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'seeded', true,
    'schedule_id', v_schedule_id,
    'item_count', v_item_count
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.bootstrap_jarvis_schedule_with_items(
  text,
  text,
  date,
  date,
  text,
  text,
  jsonb
) TO authenticated;
