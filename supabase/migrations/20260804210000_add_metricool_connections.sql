CREATE TABLE public.metricool_connections (
  id                          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id                     uuid                     NOT NULL,
  status                      text                     NOT NULL,
  brand_id                    text,
  brand_label                 text,
  brand_timezone              text,
  connected_networks          jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  encrypted_access_token      text,
  encrypted_refresh_token     text,
  token_expires_at            timestamp with time zone,
  encrypted_client_information text,
  last_verified_at            timestamp with time zone,
  last_error_code             text,
  created_at                  timestamp with time zone DEFAULT now() NOT NULL,
  updated_at                  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.metricool_connections
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.metricool_connections
  ADD CONSTRAINT metricool_connections_pkey PRIMARY KEY (id);

ALTER TABLE public.metricool_connections
  ADD CONSTRAINT metricool_connections_user_id_key UNIQUE (user_id);

ALTER TABLE public.metricool_connections
  ADD CONSTRAINT metricool_connections_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.metricool_connections
  ADD CONSTRAINT metricool_connections_status_check
  CHECK (status IN ('disconnected', 'connecting', 'connected', 'reconnect_required', 'error'));

CREATE INDEX metricool_connections_user_id_idx
  ON public.metricool_connections (user_id);

CREATE INDEX metricool_connections_status_idx
  ON public.metricool_connections (status);

REVOKE ALL ON TABLE public.metricool_connections FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.metricool_connections TO authenticated;

CREATE TRIGGER set_metricool_connections_updated_at
  BEFORE UPDATE ON public.metricool_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own Metricool connection" ON public.metricool_connections
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));
