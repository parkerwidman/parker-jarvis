ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS project_id uuid;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX tasks_user_project_idx
  ON public.tasks (user_id, project_id);

CREATE INDEX tasks_user_project_life_area_idx
  ON public.tasks (user_id, project_id, life_area_id);
