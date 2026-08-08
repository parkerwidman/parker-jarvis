CREATE TABLE public.jarvis_daily_rituals (
  user_id        uuid                     NOT NULL,
  ritual_date    date                     NOT NULL,
  timezone       text                     NOT NULL,
  status         text                     NOT NULL,
  briefing_date  date,
  started_at     timestamp with time zone,
  completed_at   timestamp with time zone,
  created_at     timestamp with time zone DEFAULT now() NOT NULL,
  updated_at     timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.jarvis_daily_rituals
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.jarvis_daily_rituals
  ADD CONSTRAINT jarvis_daily_rituals_pkey PRIMARY KEY (user_id, ritual_date);

ALTER TABLE public.jarvis_daily_rituals
  ADD CONSTRAINT jarvis_daily_rituals_status_check
    CHECK (status = ANY (ARRAY['started'::text, 'completed'::text]));

ALTER TABLE public.jarvis_daily_rituals
  ADD CONSTRAINT jarvis_daily_rituals_timezone_check
    CHECK (btrim(timezone) <> ''::text);

ALTER TABLE public.jarvis_daily_rituals
  ADD CONSTRAINT jarvis_daily_rituals_state_check
    CHECK (
      (
        status = 'started'::text
        AND started_at IS NOT NULL
        AND completed_at IS NULL
      )
      OR (
        status = 'completed'::text
        AND started_at IS NOT NULL
        AND completed_at IS NOT NULL
      )
    );

ALTER TABLE public.jarvis_daily_rituals
  ADD CONSTRAINT jarvis_daily_rituals_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT SELECT, INSERT, UPDATE ON public.jarvis_daily_rituals TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.jarvis_daily_rituals TO service_role;

CREATE INDEX jarvis_daily_rituals_user_date_idx
  ON public.jarvis_daily_rituals (user_id, ritual_date DESC);

CREATE TRIGGER set_jarvis_daily_rituals_updated_at
  BEFORE UPDATE ON public.jarvis_daily_rituals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own daily rituals" ON public.jarvis_daily_rituals
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
