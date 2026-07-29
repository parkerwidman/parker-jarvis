-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP EXTENSION pg_net;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE UPDATE ON SEQUENCES FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE UPDATE ON SEQUENCES FROM authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE UPDATE ON SEQUENCES FROM service_role;

CREATE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE TABLE public.action_requests (
  id                 uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id            uuid                     DEFAULT auth.uid() NOT NULL,
  action_type        text                     NOT NULL,
  status             text                     DEFAULT 'pending'::text NOT NULL,
  risk_level         text                     DEFAULT 'approval_required'::text NOT NULL,
  title              text                     NOT NULL,
  summary            text                     NOT NULL,
  payload            jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  result             jsonb,
  safe_error_message text,
  expires_at         timestamp with time zone,
  approved_at        timestamp with time zone,
  rejected_at        timestamp with time zone,
  executed_at        timestamp with time zone,
  created_at         timestamp with time zone DEFAULT now() NOT NULL,
  updated_at         timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.action_requests
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.action_requests
  ADD CONSTRAINT action_requests_action_type_check
    CHECK
    (action_type = ANY (ARRAY['create_outlook_calendar_event'::text, 'update_outlook_calendar_event'::text, 'delete_outlook_calendar_event'::text, 'send_outlook_email'::text,
    'publish_social_post'::text, 'delete_file'::text, 'other'::text]));

ALTER TABLE public.action_requests
  ADD CONSTRAINT action_requests_pkey PRIMARY KEY (id);

ALTER TABLE public.action_requests
  ADD CONSTRAINT action_requests_risk_level_check CHECK (risk_level = ANY (ARRAY['low'::text, 'approval_required'::text, 'strong_confirmation'::text]));

ALTER TABLE public.action_requests
  ADD CONSTRAINT action_requests_status_check
    CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'executing'::text, 'completed'::text, 'rejected'::text, 'failed'::text, 'expired'::text]));

ALTER TABLE public.action_requests
  ADD CONSTRAINT action_requests_summary_check CHECK (char_length(summary) >= 1 AND char_length(summary) <= 2000);

ALTER TABLE public.action_requests
  ADD CONSTRAINT action_requests_title_check CHECK (char_length(title) >= 1 AND char_length(title) <= 250);

ALTER TABLE public.action_requests
  ADD CONSTRAINT action_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.action_requests TO anon;

GRANT ALL ON public.action_requests TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.action_requests TO service_role;

CREATE INDEX action_requests_user_status_created_idx ON public.action_requests (user_id, status, created_at DESC);

CREATE TRIGGER set_action_requests_updated_at
  BEFORE UPDATE ON public.action_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own action requests" ON public.action_requests
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.goals (
  id                 uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id            uuid                     DEFAULT auth.uid() NOT NULL,
  life_area_id       uuid,
  title              text                     NOT NULL,
  description        text,
  success_definition text,
  status             text                     DEFAULT 'active'::text NOT NULL,
  priority           text                     DEFAULT 'medium'::text NOT NULL,
  progress           smallint                 DEFAULT 0 NOT NULL,
  target_date        date,
  created_at         timestamp with time zone DEFAULT now() NOT NULL,
  updated_at         timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.goals
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.goals
  ADD CONSTRAINT goals_pkey PRIMARY KEY (id);

ALTER TABLE public.goals
  ADD CONSTRAINT goals_priority_check CHECK (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]));

ALTER TABLE public.goals
  ADD CONSTRAINT goals_progress_check CHECK (progress >= 0 AND progress <= 100);

ALTER TABLE public.goals
  ADD CONSTRAINT goals_status_check CHECK (status = ANY (ARRAY['active'::text, 'paused'::text, 'completed'::text, 'abandoned'::text]));

ALTER TABLE public.goals
  ADD CONSTRAINT goals_title_check CHECK (char_length(title) >= 1 AND char_length(title) <= 200);

ALTER TABLE public.goals
  ADD CONSTRAINT goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.goals TO anon;

GRANT ALL ON public.goals TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.goals TO service_role;

CREATE INDEX goals_user_status_priority_idx ON public.goals (user_id, status, priority);

CREATE TRIGGER set_goals_updated_at
  BEFORE UPDATE ON public.goals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own goals" ON public.goals
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.jarvis_profiles (
  user_id             uuid                     DEFAULT auth.uid() NOT NULL,
  preferred_name      text,
  timezone            text,
  communication_style text,
  current_focus       text,
  preferences         jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  created_at          timestamp with time zone DEFAULT now() NOT NULL,
  updated_at          timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.jarvis_profiles
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.jarvis_profiles
  ADD CONSTRAINT jarvis_profiles_pkey PRIMARY KEY (user_id);

ALTER TABLE public.jarvis_profiles
  ADD CONSTRAINT jarvis_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.jarvis_profiles TO anon;

GRANT ALL ON public.jarvis_profiles TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.jarvis_profiles TO service_role;

CREATE TRIGGER set_jarvis_profiles_updated_at
  BEFORE UPDATE ON public.jarvis_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own Jarvis profile" ON public.jarvis_profiles
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.life_areas (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id     uuid                     DEFAULT auth.uid() NOT NULL,
  name        text                     NOT NULL,
  description text,
  active      boolean                  DEFAULT true NOT NULL,
  sort_order  integer                  DEFAULT 0 NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL,
  updated_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.life_areas
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.life_areas
  ADD CONSTRAINT life_areas_pkey PRIMARY KEY (id);

ALTER TABLE public.goals
  ADD CONSTRAINT goals_life_area_id_fkey FOREIGN KEY (life_area_id) REFERENCES public.life_areas(id) ON DELETE SET NULL;

ALTER TABLE public.life_areas
  ADD CONSTRAINT life_areas_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.life_areas
  ADD CONSTRAINT life_areas_user_id_name_key UNIQUE (user_id, name);

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.life_areas TO anon;

GRANT ALL ON public.life_areas TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.life_areas TO service_role;

CREATE INDEX life_areas_user_active_idx ON public.life_areas (user_id, active);

CREATE TRIGGER set_life_areas_updated_at
  BEFORE UPDATE ON public.life_areas
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own life areas" ON public.life_areas
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.memories (
  id                uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id           uuid                     DEFAULT auth.uid() NOT NULL,
  category          text                     DEFAULT 'context'::text NOT NULL,
  content           text                     NOT NULL,
  source            text                     DEFAULT 'user'::text NOT NULL,
  importance        smallint                 DEFAULT 3 NOT NULL,
  confirmed_by_user boolean                  DEFAULT false NOT NULL,
  active            boolean                  DEFAULT true NOT NULL,
  metadata          jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  created_at        timestamp with time zone DEFAULT now() NOT NULL,
  updated_at        timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.memories
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.memories
  ADD CONSTRAINT memories_content_check CHECK (char_length(content) >= 1 AND char_length(content) <= 10000);

ALTER TABLE public.memories
  ADD CONSTRAINT memories_importance_check CHECK (importance >= 1 AND importance <= 5);

ALTER TABLE public.memories
  ADD CONSTRAINT memories_pkey PRIMARY KEY (id);

ALTER TABLE public.memories
  ADD CONSTRAINT memories_source_check CHECK (source = ANY (ARRAY['user'::text, 'jarvis'::text, 'import'::text, 'integration'::text]));

ALTER TABLE public.memories
  ADD CONSTRAINT memories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.memories TO anon;

GRANT ALL ON public.memories TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.memories TO service_role;

CREATE INDEX memories_user_active_importance_idx ON public.memories (user_id, active, importance DESC);

CREATE TRIGGER set_memories_updated_at
  BEFORE UPDATE ON public.memories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own memories" ON public.memories
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.microsoft_connections (
  user_id                 uuid                     DEFAULT auth.uid() NOT NULL,
  microsoft_user_id       text                     NOT NULL,
  tenant_id               text                     NOT NULL,
  email                   text,
  display_name            text,
  access_token_encrypted  text                     NOT NULL,
  refresh_token_encrypted text                     NOT NULL,
  access_token_expires_at timestamp with time zone NOT NULL,
  granted_scopes          text                     NOT NULL,
  connected_at            timestamp with time zone DEFAULT now() NOT NULL,
  updated_at              timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.microsoft_connections
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.microsoft_connections
  ADD CONSTRAINT microsoft_connections_pkey PRIMARY KEY (user_id);

ALTER TABLE public.microsoft_connections
  ADD CONSTRAINT microsoft_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.microsoft_connections TO anon;

GRANT ALL ON public.microsoft_connections TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.microsoft_connections TO service_role;

CREATE TRIGGER set_microsoft_connections_updated_at
  BEFORE UPDATE ON public.microsoft_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own Microsoft connection" ON public.microsoft_connections
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.tasks (
  id           uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id      uuid                     DEFAULT auth.uid() NOT NULL,
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
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_priority_check CHECK (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]));

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_status_check CHECK (status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'done'::text]));

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.tasks TO anon;

GRANT ALL ON public.tasks TO authenticated;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.tasks TO service_role;

CREATE POLICY "Users can create their own tasks" ON public.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Users can delete their own tasks" ON public.tasks
  FOR DELETE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Users can update their own tasks" ON public.tasks
  FOR UPDATE
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "Users can view their own tasks" ON public.tasks
  FOR SELECT
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();
