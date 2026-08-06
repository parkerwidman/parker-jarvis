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

  IF transaction_source NOT IN ('plaid'::text, 'rocket_money_csv'::text) THEN
    RAISE EXCEPTION 'plaid finance transaction mapping requires a plaid or rocket_money_csv finance transaction';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TABLE public.plaid_transaction_match_review_items (
  id                            uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id                       uuid                     NOT NULL,
  plaid_connection_id           uuid                     NOT NULL,
  finance_account_id            uuid                     NOT NULL,
  plaid_transaction_id          text                     NOT NULL,
  pending_plaid_transaction_id  text,
  transaction_date              date                     NOT NULL,
  posted_date                   date,
  amount                        numeric(14, 2)           NOT NULL,
  merchant                      text,
  description                   text,
  transaction_type              text                     NOT NULL,
  review_status                 text                     DEFAULT 'pending'::text NOT NULL,
  resolved_finance_transaction_id uuid,
  created_at                    timestamp with time zone DEFAULT now() NOT NULL,
  updated_at                    timestamp with time zone DEFAULT now() NOT NULL,
  resolved_at                   timestamp with time zone
);

ALTER TABLE public.plaid_transaction_match_review_items
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.plaid_transaction_match_review_items
  ADD CONSTRAINT plaid_transaction_match_review_items_pkey PRIMARY KEY (id);

ALTER TABLE public.plaid_transaction_match_review_items
  ADD CONSTRAINT plaid_transaction_match_review_items_plaid_transaction_id_check
    CHECK (char_length(plaid_transaction_id) >= 1 AND char_length(plaid_transaction_id) <= 128);

ALTER TABLE public.plaid_transaction_match_review_items
  ADD CONSTRAINT plaid_transaction_match_review_items_pending_plaid_transaction_id_check
    CHECK (
      pending_plaid_transaction_id IS NULL
      OR (
        char_length(pending_plaid_transaction_id) >= 1
        AND char_length(pending_plaid_transaction_id) <= 128
      )
    );

ALTER TABLE public.plaid_transaction_match_review_items
  ADD CONSTRAINT plaid_transaction_match_review_items_amount_check
    CHECK (amount <> 0::numeric);

ALTER TABLE public.plaid_transaction_match_review_items
  ADD CONSTRAINT plaid_transaction_match_review_items_merchant_check
    CHECK (merchant IS NULL OR (char_length(merchant) >= 1 AND char_length(merchant) <= 200));

ALTER TABLE public.plaid_transaction_match_review_items
  ADD CONSTRAINT plaid_transaction_match_review_items_description_check
    CHECK (description IS NULL OR (char_length(description) >= 1 AND char_length(description) <= 500));

ALTER TABLE public.plaid_transaction_match_review_items
  ADD CONSTRAINT plaid_transaction_match_review_items_transaction_type_check
    CHECK (transaction_type = ANY (ARRAY[
      'income'::text,
      'expense'::text,
      'refund'::text,
      'transfer'::text,
      'adjustment'::text
    ]));

ALTER TABLE public.plaid_transaction_match_review_items
  ADD CONSTRAINT plaid_transaction_match_review_items_review_status_check
    CHECK (review_status = ANY (ARRAY[
      'pending'::text,
      'matched_existing'::text,
      'imported_new'::text,
      'removed'::text
    ]));

ALTER TABLE public.plaid_transaction_match_review_items
  ADD CONSTRAINT plaid_transaction_match_review_items_posted_date_check
    CHECK (posted_date IS NOT NULL);

ALTER TABLE public.plaid_transaction_match_review_items
  ADD CONSTRAINT plaid_transaction_match_review_items_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.plaid_transaction_match_review_items
  ADD CONSTRAINT plaid_transaction_match_review_items_plaid_connection_id_fkey
    FOREIGN KEY (plaid_connection_id) REFERENCES public.plaid_connections(id) ON DELETE RESTRICT;

ALTER TABLE public.plaid_transaction_match_review_items
  ADD CONSTRAINT plaid_transaction_match_review_items_finance_account_id_fkey
    FOREIGN KEY (finance_account_id) REFERENCES public.finance_accounts(id) ON DELETE RESTRICT;

ALTER TABLE public.plaid_transaction_match_review_items
  ADD CONSTRAINT plaid_transaction_match_review_items_resolved_finance_transaction_id_fkey
    FOREIGN KEY (resolved_finance_transaction_id) REFERENCES public.finance_transactions(id) ON DELETE RESTRICT;

ALTER TABLE public.plaid_transaction_match_review_items
  ADD CONSTRAINT plaid_transaction_match_review_items_connection_provider_key
    UNIQUE (plaid_connection_id, plaid_transaction_id);

REVOKE ALL ON TABLE public.plaid_transaction_match_review_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.plaid_transaction_match_review_items TO authenticated;

CREATE INDEX plaid_transaction_match_review_items_user_connection_idx
  ON public.plaid_transaction_match_review_items (user_id, plaid_connection_id);

CREATE INDEX plaid_transaction_match_review_items_user_status_idx
  ON public.plaid_transaction_match_review_items (user_id, review_status);

CREATE INDEX plaid_transaction_match_review_items_connection_status_idx
  ON public.plaid_transaction_match_review_items (plaid_connection_id, review_status);

CREATE INDEX plaid_transaction_match_review_items_finance_account_idx
  ON public.plaid_transaction_match_review_items (finance_account_id);

CREATE TRIGGER set_plaid_transaction_match_review_items_updated_at
  BEFORE UPDATE ON public.plaid_transaction_match_review_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own Plaid transaction match review items"
  ON public.plaid_transaction_match_review_items
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.plaid_transaction_match_review_candidates (
  id                     uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id                uuid                     NOT NULL,
  review_item_id         uuid                     NOT NULL,
  finance_transaction_id uuid                     NOT NULL,
  match_score            smallint                 NOT NULL,
  match_reasons          text[]                   NOT NULL,
  created_at             timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.plaid_transaction_match_review_candidates
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.plaid_transaction_match_review_candidates
  ADD CONSTRAINT plaid_transaction_match_review_candidates_pkey PRIMARY KEY (id);

ALTER TABLE public.plaid_transaction_match_review_candidates
  ADD CONSTRAINT plaid_transaction_match_review_candidates_match_score_check
    CHECK (match_score >= 0 AND match_score <= 100);

ALTER TABLE public.plaid_transaction_match_review_candidates
  ADD CONSTRAINT plaid_transaction_match_review_candidates_match_reasons_check
    CHECK (
      cardinality(match_reasons) >= 1
      AND cardinality(match_reasons) <= 20
      AND match_reasons <@ ARRAY[
        'amount'::text,
        'date'::text,
        'posted_date'::text,
        'merchant'::text,
        'description'::text,
        'transaction_type'::text,
        'account'::text
      ]::text[]
    );

ALTER TABLE public.plaid_transaction_match_review_candidates
  ADD CONSTRAINT plaid_transaction_match_review_candidates_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.plaid_transaction_match_review_candidates
  ADD CONSTRAINT plaid_transaction_match_review_candidates_review_item_id_fkey
    FOREIGN KEY (review_item_id) REFERENCES public.plaid_transaction_match_review_items(id) ON DELETE CASCADE;

ALTER TABLE public.plaid_transaction_match_review_candidates
  ADD CONSTRAINT plaid_transaction_match_review_candidates_finance_transaction_id_fkey
    FOREIGN KEY (finance_transaction_id) REFERENCES public.finance_transactions(id) ON DELETE CASCADE;

ALTER TABLE public.plaid_transaction_match_review_candidates
  ADD CONSTRAINT plaid_transaction_match_review_candidates_review_transaction_key
    UNIQUE (review_item_id, finance_transaction_id);

REVOKE ALL ON TABLE public.plaid_transaction_match_review_candidates FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.plaid_transaction_match_review_candidates TO authenticated;

CREATE INDEX plaid_transaction_match_review_candidates_user_idx
  ON public.plaid_transaction_match_review_candidates (user_id);

CREATE INDEX plaid_transaction_match_review_candidates_review_item_idx
  ON public.plaid_transaction_match_review_candidates (review_item_id);

CREATE INDEX plaid_transaction_match_review_candidates_finance_transaction_idx
  ON public.plaid_transaction_match_review_candidates (finance_transaction_id);

CREATE POLICY "Users manage their own Plaid transaction match review candidates"
  ON public.plaid_transaction_match_review_candidates
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE OR REPLACE FUNCTION public.validate_plaid_transaction_match_review_item_references()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
DECLARE
  connection_owner uuid;
  account_owner uuid;
  resolved_owner uuid;
  resolved_source text;
  account_mapping_exists boolean;
BEGIN
  SELECT user_id INTO connection_owner
  FROM public.plaid_connections
  WHERE id = NEW.plaid_connection_id;

  IF connection_owner IS NULL OR connection_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'plaid transaction match review item connection must belong to the same user';
  END IF;

  SELECT user_id INTO account_owner
  FROM public.finance_accounts
  WHERE id = NEW.finance_account_id;

  IF account_owner IS NULL OR account_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'plaid transaction match review item finance account must belong to the same user';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.plaid_finance_account_mappings
    WHERE user_id = NEW.user_id
      AND plaid_connection_id = NEW.plaid_connection_id
      AND finance_account_id = NEW.finance_account_id
  ) INTO account_mapping_exists;

  IF NOT account_mapping_exists THEN
    RAISE EXCEPTION 'plaid transaction match review item finance account must be mapped to the same plaid connection';
  END IF;

  IF NEW.review_status = 'pending'::text THEN
    IF NEW.resolved_finance_transaction_id IS NOT NULL OR NEW.resolved_at IS NOT NULL THEN
      RAISE EXCEPTION 'pending plaid transaction match review item cannot have resolution fields set';
    END IF;
  ELSIF NEW.review_status = 'matched_existing'::text THEN
    IF NEW.resolved_finance_transaction_id IS NULL OR NEW.resolved_at IS NULL THEN
      RAISE EXCEPTION 'matched_existing plaid transaction match review item requires resolution fields';
    END IF;
  ELSIF NEW.review_status = 'imported_new'::text THEN
    IF NEW.resolved_finance_transaction_id IS NULL OR NEW.resolved_at IS NULL THEN
      RAISE EXCEPTION 'imported_new plaid transaction match review item requires resolution fields';
    END IF;
  END IF;

  IF NEW.resolved_finance_transaction_id IS NOT NULL THEN
    SELECT user_id, source INTO resolved_owner, resolved_source
    FROM public.finance_transactions
    WHERE id = NEW.resolved_finance_transaction_id;

    IF resolved_owner IS NULL OR resolved_owner <> NEW.user_id THEN
      RAISE EXCEPTION 'plaid transaction match review item resolved finance transaction must belong to the same user';
    END IF;

    IF NEW.review_status = 'matched_existing'::text AND resolved_source <> 'rocket_money_csv'::text THEN
      RAISE EXCEPTION 'matched_existing plaid transaction match review item requires a rocket_money_csv resolved finance transaction';
    END IF;

    IF NEW.review_status = 'imported_new'::text AND resolved_source <> 'plaid'::text THEN
      RAISE EXCEPTION 'imported_new plaid transaction match review item requires a plaid resolved finance transaction';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER validate_plaid_transaction_match_review_item_references
  BEFORE INSERT OR UPDATE ON public.plaid_transaction_match_review_items
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_plaid_transaction_match_review_item_references();

CREATE OR REPLACE FUNCTION public.validate_plaid_transaction_match_review_candidate_references()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
DECLARE
  review_item_owner uuid;
  review_item_account_id uuid;
  transaction_owner uuid;
  transaction_source text;
  transaction_account_id uuid;
BEGIN
  SELECT user_id, finance_account_id
  INTO review_item_owner, review_item_account_id
  FROM public.plaid_transaction_match_review_items
  WHERE id = NEW.review_item_id;

  IF review_item_owner IS NULL OR review_item_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'plaid transaction match review candidate review item must belong to the same user';
  END IF;

  SELECT user_id, source, account_id
  INTO transaction_owner, transaction_source, transaction_account_id
  FROM public.finance_transactions
  WHERE id = NEW.finance_transaction_id;

  IF transaction_owner IS NULL OR transaction_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'plaid transaction match review candidate finance transaction must belong to the same user';
  END IF;

  IF transaction_source <> 'rocket_money_csv'::text THEN
    RAISE EXCEPTION 'plaid transaction match review candidate requires a rocket_money_csv finance transaction';
  END IF;

  IF transaction_account_id IS NOT NULL AND transaction_account_id <> review_item_account_id THEN
    RAISE EXCEPTION 'plaid transaction match review candidate finance transaction account must be null or match the review item finance account';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER validate_plaid_transaction_match_review_candidate_references
  BEFORE INSERT OR UPDATE ON public.plaid_transaction_match_review_candidates
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_plaid_transaction_match_review_candidate_references();
