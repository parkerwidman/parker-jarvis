-- Allow one Jarvis user to own multiple Plaid Items.
-- item_id remains globally unique; user_id is indexed but not unique.

ALTER TABLE public.plaid_connections
  DROP CONSTRAINT IF EXISTS plaid_connections_user_id_key;

CREATE INDEX IF NOT EXISTS plaid_connections_user_institution_idx
  ON public.plaid_connections (user_id, institution_id);
