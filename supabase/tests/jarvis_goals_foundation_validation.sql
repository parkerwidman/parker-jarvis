-- Minimal bootstrap for jarvis goals foundation validation (local only).
CREATE SCHEMA IF NOT EXISTS auth;

CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION auth.uid()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  AS $$ SELECT NULL::uuid $$;

CREATE TABLE public.jarvis_profiles (
  user_id             uuid                     NOT NULL,
  preferred_name      text,
  timezone            text,
  communication_style text,
  current_focus       text,
  preferences         jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  created_at          timestamp with time zone DEFAULT now() NOT NULL,
  updated_at          timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.jarvis_profiles
  ADD CONSTRAINT jarvis_profiles_pkey PRIMARY KEY (user_id);

CREATE TABLE public.tasks (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id      uuid                     NOT NULL,
  title        text                     NOT NULL,
  notes        text,
  status       text                     DEFAULT 'todo'::text NOT NULL,
  priority     text                     DEFAULT 'medium'::text NOT NULL,
  due_at       timestamp with time zone,
  completed_at timestamp with time zone,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  updated_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_status_check CHECK (status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'done'::text]));

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_priority_check CHECK (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]));

CREATE TABLE public.goals (
  id    uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL
);

ALTER TABLE public.goals
  ADD CONSTRAINT goals_pkey PRIMARY KEY (id);

DO $validate$
DECLARE
  user_a uuid := '11111111-1111-1111-1111-111111111111';
  user_b uuid := '22222222-2222-2222-2222-222222222222';
  goal_personal_short uuid;
  goal_melusi_short uuid;
  goal_personal_three uuid;
  goal_melusi_long uuid;
  goal_archived uuid;
  level_a uuid;
  level_b uuid;
  level_other_goal uuid;
  task_id uuid;
BEGIN
  INSERT INTO auth.users (id) VALUES (user_a), (user_b);

  INSERT INTO public.jarvis_profiles (user_id) VALUES (user_a), (user_b);

  -- A: existing task insert without goal fields
  INSERT INTO public.tasks (user_id, title)
  VALUES (user_a, 'Standalone task')
  RETURNING id INTO task_id;

  -- B/C: personal and melusi short-term goals
  INSERT INTO public.jarvis_goals (user_id, title, goal_type, domain)
  VALUES (user_a, 'Personal short', 'short_term', 'personal')
  RETURNING id INTO goal_personal_short;

  INSERT INTO public.jarvis_goals (user_id, title, goal_type, domain)
  VALUES (user_a, 'Melusi short', 'short_term', 'melusi')
  RETURNING id INTO goal_melusi_short;

  -- D/E: three-month and long-term goals
  INSERT INTO public.jarvis_goals (user_id, title, goal_type, domain)
  VALUES (user_a, 'Personal three month', 'three_month', 'personal')
  RETURNING id INTO goal_personal_three;

  INSERT INTO public.jarvis_goals (user_id, title, goal_type, domain)
  VALUES (user_a, 'Melusi long', 'long_term', 'melusi')
  RETURNING id INTO goal_melusi_long;

  INSERT INTO public.jarvis_goals (user_id, title, goal_type, domain, status)
  VALUES (user_a, 'Archived short', 'short_term', 'personal', 'archived')
  RETURNING id INTO goal_archived;

  -- F/G: invalid goal_type and domain rejected
  BEGIN
    INSERT INTO public.jarvis_goals (user_id, title, goal_type, domain)
    VALUES (user_a, 'Bad type', 'weekly', 'personal');
    RAISE EXCEPTION 'expected invalid goal_type rejection';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.jarvis_goals (user_id, title, goal_type, domain)
    VALUES (user_a, 'Bad domain', 'short_term', 'work');
    RAISE EXCEPTION 'expected invalid domain rejection';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- H: level belongs to valid goal
  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, goal_personal_short, 'Level 1', 10)
  RETURNING id INTO level_a;

  -- I: duplicate level position rejected
  BEGIN
    INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
    VALUES (user_a, goal_personal_short, 'Duplicate position', 10);
    RAISE EXCEPTION 'expected duplicate level position rejection';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- J: same position under different goals allowed
  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, goal_melusi_short, 'Level 1', 10)
  RETURNING id INTO level_b;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, goal_personal_three, 'Level 1', 10)
  RETURNING id INTO level_other_goal;

  -- K: task attaches to goal + matching level
  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
  VALUES (user_a, 'Roadmap task', goal_personal_short, level_a, 10);

  -- K-A: duplicate position within the same goal level rejected
  BEGIN
    INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
    VALUES (user_a, 'Duplicate position task', goal_personal_short, level_a, 10);
    RAISE EXCEPTION 'expected duplicate task position within level rejection';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- K-B: same position across different goal levels allowed
  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
  VALUES (user_a, 'Same position other level', goal_melusi_short, level_b, 10);

  -- K-C: NULL position allowed for level-attached tasks
  INSERT INTO public.tasks (user_id, title, goal_level_id, position)
  VALUES (user_a, 'Unpositioned level task', level_other_goal, NULL);

  -- L: task level attachment resolves goal_id
  INSERT INTO public.tasks (user_id, title, goal_level_id, position)
  VALUES (user_a, 'Level-only task', level_b, 20);

  -- M: cross-goal level mismatch rejected
  BEGIN
    INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id)
    VALUES (user_a, 'Mismatched task', goal_personal_short, level_b);
    RAISE EXCEPTION 'expected cross-goal level mismatch rejection';
  EXCEPTION WHEN raise_exception THEN
    NULL;
  END;

  -- N/O: cross-user goal/level attachment rejected
  BEGIN
    INSERT INTO public.tasks (user_id, title, goal_id)
    VALUES (user_b, 'Cross-user goal task', goal_personal_short);
    RAISE EXCEPTION 'expected cross-user goal rejection';
  EXCEPTION WHEN raise_exception THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.tasks (user_id, title, goal_level_id)
    VALUES (user_b, 'Cross-user level task', level_a);
    RAISE EXCEPTION 'expected cross-user level rejection';
  EXCEPTION WHEN raise_exception THEN
    NULL;
  END;

  -- P covered by standalone task above

  -- Q: blocked_reason without blocked_at rejected
  BEGIN
    INSERT INTO public.tasks (user_id, title, blocked_reason)
    VALUES (user_a, 'Bad blocked task', 'waiting');
    RAISE EXCEPTION 'expected blocked_reason without blocked_at rejection';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- R: blocked_at without blocked_reason allowed
  INSERT INTO public.tasks (user_id, title, blocked_at)
  VALUES (user_a, 'Blocked without reason', now());

  -- S: profile can point to active short-term goal
  UPDATE public.jarvis_profiles
  SET today_priority_goal_id = goal_personal_short
  WHERE user_id = user_a;

  -- T/U/V/W: invalid profile priority goal rejected
  BEGIN
    UPDATE public.jarvis_profiles
    SET today_priority_goal_id = goal_personal_three
    WHERE user_id = user_a;
    RAISE EXCEPTION 'expected three-month priority rejection';
  EXCEPTION WHEN raise_exception THEN
    NULL;
  END;

  BEGIN
    UPDATE public.jarvis_profiles
    SET today_priority_goal_id = goal_melusi_long
    WHERE user_id = user_a;
    RAISE EXCEPTION 'expected long-term priority rejection';
  EXCEPTION WHEN raise_exception THEN
    NULL;
  END;

  BEGIN
    UPDATE public.jarvis_profiles
    SET today_priority_goal_id = goal_archived
    WHERE user_id = user_a;
    RAISE EXCEPTION 'expected archived priority rejection';
  EXCEPTION WHEN raise_exception THEN
    NULL;
  END;

  BEGIN
    UPDATE public.jarvis_profiles
    SET today_priority_goal_id = goal_personal_short
    WHERE user_id = user_b;
    RAISE EXCEPTION 'expected cross-user priority rejection';
  EXCEPTION WHEN raise_exception THEN
    NULL;
  END;

  -- X: clearing today_priority_goal_id works
  UPDATE public.jarvis_profiles
  SET today_priority_goal_id = NULL
  WHERE user_id = user_a;

  -- Y/Z: legacy goals and current_focus remain present
  IF to_regclass('public.goals') IS NULL THEN
    RAISE EXCEPTION 'legacy public.goals missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'jarvis_profiles'
      AND column_name = 'current_focus'
  ) THEN
    RAISE EXCEPTION 'jarvis_profiles.current_focus missing';
  END IF;

  RAISE NOTICE 'jarvis goals foundation validation passed';
END;
$validate$;
