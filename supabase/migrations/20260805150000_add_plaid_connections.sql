CREATE TABLE public.plaid_connections (
  id                          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id                     uuid                     NOT NULL,
  item_id                     text,
  institution_id              text,
  institution_name            text,
  encrypted_access_token      text,
  encryption_version          smallint                 DEFAULT 1 NOT NULL,
  environment                 text                     NOT NULL,
  status                      text                     NOT NULL,
  products                    text[]                   DEFAULT ARRAY['transactions'::text] NOT NULL,
  transactions_cursor         text,
  last_successful_sync_at     timestamp with time zone,
  last_webhook_at             timestamp with time zone,
  last_error_code             text,
  connected_at                timestamp with time zone,
  disconnected_at             timestamp with time zone,
  created_at                  timestamp with time zone DEFAULT now() NOT NULL,
  updated_at                  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.plaid_connections
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.plaid_connections
  ADD CONSTRAINT plaid_connections_pkey PRIMARY KEY (id);

ALTER TABLE public.plaid_connections
  ADD CONSTRAINT plaid_connections_user_id_key UNIQUE (user_id);

ALTER TABLE public.plaid_connections
  ADD CONSTRAINT plaid_connections_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.plaid_connections
  ADD CONSTRAINT plaid_connections_status_check
    CHECK (status IN ('connected', 'reconnect_required', 'error', 'disconnected'));

ALTER TABLE public.plaid_connections
  ADD CONSTRAINT plaid_connections_environment_check
    CHECK (environment IN ('sandbox', 'production'));

ALTER TABLE public.plaid_connections
  ADD CONSTRAINT plaid_connections_encryption_version_check
    CHECK (encryption_version >= 1);

CREATE UNIQUE INDEX plaid_connections_item_id_key
  ON public.plaid_connections (item_id)
  WHERE item_id IS NOT NULL;

CREATE INDEX plaid_connections_user_id_idx
  ON public.plaid_connections (user_id);

CREATE INDEX plaid_connections_status_idx
  ON public.plaid_connections (status);

REVOKE ALL ON TABLE public.plaid_connections FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.plaid_connections TO authenticated;

CREATE TRIGGER set_plaid_connections_updated_at
  BEFORE UPDATE ON public.plaid_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own Plaid connection" ON public.plaid_connections
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
