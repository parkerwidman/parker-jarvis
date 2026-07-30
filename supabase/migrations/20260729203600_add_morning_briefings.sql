CREATE TABLE public.morning_briefings (
  id                 uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id            uuid                     DEFAULT auth.uid() NOT NULL,
  briefing_date      date                     NOT NULL,
  timezone           text                     NOT NULL,
  status             text                     DEFAULT 'completed'::text NOT NULL,
  content            text,
  source_counts      jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  safe_error_message text,
  generated_at       timestamp with time zone,
  created_at         timestamp with time zone DEFAULT now() NOT NULL,
  updated_at         timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.morning_briefings
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.morning_briefings
  ADD CONSTRAINT morning_briefings_pkey PRIMARY KEY (id);

ALTER TABLE public.morning_briefings
  ADD CONSTRAINT morning_briefings_status_check
    CHECK (status = ANY (ARRAY['generating'::text, 'completed'::text, 'failed'::text]));

ALTER TABLE public.morning_briefings
  ADD CONSTRAINT morning_briefings_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.morning_briefings
  ADD CONSTRAINT morning_briefings_user_id_briefing_date_key
    UNIQUE (user_id, briefing_date);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.morning_briefings TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.morning_briefings TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.morning_briefings TO service_role;

CREATE INDEX morning_briefings_user_date_idx
  ON public.morning_briefings (user_id, briefing_date DESC);

CREATE TRIGGER set_morning_briefings_updated_at
  BEFORE UPDATE ON public.morning_briefings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own morning briefings" ON public.morning_briefings
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
