CREATE TABLE public.daily_plans (
  id                 uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id            uuid                     DEFAULT auth.uid() NOT NULL,
  plan_date          date                     NOT NULL,
  timezone           text                     NOT NULL,
  status             text                     DEFAULT 'completed'::text NOT NULL,
  content            text,
  plan_items         jsonb                    DEFAULT '[]'::jsonb NOT NULL,
  source_briefing_id uuid,
  safe_error_message text,
  generated_at       timestamp with time zone,
  created_at         timestamp with time zone DEFAULT now() NOT NULL,
  updated_at         timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.daily_plans
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.daily_plans
  ADD CONSTRAINT daily_plans_pkey PRIMARY KEY (id);

ALTER TABLE public.daily_plans
  ADD CONSTRAINT daily_plans_status_check
    CHECK (status = ANY (ARRAY['generating'::text, 'completed'::text, 'failed'::text]));

ALTER TABLE public.daily_plans
  ADD CONSTRAINT daily_plans_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.daily_plans
  ADD CONSTRAINT daily_plans_source_briefing_id_fkey
    FOREIGN KEY (source_briefing_id) REFERENCES public.morning_briefings(id) ON DELETE SET NULL;

ALTER TABLE public.daily_plans
  ADD CONSTRAINT daily_plans_user_id_plan_date_key
    UNIQUE (user_id, plan_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_plans TO authenticated;

GRANT SELECT, INSERT, UPDATE ON public.daily_plans TO service_role;

CREATE INDEX daily_plans_user_date_idx
  ON public.daily_plans (user_id, plan_date DESC);

CREATE TRIGGER set_daily_plans_updated_at
  BEFORE UPDATE ON public.daily_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own daily plans" ON public.daily_plans
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
