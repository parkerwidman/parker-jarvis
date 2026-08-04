ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS life_area_id uuid;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_life_area_id_fkey
    FOREIGN KEY (life_area_id) REFERENCES public.life_areas(id) ON DELETE SET NULL;

CREATE INDEX tasks_user_life_area_idx
  ON public.tasks (user_id, life_area_id);

ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS life_area_id uuid;

ALTER TABLE public.memories
  ADD CONSTRAINT memories_life_area_id_fkey
    FOREIGN KEY (life_area_id) REFERENCES public.life_areas(id) ON DELETE SET NULL;

CREATE INDEX memories_user_life_area_idx
  ON public.memories (user_id, life_area_id);

CREATE TABLE public.projects (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id      uuid                     DEFAULT auth.uid() NOT NULL,
  life_area_id uuid,
  name         text                     NOT NULL,
  description  text,
  status       text                     DEFAULT 'active'::text NOT NULL,
  priority     text                     DEFAULT 'medium'::text NOT NULL,
  due_at       timestamp with time zone,
  metadata     jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  created_at   timestamp with time zone DEFAULT now() NOT NULL,
  updated_at   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.projects
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_pkey PRIMARY KEY (id);

ALTER TABLE public.projects
  ADD CONSTRAINT projects_name_check
    CHECK (char_length(name) >= 1 AND char_length(name) <= 200);

ALTER TABLE public.projects
  ADD CONSTRAINT projects_priority_check
    CHECK (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]));

ALTER TABLE public.projects
  ADD CONSTRAINT projects_status_check
    CHECK (status = ANY (ARRAY['idea'::text, 'active'::text, 'paused'::text, 'completed'::text, 'archived'::text]));

ALTER TABLE public.projects
  ADD CONSTRAINT projects_life_area_id_fkey
    FOREIGN KEY (life_area_id) REFERENCES public.life_areas(id) ON DELETE SET NULL;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;

CREATE INDEX projects_user_life_area_idx
  ON public.projects (user_id, life_area_id);

CREATE INDEX projects_user_status_idx
  ON public.projects (user_id, status);

CREATE INDEX projects_user_due_at_idx
  ON public.projects (user_id, due_at);

CREATE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own projects" ON public.projects
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
