ALTER TABLE public.agent_threads
  DROP CONSTRAINT agent_threads_thread_type_check;

ALTER TABLE public.agent_threads
  ADD CONSTRAINT agent_threads_thread_type_check
    CHECK (
      (
        agent_key = 'main'::text
        AND thread_type = 'chat'::text
      )
      OR (
        agent_key = 'melusi'::text
        AND thread_type = ANY (ARRAY['command'::text, 'research'::text, 'campaign'::text])
      )
    );

CREATE INDEX IF NOT EXISTS agent_threads_main_active_activity_idx
  ON public.agent_threads (user_id, last_message_at DESC NULLS LAST, updated_at DESC)
  WHERE agent_key = 'main'::text AND status = 'active'::text;
