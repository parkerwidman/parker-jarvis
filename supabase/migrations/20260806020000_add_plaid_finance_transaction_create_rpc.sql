CREATE OR REPLACE FUNCTION public.create_plaid_finance_transaction(
  p_user_id uuid,
  p_plaid_connection_id uuid,
  p_finance_account_id uuid,
  p_provider_transaction_id text,
  p_provider_pending_transaction_id text,
  p_transaction_date date,
  p_posted_date date,
  p_amount numeric(14, 2),
  p_merchant text,
  p_description text,
  p_transaction_type text,
  p_status text,
  p_category_id uuid,
  p_observed_at timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_connection_owner uuid;
  v_account_owner uuid;
  v_account_source text;
  v_account_mapping_exists boolean;
  v_category_owner uuid;
  v_existing_mapping record;
  v_existing_finance record;
  v_finance_transaction_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    v_user_id := p_user_id;

    IF v_user_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
    END IF;
  ELSIF p_user_id IS NOT NULL AND p_user_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'forbidden');
  END IF;

  IF p_plaid_connection_id IS NULL
    OR p_finance_account_id IS NULL
    OR p_provider_transaction_id IS NULL
    OR char_length(trim(p_provider_transaction_id)) < 1
    OR char_length(trim(p_provider_transaction_id)) > 128
    OR p_transaction_date IS NULL
    OR p_amount IS NULL
    OR p_amount = 0
    OR p_transaction_type IS NULL
    OR p_status IS NULL
    OR p_observed_at IS NULL
  THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
  END IF;

  IF p_provider_pending_transaction_id IS NOT NULL
    AND (
      char_length(trim(p_provider_pending_transaction_id)) < 1
      OR char_length(trim(p_provider_pending_transaction_id)) > 128
    )
  THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
  END IF;

  IF p_status NOT IN ('pending'::text, 'posted'::text) THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
  END IF;

  IF p_status = 'pending'::text AND p_posted_date IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
  END IF;

  IF p_status = 'posted'::text AND p_posted_date IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
  END IF;

  IF p_transaction_type NOT IN (
    'income'::text,
    'expense'::text,
    'refund'::text,
    'transfer'::text,
    'adjustment'::text
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
  END IF;

  IF p_transaction_type = 'expense'::text AND p_amount >= 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
  END IF;

  IF p_transaction_type IN ('refund'::text, 'income'::text) AND p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
  END IF;

  IF p_merchant IS NOT NULL
    AND (char_length(trim(p_merchant)) < 1 OR char_length(p_merchant) > 200)
  THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
  END IF;

  IF p_description IS NOT NULL
    AND (char_length(trim(p_description)) < 1 OR char_length(p_description) > 500)
  THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
  END IF;

  SELECT user_id
  INTO v_connection_owner
  FROM public.plaid_connections
  WHERE id = p_plaid_connection_id;

  IF v_connection_owner IS NULL OR v_connection_owner <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'plaid_connection_not_found');
  END IF;

  SELECT user_id, source
  INTO v_account_owner, v_account_source
  FROM public.finance_accounts
  WHERE id = p_finance_account_id;

  IF v_account_owner IS NULL OR v_account_owner <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'finance_account_not_found');
  END IF;

  IF v_account_source <> 'plaid'::text THEN
    RETURN jsonb_build_object('success', false, 'code', 'finance_account_not_mapped');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.plaid_finance_account_mappings
    WHERE user_id = v_user_id
      AND plaid_connection_id = p_plaid_connection_id
      AND finance_account_id = p_finance_account_id
  ) INTO v_account_mapping_exists;

  IF NOT v_account_mapping_exists THEN
    RETURN jsonb_build_object('success', false, 'code', 'finance_account_not_mapped');
  END IF;

  IF p_category_id IS NOT NULL THEN
    SELECT user_id
    INTO v_category_owner
    FROM public.finance_categories
    WHERE id = p_category_id;

    IF v_category_owner IS NULL OR v_category_owner <> v_user_id THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
    END IF;
  END IF;

  SELECT id, finance_transaction_id, removed_at
  INTO v_existing_mapping
  FROM public.plaid_finance_transaction_mappings
  WHERE user_id = v_user_id
    AND plaid_connection_id = p_plaid_connection_id
    AND provider_transaction_id = p_provider_transaction_id
  FOR UPDATE;

  IF v_existing_mapping.id IS NOT NULL THEN
    SELECT id, user_id, source
    INTO v_existing_finance
    FROM public.finance_transactions
    WHERE id = v_existing_mapping.finance_transaction_id;

    IF v_existing_finance.id IS NULL
      OR v_existing_finance.user_id <> v_user_id
      OR v_existing_finance.source <> 'plaid'::text
    THEN
      RETURN jsonb_build_object('success', false, 'code', 'provider_transaction_already_mapped');
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'code', 'already_exists',
      'finance_transaction_id', v_existing_finance.id
    );
  END IF;

  BEGIN
    INSERT INTO public.finance_transactions (
      user_id,
      account_id,
      category_id,
      transaction_date,
      posted_date,
      amount,
      merchant,
      description,
      transaction_type,
      status,
      notes,
      source,
      personal_or_business
    )
    VALUES (
      v_user_id,
      p_finance_account_id,
      p_category_id,
      p_transaction_date,
      p_posted_date,
      p_amount,
      NULLIF(trim(both FROM p_merchant), ''),
      NULLIF(trim(both FROM p_description), ''),
      p_transaction_type,
      p_status,
      NULL,
      'plaid'::text,
      'unclassified'::text
    )
    RETURNING id INTO v_finance_transaction_id;

    INSERT INTO public.plaid_finance_transaction_mappings (
      user_id,
      plaid_connection_id,
      finance_transaction_id,
      provider_transaction_id,
      provider_pending_transaction_id,
      provider_observed_at,
      removed_at
    )
    VALUES (
      v_user_id,
      p_plaid_connection_id,
      v_finance_transaction_id,
      p_provider_transaction_id,
      p_provider_pending_transaction_id,
      p_observed_at,
      NULL
    );

    RETURN jsonb_build_object(
      'success', true,
      'code', 'created',
      'finance_transaction_id', v_finance_transaction_id
    );
  EXCEPTION
    WHEN unique_violation THEN
      SELECT id, finance_transaction_id, removed_at
      INTO v_existing_mapping
      FROM public.plaid_finance_transaction_mappings
      WHERE user_id = v_user_id
        AND plaid_connection_id = p_plaid_connection_id
        AND provider_transaction_id = p_provider_transaction_id;

      IF v_existing_mapping.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'create_failed');
      END IF;

      SELECT id, user_id, source
      INTO v_existing_finance
      FROM public.finance_transactions
      WHERE id = v_existing_mapping.finance_transaction_id;

      IF v_existing_finance.id IS NULL
        OR v_existing_finance.user_id <> v_user_id
        OR v_existing_finance.source <> 'plaid'::text
      THEN
        RETURN jsonb_build_object('success', false, 'code', 'provider_transaction_already_mapped');
      END IF;

      RETURN jsonb_build_object(
        'success', true,
        'code', 'already_exists',
        'finance_transaction_id', v_existing_finance.id
      );
  END;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'create_failed');
END;
$function$;

REVOKE ALL ON FUNCTION public.create_plaid_finance_transaction(
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  date,
  numeric,
  text,
  text,
  text,
  text,
  uuid,
  timestamp with time zone
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_plaid_finance_transaction(
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  date,
  numeric,
  text,
  text,
  text,
  text,
  uuid,
  timestamp with time zone
) FROM anon;

GRANT EXECUTE ON FUNCTION public.create_plaid_finance_transaction(
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  date,
  numeric,
  text,
  text,
  text,
  text,
  uuid,
  timestamp with time zone
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_plaid_finance_transaction(
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  date,
  numeric,
  text,
  text,
  text,
  text,
  uuid,
  timestamp with time zone
) TO service_role;
