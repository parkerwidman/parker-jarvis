CREATE TABLE public.finance_accounts (
  id                 uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id            uuid                     DEFAULT auth.uid() NOT NULL,
  name               text                     NOT NULL,
  institution_name   text,
  account_type       text                     NOT NULL,
  current_balance    numeric(14, 2)           NOT NULL,
  available_balance  numeric(14, 2),
  balance_as_of      date                     NOT NULL,
  currency           text                     DEFAULT 'USD'::text NOT NULL,
  last_four          text,
  active             boolean                  DEFAULT true NOT NULL,
  hidden             boolean                  DEFAULT false NOT NULL,
  notes              text,
  created_at         timestamp with time zone DEFAULT now() NOT NULL,
  updated_at         timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.finance_accounts
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.finance_accounts
  ADD CONSTRAINT finance_accounts_pkey PRIMARY KEY (id);

ALTER TABLE public.finance_accounts
  ADD CONSTRAINT finance_accounts_name_check
    CHECK (char_length(name) >= 1 AND char_length(name) <= 200);

ALTER TABLE public.finance_accounts
  ADD CONSTRAINT finance_accounts_account_type_check
    CHECK (account_type = ANY (ARRAY[
      'checking'::text,
      'savings'::text,
      'cash'::text,
      'credit_card'::text,
      'investment'::text,
      'loan'::text,
      'other'::text
    ]));

ALTER TABLE public.finance_accounts
  ADD CONSTRAINT finance_accounts_currency_check
    CHECK (currency = 'USD'::text);

ALTER TABLE public.finance_accounts
  ADD CONSTRAINT finance_accounts_last_four_check
    CHECK (last_four IS NULL OR last_four ~ '^\d{4}$');

ALTER TABLE public.finance_accounts
  ADD CONSTRAINT finance_accounts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

REVOKE ALL ON TABLE public.finance_accounts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_accounts TO authenticated;

CREATE UNIQUE INDEX finance_accounts_user_active_name_idx
  ON public.finance_accounts (user_id, lower(name))
  WHERE active = true;

CREATE INDEX finance_accounts_user_active_idx
  ON public.finance_accounts (user_id, active);

CREATE INDEX finance_accounts_user_type_idx
  ON public.finance_accounts (user_id, account_type);

CREATE TRIGGER set_finance_accounts_updated_at
  BEFORE UPDATE ON public.finance_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own finance accounts" ON public.finance_accounts
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.finance_categories (
  id             uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id        uuid                     DEFAULT auth.uid() NOT NULL,
  name           text                     NOT NULL,
  slug           text                     NOT NULL,
  category_kind  text                     NOT NULL,
  is_system      boolean                  DEFAULT false NOT NULL,
  sort_order     smallint                 DEFAULT 0 NOT NULL,
  active         boolean                  DEFAULT true NOT NULL,
  created_at     timestamp with time zone DEFAULT now() NOT NULL,
  updated_at     timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.finance_categories
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.finance_categories
  ADD CONSTRAINT finance_categories_pkey PRIMARY KEY (id);

ALTER TABLE public.finance_categories
  ADD CONSTRAINT finance_categories_name_check
    CHECK (char_length(name) >= 1 AND char_length(name) <= 100);

ALTER TABLE public.finance_categories
  ADD CONSTRAINT finance_categories_slug_check
    CHECK (char_length(slug) >= 1 AND char_length(slug) <= 100);

ALTER TABLE public.finance_categories
  ADD CONSTRAINT finance_categories_category_kind_check
    CHECK (category_kind = ANY (ARRAY[
      'income'::text,
      'expense'::text,
      'transfer'::text,
      'neutral'::text
    ]));

ALTER TABLE public.finance_categories
  ADD CONSTRAINT finance_categories_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.finance_categories
  ADD CONSTRAINT finance_categories_user_id_slug_key
    UNIQUE (user_id, slug);

REVOKE ALL ON TABLE public.finance_categories FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_categories TO authenticated;

CREATE INDEX finance_categories_user_active_idx
  ON public.finance_categories (user_id, active);

CREATE INDEX finance_categories_user_kind_idx
  ON public.finance_categories (user_id, category_kind);

CREATE TRIGGER set_finance_categories_updated_at
  BEFORE UPDATE ON public.finance_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own finance categories" ON public.finance_categories
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.finance_recurring_items (
  id                   uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id              uuid                     DEFAULT auth.uid() NOT NULL,
  name                 text                     NOT NULL,
  recurring_type       text                     NOT NULL,
  expected_amount      numeric(14, 2)           NOT NULL,
  amount_variability   text                     NOT NULL,
  frequency            text                     NOT NULL,
  next_expected_date   date                     NOT NULL,
  account_id           uuid,
  category_id          uuid,
  autopay              boolean                  DEFAULT false NOT NULL,
  active               boolean                  DEFAULT true NOT NULL,
  reminder_days        smallint                 DEFAULT 3 NOT NULL,
  end_date             date,
  notes                text,
  source               text                     DEFAULT 'manual'::text NOT NULL,
  created_at           timestamp with time zone DEFAULT now() NOT NULL,
  updated_at           timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.finance_recurring_items
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.finance_recurring_items
  ADD CONSTRAINT finance_recurring_items_pkey PRIMARY KEY (id);

ALTER TABLE public.finance_recurring_items
  ADD CONSTRAINT finance_recurring_items_name_check
    CHECK (char_length(name) >= 1 AND char_length(name) <= 200);

ALTER TABLE public.finance_recurring_items
  ADD CONSTRAINT finance_recurring_items_recurring_type_check
    CHECK (recurring_type = ANY (ARRAY[
      'bill'::text,
      'subscription'::text,
      'expected_income'::text,
      'debt_payment'::text,
      'savings_contribution'::text
    ]));

ALTER TABLE public.finance_recurring_items
  ADD CONSTRAINT finance_recurring_items_expected_amount_check
    CHECK (expected_amount > 0::numeric);

ALTER TABLE public.finance_recurring_items
  ADD CONSTRAINT finance_recurring_items_amount_variability_check
    CHECK (amount_variability = ANY (ARRAY[
      'fixed'::text,
      'variable'::text,
      'estimate'::text
    ]));

ALTER TABLE public.finance_recurring_items
  ADD CONSTRAINT finance_recurring_items_frequency_check
    CHECK (frequency = ANY (ARRAY[
      'weekly'::text,
      'biweekly'::text,
      'monthly'::text,
      'quarterly'::text,
      'annual'::text
    ]));

ALTER TABLE public.finance_recurring_items
  ADD CONSTRAINT finance_recurring_items_reminder_days_check
    CHECK (reminder_days >= 0 AND reminder_days <= 90);

ALTER TABLE public.finance_recurring_items
  ADD CONSTRAINT finance_recurring_items_source_check
    CHECK (source = 'manual'::text);

ALTER TABLE public.finance_recurring_items
  ADD CONSTRAINT finance_recurring_items_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.finance_recurring_items
  ADD CONSTRAINT finance_recurring_items_account_id_fkey
    FOREIGN KEY (account_id) REFERENCES public.finance_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.finance_recurring_items
  ADD CONSTRAINT finance_recurring_items_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES public.finance_categories(id) ON DELETE SET NULL;

REVOKE ALL ON TABLE public.finance_recurring_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_recurring_items TO authenticated;

CREATE INDEX finance_recurring_items_user_active_idx
  ON public.finance_recurring_items (user_id, active);

CREATE INDEX finance_recurring_items_user_next_date_idx
  ON public.finance_recurring_items (user_id, next_expected_date);

CREATE TRIGGER set_finance_recurring_items_updated_at
  BEFORE UPDATE ON public.finance_recurring_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own finance recurring items" ON public.finance_recurring_items
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.finance_transactions (
  id                       uuid                     DEFAULT gen_random_uuid() NOT NULL,
  user_id                  uuid                     DEFAULT auth.uid() NOT NULL,
  account_id               uuid,
  category_id              uuid,
  transaction_date         date                     NOT NULL,
  posted_date              date,
  amount                   numeric(14, 2)           NOT NULL,
  merchant                 text,
  description              text,
  transaction_type         text                     NOT NULL,
  status                   text                     DEFAULT 'posted'::text NOT NULL,
  notes                    text,
  source                   text                     DEFAULT 'manual'::text NOT NULL,
  deduplication_fingerprint text,
  recurring_item_id        uuid,
  personal_or_business     text                     DEFAULT 'personal'::text NOT NULL,
  created_at               timestamp with time zone DEFAULT now() NOT NULL,
  updated_at               timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.finance_transactions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.finance_transactions
  ADD CONSTRAINT finance_transactions_pkey PRIMARY KEY (id);

ALTER TABLE public.finance_transactions
  ADD CONSTRAINT finance_transactions_amount_check
    CHECK (amount <> 0::numeric);

ALTER TABLE public.finance_transactions
  ADD CONSTRAINT finance_transactions_transaction_type_check
    CHECK (transaction_type = ANY (ARRAY[
      'income'::text,
      'expense'::text,
      'refund'::text,
      'transfer'::text,
      'adjustment'::text
    ]));

ALTER TABLE public.finance_transactions
  ADD CONSTRAINT finance_transactions_status_check
    CHECK (status = ANY (ARRAY[
      'pending'::text,
      'posted'::text,
      'void'::text
    ]));

ALTER TABLE public.finance_transactions
  ADD CONSTRAINT finance_transactions_source_check
    CHECK (source = 'manual'::text);

ALTER TABLE public.finance_transactions
  ADD CONSTRAINT finance_transactions_personal_or_business_check
    CHECK (personal_or_business = ANY (ARRAY[
      'personal'::text,
      'business'::text,
      'unclassified'::text
    ]));

ALTER TABLE public.finance_transactions
  ADD CONSTRAINT finance_transactions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.finance_transactions
  ADD CONSTRAINT finance_transactions_account_id_fkey
    FOREIGN KEY (account_id) REFERENCES public.finance_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.finance_transactions
  ADD CONSTRAINT finance_transactions_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES public.finance_categories(id) ON DELETE SET NULL;

ALTER TABLE public.finance_transactions
  ADD CONSTRAINT finance_transactions_recurring_item_id_fkey
    FOREIGN KEY (recurring_item_id) REFERENCES public.finance_recurring_items(id) ON DELETE SET NULL;

REVOKE ALL ON TABLE public.finance_transactions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_transactions TO authenticated;

CREATE INDEX finance_transactions_user_date_idx
  ON public.finance_transactions (user_id, transaction_date DESC);

CREATE INDEX finance_transactions_user_account_idx
  ON public.finance_transactions (user_id, account_id);

CREATE INDEX finance_transactions_user_category_idx
  ON public.finance_transactions (user_id, category_id);

CREATE INDEX finance_transactions_user_status_idx
  ON public.finance_transactions (user_id, status);

CREATE INDEX finance_transactions_user_type_idx
  ON public.finance_transactions (user_id, transaction_type);

CREATE TRIGGER set_finance_transactions_updated_at
  BEFORE UPDATE ON public.finance_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own finance transactions" ON public.finance_transactions
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE TABLE public.finance_preferences (
  user_id                      uuid                     DEFAULT auth.uid() NOT NULL,
  default_currency             text                     DEFAULT 'USD'::text NOT NULL,
  minimum_cash_target          numeric(14, 2),
  monthly_spending_limit       numeric(14, 2),
  monthly_income_target        numeric(14, 2),
  large_transaction_threshold  numeric(14, 2),
  stale_balance_days           smallint                 DEFAULT 7 NOT NULL,
  default_reminder_days        smallint                 DEFAULT 3 NOT NULL,
  exclude_business_from_personal boolean                DEFAULT true NOT NULL,
  created_at                   timestamp with time zone DEFAULT now() NOT NULL,
  updated_at                   timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.finance_preferences
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.finance_preferences
  ADD CONSTRAINT finance_preferences_pkey PRIMARY KEY (user_id);

ALTER TABLE public.finance_preferences
  ADD CONSTRAINT finance_preferences_default_currency_check
    CHECK (default_currency = 'USD'::text);

ALTER TABLE public.finance_preferences
  ADD CONSTRAINT finance_preferences_minimum_cash_target_check
    CHECK (minimum_cash_target IS NULL OR minimum_cash_target >= 0::numeric);

ALTER TABLE public.finance_preferences
  ADD CONSTRAINT finance_preferences_monthly_spending_limit_check
    CHECK (monthly_spending_limit IS NULL OR monthly_spending_limit >= 0::numeric);

ALTER TABLE public.finance_preferences
  ADD CONSTRAINT finance_preferences_monthly_income_target_check
    CHECK (monthly_income_target IS NULL OR monthly_income_target >= 0::numeric);

ALTER TABLE public.finance_preferences
  ADD CONSTRAINT finance_preferences_large_transaction_threshold_check
    CHECK (large_transaction_threshold IS NULL OR large_transaction_threshold > 0::numeric);

ALTER TABLE public.finance_preferences
  ADD CONSTRAINT finance_preferences_stale_balance_days_check
    CHECK (stale_balance_days >= 1 AND stale_balance_days <= 365);

ALTER TABLE public.finance_preferences
  ADD CONSTRAINT finance_preferences_default_reminder_days_check
    CHECK (default_reminder_days >= 0 AND default_reminder_days <= 90);

ALTER TABLE public.finance_preferences
  ADD CONSTRAINT finance_preferences_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

REVOKE ALL ON TABLE public.finance_preferences FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_preferences TO authenticated;

CREATE TRIGGER set_finance_preferences_updated_at
  BEFORE UPDATE ON public.finance_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users manage their own finance preferences" ON public.finance_preferences
  TO authenticated
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE OR REPLACE FUNCTION public.validate_finance_transaction_references()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
DECLARE
  account_owner uuid;
  category_owner uuid;
  recurring_owner uuid;
BEGIN
  IF NEW.account_id IS NOT NULL THEN
    SELECT user_id INTO account_owner
    FROM public.finance_accounts
    WHERE id = NEW.account_id;

    IF account_owner IS NULL OR account_owner <> NEW.user_id THEN
      RAISE EXCEPTION 'finance transaction account must belong to the same user';
    END IF;
  END IF;

  IF NEW.category_id IS NOT NULL THEN
    SELECT user_id INTO category_owner
    FROM public.finance_categories
    WHERE id = NEW.category_id;

    IF category_owner IS NULL OR category_owner <> NEW.user_id THEN
      RAISE EXCEPTION 'finance transaction category must belong to the same user';
    END IF;
  END IF;

  IF NEW.recurring_item_id IS NOT NULL THEN
    SELECT user_id INTO recurring_owner
    FROM public.finance_recurring_items
    WHERE id = NEW.recurring_item_id;

    IF recurring_owner IS NULL OR recurring_owner <> NEW.user_id THEN
      RAISE EXCEPTION 'finance transaction recurring item must belong to the same user';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER validate_finance_transaction_references
  BEFORE INSERT OR UPDATE ON public.finance_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_finance_transaction_references();

CREATE OR REPLACE FUNCTION public.validate_finance_recurring_item_references()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
DECLARE
  account_owner uuid;
  category_owner uuid;
BEGIN
  IF NEW.account_id IS NOT NULL THEN
    SELECT user_id INTO account_owner
    FROM public.finance_accounts
    WHERE id = NEW.account_id;

    IF account_owner IS NULL OR account_owner <> NEW.user_id THEN
      RAISE EXCEPTION 'finance recurring item account must belong to the same user';
    END IF;
  END IF;

  IF NEW.category_id IS NOT NULL THEN
    SELECT user_id INTO category_owner
    FROM public.finance_categories
    WHERE id = NEW.category_id;

    IF category_owner IS NULL OR category_owner <> NEW.user_id THEN
      RAISE EXCEPTION 'finance recurring item category must belong to the same user';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER validate_finance_recurring_item_references
  BEFORE INSERT OR UPDATE ON public.finance_recurring_items
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_finance_recurring_item_references();
