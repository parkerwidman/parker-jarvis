CREATE TABLE public.agent_threads (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id         uuid                     DEFAULT auth.uid() NOT NULL,
  agent_key       text                     NOT NULL,
  thread_type     text                     NOT NULL,
  title           text                     NOT NULL,
  status          text                     DEFAULT 'active'::text NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL,
  last_message_at timestamp with time zone
);

ALTER TABLE public.agent_threads
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.agent_threads
  ADD CONSTRAINT agent_threads_pkey PRIMARY KEY (id);

ALTER TABLE public.agent_threads
  ADD CONSTRAINT agent_threads_agent_key_check
    CHECK (agent_key = ANY (ARRAY['main'::text, 'melusi'::text]));

ALTER TABLE public.agent_threads
  ADD CONSTRAINT agent_threads_thread_type_check
    CHECK (thread_type = ANY (ARRAY['command'::text, 'research'::text, 'campaign'::text]));

ALTER TABLE public.agent_threads
  ADD CONSTRAINT agent_threads_status_check
    CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]));

ALTER TABLE public.agent_threads
  ADD CONSTRAINT agent_threads_title_check
    CHECK (char_length(title) >= 1 AND char_length(title) <= 200);

ALTER TABLE public.agent_threads
  ADD CONSTRAINT agent_threads_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.agent_threads
  ADD CONSTRAINT agent_threads_id_user_agent_key_uq
    UNIQUE (id, user_id, agent_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_threads TO authenticated;

CREATE INDEX agent_threads_user_agent_idx
  ON public.agent_threads (user_id, agent_key);

CREATE INDEX agent_threads_user_type_status_idx
  ON public.agent_threads (user_id, thread_type, status);

CREATE INDEX agent_threads_user_last_message_idx
  ON public.agent_threads (user_id, last_message_at DESC NULLS LAST);

CREATE UNIQUE INDEX agent_threads_one_active_melusi_command_idx
  ON public.agent_threads (user_id)
  WHERE agent_key = 'melusi' AND thread_type = 'command' AND status = 'active';

CREATE TRIGGER set_agent_threads_updated_at
  BEFORE UPDATE ON public.agent_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own agent threads" ON public.agent_threads
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.agent_messages (
  id         uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id    uuid                     DEFAULT auth.uid() NOT NULL,
  thread_id  uuid                     NOT NULL,
  agent_key  text                     NOT NULL,
  role       text                     NOT NULL,
  content    text                     NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.agent_messages
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.agent_messages
  ADD CONSTRAINT agent_messages_pkey PRIMARY KEY (id);

ALTER TABLE public.agent_messages
  ADD CONSTRAINT agent_messages_agent_key_check
    CHECK (agent_key = ANY (ARRAY['main'::text, 'melusi'::text]));

ALTER TABLE public.agent_messages
  ADD CONSTRAINT agent_messages_role_check
    CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text]));

ALTER TABLE public.agent_messages
  ADD CONSTRAINT agent_messages_content_check
    CHECK (char_length(content) >= 1 AND char_length(content) <= 16000);

ALTER TABLE public.agent_messages
  ADD CONSTRAINT agent_messages_thread_owner_fkey
    FOREIGN KEY (thread_id, user_id, agent_key)
    REFERENCES public.agent_threads (id, user_id, agent_key) ON DELETE CASCADE;

ALTER TABLE public.agent_messages
  ADD CONSTRAINT agent_messages_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_messages TO authenticated;

CREATE INDEX agent_messages_user_idx
  ON public.agent_messages (user_id);

CREATE INDEX agent_messages_thread_created_idx
  ON public.agent_messages (thread_id, created_at);

CREATE POLICY "Users manage their own agent messages" ON public.agent_messages
  TO authenticated
  USING (
    (( SELECT auth.uid() AS uid) = user_id)
    AND EXISTS (
      SELECT 1
      FROM public.agent_threads t
      WHERE t.id = thread_id
        AND t.user_id = agent_messages.user_id
        AND t.agent_key = agent_messages.agent_key
    )
  )
  WITH CHECK (
    (( SELECT auth.uid() AS uid) = user_id)
    AND EXISTS (
      SELECT 1
      FROM public.agent_threads t
      WHERE t.id = thread_id
        AND t.user_id = agent_messages.user_id
        AND t.agent_key = agent_messages.agent_key
    )
  );
