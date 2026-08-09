CREATE TABLE public.jarvis_goals (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id      uuid                     NOT NULL,
  title        text                     NOT NULL,
  description  text,
  goal_type    text                     NOT NULL,
  domain       text                     NOT NULL,
  status       text                     DEFAULT 'active'::text NOT NULL,
  sort_order   integer                  DEFAULT 0 NOT NULL,
  completed_at timestamp with time zone,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  updated_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.jarvis_goals
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.jarvis_goals
  ADD CONSTRAINT jarvis_goals_pkey PRIMARY KEY (id);

ALTER TABLE public.jarvis_goals
  ADD CONSTRAINT jarvis_goals_title_check
    CHECK (char_length(title) >= 1 AND char_length(title) <= 200);

ALTER TABLE public.jarvis_goals
  ADD CONSTRAINT jarvis_goals_goal_type_check
    CHECK (goal_type = ANY (ARRAY['short_term'::text, 'three_month'::text, 'long_term'::text]));

ALTER TABLE public.jarvis_goals
  ADD CONSTRAINT jarvis_goals_domain_check
    CHECK (domain = ANY (ARRAY['personal'::text, 'melusi'::text]));

ALTER TABLE public.jarvis_goals
  ADD CONSTRAINT jarvis_goals_status_check
    CHECK (status = ANY (ARRAY['active'::text, 'completed'::text, 'archived'::text]));

ALTER TABLE public.jarvis_goals
  ADD CONSTRAINT jarvis_goals_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_goals TO authenticated;

CREATE INDEX jarvis_goals_user_type_domain_sort_idx
  ON public.jarvis_goals (user_id, goal_type, domain, sort_order, created_at);

CREATE INDEX jarvis_goals_user_status_idx
  ON public.jarvis_goals (user_id, status);

CREATE TRIGGER set_jarvis_goals_updated_at
  BEFORE UPDATE ON public.jarvis_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own jarvis goals" ON public.jarvis_goals
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.jarvis_goal_levels (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id    uuid                     NOT NULL,
  goal_id    uuid                     NOT NULL,
  name       text                     NOT NULL,
  position   integer                  NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.jarvis_goal_levels
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.jarvis_goal_levels
  ADD CONSTRAINT jarvis_goal_levels_pkey PRIMARY KEY (id);

ALTER TABLE public.jarvis_goal_levels
  ADD CONSTRAINT jarvis_goal_levels_name_check
    CHECK (char_length(name) >= 1 AND char_length(name) <= 200);

ALTER TABLE public.jarvis_goal_levels
  ADD CONSTRAINT jarvis_goal_levels_goal_id_position_key
    UNIQUE (goal_id, position);

ALTER TABLE public.jarvis_goal_levels
  ADD CONSTRAINT jarvis_goal_levels_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.jarvis_goal_levels
  ADD CONSTRAINT jarvis_goal_levels_goal_id_fkey
    FOREIGN KEY (goal_id) REFERENCES public.jarvis_goals(id) ON DELETE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_goal_levels TO authenticated;

CREATE INDEX jarvis_goal_levels_user_goal_idx
  ON public.jarvis_goal_levels (user_id, goal_id);

CREATE INDEX jarvis_goal_levels_goal_position_idx
  ON public.jarvis_goal_levels (goal_id, position);

CREATE TRIGGER set_jarvis_goal_levels_updated_at
  BEFORE UPDATE ON public.jarvis_goal_levels
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own jarvis goal levels" ON public.jarvis_goal_levels
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS goal_id uuid;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS goal_level_id uuid;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS position integer;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS blocked_at timestamp with time zone;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS blocked_reason text;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_goal_id_fkey
    FOREIGN KEY (goal_id) REFERENCES public.jarvis_goals(id) ON DELETE SET NULL;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_goal_level_id_fkey
    FOREIGN KEY (goal_level_id) REFERENCES public.jarvis_goal_levels(id) ON DELETE SET NULL;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_blocked_reason_requires_blocked_at_check
    CHECK (blocked_at IS NOT NULL OR blocked_reason IS NULL);

CREATE INDEX tasks_user_goal_idx
  ON public.tasks (user_id, goal_id)
  WHERE goal_id IS NOT NULL;

CREATE INDEX tasks_user_goal_level_idx
  ON public.tasks (user_id, goal_level_id)
  WHERE goal_level_id IS NOT NULL;

CREATE UNIQUE INDEX tasks_goal_level_position_key
  ON public.tasks (goal_level_id, position)
  WHERE goal_level_id IS NOT NULL AND position IS NOT NULL;

ALTER TABLE public.jarvis_profiles
  ADD COLUMN IF NOT EXISTS today_priority_goal_id uuid;

ALTER TABLE public.jarvis_profiles
  ADD CONSTRAINT jarvis_profiles_today_priority_goal_id_fkey
    FOREIGN KEY (today_priority_goal_id) REFERENCES public.jarvis_goals(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.validate_jarvis_goal_level_user_id()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
DECLARE
  goal_owner uuid;
BEGIN
  SELECT user_id INTO goal_owner
  FROM public.jarvis_goals
  WHERE id = NEW.goal_id;

  IF goal_owner IS NULL THEN
    RAISE EXCEPTION 'jarvis goal level must reference an existing goal';
  END IF;

  IF goal_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'jarvis goal level user must match parent goal user';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER validate_jarvis_goal_level_user_id
  BEFORE INSERT OR UPDATE ON public.jarvis_goal_levels
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_jarvis_goal_level_user_id();

CREATE OR REPLACE FUNCTION public.validate_task_goal_references()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
DECLARE
  goal_owner uuid;
  level_owner uuid;
  level_goal_id uuid;
BEGIN
  IF NEW.goal_id IS NOT NULL THEN
    SELECT user_id INTO goal_owner
    FROM public.jarvis_goals
    WHERE id = NEW.goal_id;

    IF goal_owner IS NULL OR goal_owner <> NEW.user_id THEN
      RAISE EXCEPTION 'task goal must belong to the same user';
    END IF;
  END IF;

  IF NEW.goal_level_id IS NOT NULL THEN
    SELECT user_id, goal_id
    INTO level_owner, level_goal_id
    FROM public.jarvis_goal_levels
    WHERE id = NEW.goal_level_id;

    IF level_owner IS NULL OR level_owner <> NEW.user_id THEN
      RAISE EXCEPTION 'task goal level must belong to the same user';
    END IF;

    IF NEW.goal_id IS NULL THEN
      NEW.goal_id := level_goal_id;
    ELSIF NEW.goal_id <> level_goal_id THEN
      RAISE EXCEPTION 'task goal level must belong to the same goal as task.goal_id';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER validate_task_goal_references
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_task_goal_references();

CREATE OR REPLACE FUNCTION public.validate_jarvis_profile_today_priority_goal()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
DECLARE
  goal_owner uuid;
  goal_type_value text;
  goal_status_value text;
BEGIN
  IF NEW.today_priority_goal_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_id, goal_type, status
  INTO goal_owner, goal_type_value, goal_status_value
  FROM public.jarvis_goals
  WHERE id = NEW.today_priority_goal_id;

  IF goal_owner IS NULL OR goal_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'today priority goal must belong to the same user';
  END IF;

  IF goal_type_value <> 'short_term'::text THEN
    RAISE EXCEPTION 'today priority goal must be a short-term goal';
  END IF;

  IF goal_status_value <> 'active'::text THEN
    RAISE EXCEPTION 'today priority goal must be active';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER validate_jarvis_profile_today_priority_goal
  BEFORE INSERT OR UPDATE ON public.jarvis_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_jarvis_profile_today_priority_goal();

GRANT SELECT ON TABLE
  public.jarvis_goals,
  public.jarvis_goal_levels
TO service_role;
