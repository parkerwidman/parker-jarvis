CREATE TABLE public.project_updates (
  id            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id       uuid                     DEFAULT auth.uid() NOT NULL,
  project_id    uuid                     NOT NULL,
  life_area_id  uuid                     NOT NULL,
  update_type   text                     NOT NULL,
  content       text                     NOT NULL,
  created_at    timestamp with time zone DEFAULT now() NOT NULL,
  updated_at    timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.project_updates
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.project_updates
  ADD CONSTRAINT project_updates_pkey PRIMARY KEY (id);

ALTER TABLE public.project_updates
  ADD CONSTRAINT project_updates_update_type_check
    CHECK (update_type = ANY (ARRAY['progress'::text, 'blocker'::text, 'decision'::text, 'note'::text]));

ALTER TABLE public.project_updates
  ADD CONSTRAINT project_updates_content_check
    CHECK (char_length(content) >= 1 AND char_length(content) <= 5000);

ALTER TABLE public.project_updates
  ADD CONSTRAINT project_updates_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.project_updates
  ADD CONSTRAINT project_updates_life_area_id_fkey
    FOREIGN KEY (life_area_id) REFERENCES public.life_areas(id);

ALTER TABLE public.project_updates
  ADD CONSTRAINT project_updates_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_updates TO authenticated;

CREATE INDEX project_updates_user_project_idx
  ON public.project_updates (user_id, project_id);

CREATE INDEX project_updates_user_project_created_idx
  ON public.project_updates (user_id, project_id, created_at DESC);

CREATE INDEX project_updates_user_project_type_idx
  ON public.project_updates (user_id, project_id, update_type);

CREATE TRIGGER set_project_updates_updated_at
  BEFORE UPDATE ON public.project_updates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own project updates" ON public.project_updates
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
