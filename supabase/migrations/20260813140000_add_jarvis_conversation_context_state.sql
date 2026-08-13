CREATE TABLE public.jarvis_conversation_state (
  conversation_id              uuid                     NOT NULL,
  user_id                      uuid                     NOT NULL,
  agent_key                    text                     DEFAULT 'main'::text NOT NULL,
  rolling_summary              text                     DEFAULT ''::text NOT NULL,
  unresolved_questions         jsonb                    DEFAULT '[]'::jsonb NOT NULL,
  active_entities              jsonb                    DEFAULT '[]'::jsonb NOT NULL,
  decisions                    jsonb                    DEFAULT '[]'::jsonb NOT NULL,
  summary_through_message_id   uuid,
  summary_through_created_at   timestamp with time zone,
  summary_version              integer                  DEFAULT 1 NOT NULL,
  created_at                   timestamp with time zone DEFAULT now() NOT NULL,
  updated_at                   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.jarvis_conversation_state
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.jarvis_conversation_state
  ADD CONSTRAINT jarvis_conversation_state_pkey PRIMARY KEY (conversation_id);

ALTER TABLE public.jarvis_conversation_state
  ADD CONSTRAINT jarvis_conversation_state_agent_key_check
    CHECK (agent_key = 'main'::text);

ALTER TABLE public.jarvis_conversation_state
  ADD CONSTRAINT jarvis_conversation_state_rolling_summary_check
    CHECK (char_length(rolling_summary) <= 12000);

ALTER TABLE public.jarvis_conversation_state
  ADD CONSTRAINT jarvis_conversation_state_summary_version_check
    CHECK (summary_version >= 1);

ALTER TABLE public.jarvis_conversation_state
  ADD CONSTRAINT jarvis_conversation_state_unresolved_questions_array_check
    CHECK (jsonb_typeof(unresolved_questions) = 'array'::text);

ALTER TABLE public.jarvis_conversation_state
  ADD CONSTRAINT jarvis_conversation_state_active_entities_array_check
    CHECK (jsonb_typeof(active_entities) = 'array'::text);

ALTER TABLE public.jarvis_conversation_state
  ADD CONSTRAINT jarvis_conversation_state_decisions_array_check
    CHECK (jsonb_typeof(decisions) = 'array'::text);

ALTER TABLE public.jarvis_conversation_state
  ADD CONSTRAINT jarvis_conversation_state_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.jarvis_conversation_state
  ADD CONSTRAINT jarvis_conversation_state_thread_owner_fkey
    FOREIGN KEY (conversation_id, user_id, agent_key)
    REFERENCES public.agent_threads (id, user_id, agent_key) ON DELETE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_conversation_state TO authenticated;

CREATE INDEX jarvis_conversation_state_user_idx
  ON public.jarvis_conversation_state (user_id);

CREATE TRIGGER set_jarvis_conversation_state_updated_at
  BEFORE UPDATE ON public.jarvis_conversation_state
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own conversation state"
  ON public.jarvis_conversation_state
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
