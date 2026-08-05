ALTER TABLE public.finance_accounts
  ADD COLUMN source text DEFAULT 'manual'::text NOT NULL;

ALTER TABLE public.finance_accounts
  ADD CONSTRAINT finance_accounts_source_check
    CHECK (source = ANY (ARRAY['manual'::text, 'plaid'::text]));

DROP INDEX IF EXISTS public.finance_accounts_user_active_name_idx;

CREATE UNIQUE INDEX finance_accounts_user_active_name_idx
  ON public.finance_accounts (user_id, lower(name))
  WHERE active = true AND source = 'manual'::text;

ALTER TABLE public.finance_transactions
  DROP CONSTRAINT finance_transactions_source_check;

ALTER TABLE public.finance_transactions
  ADD CONSTRAINT finance_transactions_source_check
    CHECK (source = ANY (ARRAY['manual'::text, 'plaid'::text]));

ALTER TABLE public.finance_transactions
  ADD COLUMN category_user_edited boolean DEFAULT false NOT NULL;

ALTER TABLE public.finance_transactions
  ADD COLUMN personal_or_business_user_edited boolean DEFAULT false NOT NULL;

ALTER TABLE public.finance_transactions
  ADD COLUMN notes_user_edited boolean DEFAULT false NOT NULL;

CREATE TABLE public.plaid_finance_account_mappings (
  id                    uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id               uuid                     NOT NULL,
  plaid_connection_id   uuid                     NOT NULL,
  finance_account_id    uuid                     NOT NULL,
  provider_account_id   text                     NOT NULL,
  provider_observed_at  timestamp with time zone NOT NULL,
  created_at            timestamp with time zone DEFAULT now() NOT NULL,
  updated_at            timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.plaid_finance_account_mappings
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.plaid_finance_account_mappings
  ADD CONSTRAINT plaid_finance_account_mappings_pkey PRIMARY KEY (id);

ALTER TABLE public.plaid_finance_account_mappings
  ADD CONSTRAINT plaid_finance_account_mappings_provider_account_id_check
    CHECK (char_length(provider_account_id) >= 1 AND char_length(provider_account_id) <= 128);

ALTER TABLE public.plaid_finance_account_mappings
  ADD CONSTRAINT plaid_finance_account_mappings_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.plaid_finance_account_mappings
  ADD CONSTRAINT plaid_finance_account_mappings_plaid_connection_id_fkey
    FOREIGN KEY (plaid_connection_id) REFERENCES public.plaid_connections(id) ON DELETE RESTRICT;

ALTER TABLE public.plaid_finance_account_mappings
  ADD CONSTRAINT plaid_finance_account_mappings_finance_account_id_fkey
    FOREIGN KEY (finance_account_id) REFERENCES public.finance_accounts(id) ON DELETE RESTRICT;

ALTER TABLE public.plaid_finance_account_mappings
  ADD CONSTRAINT plaid_finance_account_mappings_connection_provider_key
    UNIQUE (plaid_connection_id, provider_account_id);

CREATE INDEX plaid_finance_account_mappings_user_connection_idx
  ON public.plaid_finance_account_mappings (user_id, plaid_connection_id);

CREATE INDEX plaid_finance_account_mappings_finance_account_idx
  ON public.plaid_finance_account_mappings (finance_account_id);

REVOKE ALL ON TABLE public.plaid_finance_account_mappings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.plaid_finance_account_mappings TO authenticated;

CREATE TRIGGER set_plaid_finance_account_mappings_updated_at
  BEFORE UPDATE ON public.plaid_finance_account_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own Plaid finance account mappings"
  ON public.plaid_finance_account_mappings
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.plaid_finance_transaction_mappings (
  id                            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id                       uuid                     NOT NULL,
  plaid_connection_id           uuid                     NOT NULL,
  finance_transaction_id        uuid                     NOT NULL,
  provider_transaction_id       text                     NOT NULL,
  provider_pending_transaction_id text,
  removed_at                    timestamp with time zone,
  provider_observed_at          timestamp with time zone NOT NULL,
  created_at                    timestamp with time zone DEFAULT now() NOT NULL,
  updated_at                    timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.plaid_finance_transaction_mappings
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.plaid_finance_transaction_mappings
  ADD CONSTRAINT plaid_finance_transaction_mappings_pkey PRIMARY KEY (id);

ALTER TABLE public.plaid_finance_transaction_mappings
  ADD CONSTRAINT plaid_finance_transaction_mappings_provider_transaction_id_check
    CHECK (char_length(provider_transaction_id) >= 1 AND char_length(provider_transaction_id) <= 128);

ALTER TABLE public.plaid_finance_transaction_mappings
  ADD CONSTRAINT plaid_finance_transaction_mappings_provider_pending_id_check
    CHECK (
      provider_pending_transaction_id IS NULL
      OR (
        char_length(provider_pending_transaction_id) >= 1
        AND char_length(provider_pending_transaction_id) <= 128
      )
    );

ALTER TABLE public.plaid_finance_transaction_mappings
  ADD CONSTRAINT plaid_finance_transaction_mappings_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.plaid_finance_transaction_mappings
  ADD CONSTRAINT plaid_finance_transaction_mappings_plaid_connection_id_fkey
    FOREIGN KEY (plaid_connection_id) REFERENCES public.plaid_connections(id) ON DELETE RESTRICT;

ALTER TABLE public.plaid_finance_transaction_mappings
  ADD CONSTRAINT plaid_finance_transaction_mappings_finance_transaction_id_fkey
    FOREIGN KEY (finance_transaction_id) REFERENCES public.finance_transactions(id) ON DELETE RESTRICT;

ALTER TABLE public.plaid_finance_transaction_mappings
  ADD CONSTRAINT plaid_finance_transaction_mappings_connection_provider_key
    UNIQUE (plaid_connection_id, provider_transaction_id);

CREATE INDEX plaid_finance_transaction_mappings_user_connection_idx
  ON public.plaid_finance_transaction_mappings (user_id, plaid_connection_id);

CREATE INDEX plaid_finance_transaction_mappings_finance_transaction_idx
  ON public.plaid_finance_transaction_mappings (finance_transaction_id);

CREATE INDEX plaid_finance_transaction_mappings_pending_provider_idx
  ON public.plaid_finance_transaction_mappings (plaid_connection_id, provider_transaction_id)
  WHERE removed_at IS NULL;

REVOKE ALL ON TABLE public.plaid_finance_transaction_mappings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.plaid_finance_transaction_mappings TO authenticated;

CREATE TRIGGER set_plaid_finance_transaction_mappings_updated_at
  BEFORE UPDATE ON public.plaid_finance_transaction_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own Plaid finance transaction mappings"
  ON public.plaid_finance_transaction_mappings
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

ALTER TABLE public.plaid_connections
  ADD COLUMN last_sync_accounts_created integer,
  ADD COLUMN last_sync_accounts_updated integer,
  ADD COLUMN last_sync_transactions_added integer,
  ADD COLUMN last_sync_transactions_modified integer,
  ADD COLUMN last_sync_transactions_removed integer,
  ADD COLUMN last_sync_unclassified_count integer,
  ADD COLUMN linked_accounts_count integer,
  ADD COLUMN sync_in_progress_at timestamp with time zone;

CREATE OR REPLACE FUNCTION public.validate_plaid_finance_account_mapping_references()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
DECLARE
  connection_owner uuid;
  account_owner uuid;
  account_source text;
BEGIN
  SELECT user_id INTO connection_owner
  FROM public.plaid_connections
  WHERE id = NEW.plaid_connection_id;

  IF connection_owner IS NULL OR connection_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'plaid finance account mapping connection must belong to the same user';
  END IF;

  SELECT user_id, source INTO account_owner, account_source
  FROM public.finance_accounts
  WHERE id = NEW.finance_account_id;

  IF account_owner IS NULL OR account_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'plaid finance account mapping finance account must belong to the same user';
  END IF;

  IF account_source <> 'plaid' THEN
    RAISE EXCEPTION 'plaid finance account mapping requires a plaid finance account';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER validate_plaid_finance_account_mapping_references
  BEFORE INSERT OR UPDATE ON public.plaid_finance_account_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_plaid_finance_account_mapping_references();

CREATE OR REPLACE FUNCTION public.validate_plaid_finance_transaction_mapping_references()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
DECLARE
  connection_owner uuid;
  transaction_owner uuid;
  transaction_source text;
BEGIN
  SELECT user_id INTO connection_owner
  FROM public.plaid_connections
  WHERE id = NEW.plaid_connection_id;

  IF connection_owner IS NULL OR connection_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'plaid finance transaction mapping connection must belong to the same user';
  END IF;

  SELECT user_id, source INTO transaction_owner, transaction_source
  FROM public.finance_transactions
  WHERE id = NEW.finance_transaction_id;

  IF transaction_owner IS NULL OR transaction_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'plaid finance transaction mapping finance transaction must belong to the same user';
  END IF;

  IF transaction_source <> 'plaid' THEN
    RAISE EXCEPTION 'plaid finance transaction mapping requires a plaid finance transaction';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER validate_plaid_finance_transaction_mapping_references
  BEFORE INSERT OR UPDATE ON public.plaid_finance_transaction_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_plaid_finance_transaction_mapping_references();
