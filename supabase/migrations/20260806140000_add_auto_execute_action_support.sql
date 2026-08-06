-- Support auto-executed personal productivity actions and Outlook draft references.

ALTER TABLE public.action_requests
  DROP CONSTRAINT action_requests_action_type_check;

ALTER TABLE public.action_requests
  ADD CONSTRAINT action_requests_action_type_check
    CHECK (
      action_type = ANY (
        ARRAY[
          'create_outlook_calendar_event'::text,
          'create_outlook_reminder'::text,
          'update_outlook_calendar_event'::text,
          'delete_outlook_calendar_event'::text,
          'send_outlook_email'::text,
          'publish_social_post'::text,
          'delete_file'::text,
          'create_task'::text,
          'other'::text
        ]
      )
    );

ALTER TABLE public.action_requests
  ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'approval_required'::text;

ALTER TABLE public.action_requests
  ADD CONSTRAINT action_requests_execution_mode_check
    CHECK (
      execution_mode = ANY (
        ARRAY['approval_required'::text, 'auto_execute'::text]
      )
    );

ALTER TABLE public.action_requests
  ADD COLUMN IF NOT EXISTS idempotency_key text;

ALTER TABLE public.action_requests
  ADD COLUMN IF NOT EXISTS provider_outcome_certainty text;

ALTER TABLE public.action_requests
  ADD CONSTRAINT action_requests_provider_outcome_certainty_check
    CHECK (
      provider_outcome_certainty IS NULL
      OR provider_outcome_certainty = ANY (
        ARRAY['confirmed'::text, 'uncertain'::text, 'failed_before_send'::text]
      )
    );

CREATE UNIQUE INDEX IF NOT EXISTS action_requests_user_action_idempotency_idx
  ON public.action_requests (user_id, action_type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.outlook_draft_references (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  user_id uuid DEFAULT auth.uid() NOT NULL,
  graph_message_id text NOT NULL,
  sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT outlook_draft_references_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE
);

ALTER TABLE public.outlook_draft_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own Outlook draft references"
  ON public.outlook_draft_references
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS outlook_draft_references_user_created_idx
  ON public.outlook_draft_references (user_id, created_at DESC);
