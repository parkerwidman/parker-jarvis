-- Fix outlook_draft_references access and link rows to auto-execute audits for reconciliation.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outlook_draft_references TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outlook_draft_references TO service_role;

ALTER TABLE public.outlook_draft_references
  ADD COLUMN IF NOT EXISTS action_request_id uuid;

ALTER TABLE public.outlook_draft_references
  DROP CONSTRAINT IF EXISTS outlook_draft_references_action_request_id_fkey;

ALTER TABLE public.outlook_draft_references
  ADD CONSTRAINT outlook_draft_references_action_request_id_fkey
    FOREIGN KEY (action_request_id) REFERENCES public.action_requests (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS outlook_draft_references_action_request_id_idx
  ON public.outlook_draft_references (action_request_id)
  WHERE action_request_id IS NOT NULL;
