ALTER TABLE public.finance_transactions
  DROP CONSTRAINT finance_transactions_source_check;

ALTER TABLE public.finance_transactions
  ADD CONSTRAINT finance_transactions_source_check
    CHECK (source = ANY (ARRAY[
      'manual'::text,
      'plaid'::text,
      'rocket_money_csv'::text
    ]));

ALTER TABLE public.finance_recurring_items
  DROP CONSTRAINT finance_recurring_items_source_check;

ALTER TABLE public.finance_recurring_items
  ADD CONSTRAINT finance_recurring_items_source_check
    CHECK (source = ANY (ARRAY[
      'manual'::text,
      'plaid'::text,
      'rocket_money_csv'::text
    ]));

CREATE TABLE public.finance_import_batches (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id         uuid                     DEFAULT auth.uid() NOT NULL,
  source          text                     DEFAULT 'rocket_money_csv'::text NOT NULL,
  content_hash    text                     NOT NULL,
  row_count       integer                  DEFAULT 0 NOT NULL,
  imported_count  integer                  DEFAULT 0 NOT NULL,
  skipped_count   integer                  DEFAULT 0 NOT NULL,
  status          text                     DEFAULT 'processing'::text NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  updated_at      timestamp with time zone DEFAULT now() NOT NULL,
  completed_at    timestamp with time zone,
  rolled_back_at  timestamp with time zone
);

ALTER TABLE public.finance_import_batches
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.finance_import_batches
  ADD CONSTRAINT finance_import_batches_pkey PRIMARY KEY (id);

ALTER TABLE public.finance_import_batches
  ADD CONSTRAINT finance_import_batches_source_check
    CHECK (source = 'rocket_money_csv'::text);

ALTER TABLE public.finance_import_batches
  ADD CONSTRAINT finance_import_batches_content_hash_check
    CHECK (char_length(content_hash) >= 1 AND char_length(content_hash) <= 128);

ALTER TABLE public.finance_import_batches
  ADD CONSTRAINT finance_import_batches_row_count_check
    CHECK (row_count >= 0);

ALTER TABLE public.finance_import_batches
  ADD CONSTRAINT finance_import_batches_imported_count_check
    CHECK (imported_count >= 0);

ALTER TABLE public.finance_import_batches
  ADD CONSTRAINT finance_import_batches_skipped_count_check
    CHECK (skipped_count >= 0);

ALTER TABLE public.finance_import_batches
  ADD CONSTRAINT finance_import_batches_counts_within_row_count_check
    CHECK (imported_count + skipped_count <= row_count);

ALTER TABLE public.finance_import_batches
  ADD CONSTRAINT finance_import_batches_status_check
    CHECK (status = ANY (ARRAY[
      'processing'::text,
      'completed'::text,
      'rolled_back'::text,
      'failed'::text
    ]));

ALTER TABLE public.finance_import_batches
  ADD CONSTRAINT finance_import_batches_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

REVOKE ALL ON TABLE public.finance_import_batches FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_import_batches TO authenticated;

CREATE UNIQUE INDEX finance_import_batches_user_content_active_idx
  ON public.finance_import_batches (user_id, content_hash)
  WHERE status = ANY (ARRAY['processing'::text, 'completed'::text]);

CREATE INDEX finance_import_batches_user_status_idx
  ON public.finance_import_batches (user_id, status);

CREATE INDEX finance_import_batches_user_created_idx
  ON public.finance_import_batches (user_id, created_at DESC);

CREATE TRIGGER set_finance_import_batches_updated_at
  BEFORE UPDATE ON public.finance_import_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own finance import batches" ON public.finance_import_batches
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.finance_import_batch_items (
  id                 uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id            uuid                     DEFAULT auth.uid() NOT NULL,
  batch_id           uuid                     NOT NULL,
  transaction_id     uuid,
  source_row_index   integer                  NOT NULL,
  source_fingerprint text                     NOT NULL,
  created_at         timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.finance_import_batch_items
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.finance_import_batch_items
  ADD CONSTRAINT finance_import_batch_items_pkey PRIMARY KEY (id);

ALTER TABLE public.finance_import_batch_items
  ADD CONSTRAINT finance_import_batch_items_source_row_index_check
    CHECK (source_row_index >= 0);

ALTER TABLE public.finance_import_batch_items
  ADD CONSTRAINT finance_import_batch_items_source_fingerprint_check
    CHECK (char_length(source_fingerprint) >= 1 AND char_length(source_fingerprint) <= 128);

ALTER TABLE public.finance_import_batch_items
  ADD CONSTRAINT finance_import_batch_items_batch_row_index_key
    UNIQUE (batch_id, source_row_index);

ALTER TABLE public.finance_import_batch_items
  ADD CONSTRAINT finance_import_batch_items_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.finance_import_batch_items
  ADD CONSTRAINT finance_import_batch_items_batch_id_fkey
    FOREIGN KEY (batch_id) REFERENCES public.finance_import_batches(id) ON DELETE RESTRICT;

ALTER TABLE public.finance_import_batch_items
  ADD CONSTRAINT finance_import_batch_items_transaction_id_fkey
    FOREIGN KEY (transaction_id) REFERENCES public.finance_transactions(id) ON DELETE SET NULL;

REVOKE ALL ON TABLE public.finance_import_batch_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_import_batch_items TO authenticated;

CREATE UNIQUE INDEX finance_import_batch_items_user_source_fingerprint_active_idx
  ON public.finance_import_batch_items (user_id, source_fingerprint)
  WHERE transaction_id IS NOT NULL;

CREATE INDEX finance_import_batch_items_batch_idx
  ON public.finance_import_batch_items (batch_id);

CREATE INDEX finance_import_batch_items_user_idx
  ON public.finance_import_batch_items (user_id);

CREATE INDEX finance_import_batch_items_transaction_idx
  ON public.finance_import_batch_items (transaction_id)
  WHERE transaction_id IS NOT NULL;

CREATE POLICY "Users manage their own finance import batch items" ON public.finance_import_batch_items
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.finance_business_expense_details (
  id                     uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id                uuid                     DEFAULT auth.uid() NOT NULL,
  transaction_id         uuid                     NOT NULL,
  business_context       text                     NOT NULL,
  funding_source         text                     DEFAULT 'unknown'::text NOT NULL,
  cost_treatment         text                     DEFAULT 'unknown'::text NOT NULL,
  prepaid_months         smallint,
  service_through_date   date,
  classification_status  text                     DEFAULT 'needs_review'::text NOT NULL,
  notes                  text,
  created_at             timestamp with time zone DEFAULT now() NOT NULL,
  updated_at             timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.finance_business_expense_details
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.finance_business_expense_details
  ADD CONSTRAINT finance_business_expense_details_pkey PRIMARY KEY (id);

ALTER TABLE public.finance_business_expense_details
  ADD CONSTRAINT finance_business_expense_details_transaction_id_key
    UNIQUE (transaction_id);

ALTER TABLE public.finance_business_expense_details
  ADD CONSTRAINT finance_business_expense_details_business_context_check
    CHECK (business_context = 'melusi'::text);

ALTER TABLE public.finance_business_expense_details
  ADD CONSTRAINT finance_business_expense_details_funding_source_check
    CHECK (funding_source = ANY (ARRAY[
      'owner_funded'::text,
      'business_account'::text,
      'unknown'::text
    ]));

ALTER TABLE public.finance_business_expense_details
  ADD CONSTRAINT finance_business_expense_details_cost_treatment_check
    CHECK (cost_treatment = ANY (ARRAY[
      'one_time'::text,
      'monthly_recurring'::text,
      'annual_recurring'::text,
      'prepaid'::text,
      'unknown'::text
    ]));

ALTER TABLE public.finance_business_expense_details
  ADD CONSTRAINT finance_business_expense_details_classification_status_check
    CHECK (classification_status = ANY (ARRAY[
      'user_confirmed'::text,
      'inferred'::text,
      'needs_review'::text
    ]));

ALTER TABLE public.finance_business_expense_details
  ADD CONSTRAINT finance_business_expense_details_prepaid_months_check
    CHECK (prepaid_months IS NULL OR prepaid_months > 0);

ALTER TABLE public.finance_business_expense_details
  ADD CONSTRAINT finance_business_expense_details_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.finance_business_expense_details
  ADD CONSTRAINT finance_business_expense_details_transaction_id_fkey
    FOREIGN KEY (transaction_id) REFERENCES public.finance_transactions(id) ON DELETE CASCADE;

REVOKE ALL ON TABLE public.finance_business_expense_details FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_business_expense_details TO authenticated;

CREATE INDEX finance_business_expense_details_user_idx
  ON public.finance_business_expense_details (user_id);

CREATE INDEX finance_business_expense_details_user_classification_idx
  ON public.finance_business_expense_details (user_id, classification_status);

CREATE TRIGGER set_finance_business_expense_details_updated_at
  BEFORE UPDATE ON public.finance_business_expense_details
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own finance business expense details" ON public.finance_business_expense_details
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE UNIQUE INDEX finance_transactions_user_rocket_money_fingerprint_idx
  ON public.finance_transactions (user_id, deduplication_fingerprint)
  WHERE source = 'rocket_money_csv'::text AND deduplication_fingerprint IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_finance_import_batch_item_references()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
DECLARE
  batch_owner uuid;
  transaction_owner uuid;
BEGIN
  SELECT user_id INTO batch_owner
  FROM public.finance_import_batches
  WHERE id = NEW.batch_id;

  IF batch_owner IS NULL OR batch_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'finance import batch item batch must belong to the same user';
  END IF;

  IF NEW.transaction_id IS NOT NULL THEN
    SELECT user_id INTO transaction_owner
    FROM public.finance_transactions
    WHERE id = NEW.transaction_id;

    IF transaction_owner IS NULL OR transaction_owner <> NEW.user_id THEN
      RAISE EXCEPTION 'finance import batch item transaction must belong to the same user';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER validate_finance_import_batch_item_references
  BEFORE INSERT OR UPDATE ON public.finance_import_batch_items
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_finance_import_batch_item_references();

CREATE OR REPLACE FUNCTION public.validate_finance_business_expense_details_references()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
DECLARE
  transaction_owner uuid;
BEGIN
  SELECT user_id INTO transaction_owner
  FROM public.finance_transactions
  WHERE id = NEW.transaction_id;

  IF transaction_owner IS NULL OR transaction_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'finance business expense details transaction must belong to the same user';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER validate_finance_business_expense_details_references
  BEFORE INSERT OR UPDATE ON public.finance_business_expense_details
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_finance_business_expense_details_references();
