CREATE OR REPLACE FUNCTION public.commit_plaid_rocket_money_transaction_match(
  p_user_id uuid,
  p_plaid_connection_id uuid,
  p_finance_account_id uuid,
  p_finance_transaction_id uuid,
  p_provider_transaction_id text,
  p_provider_pending_transaction_id text,
  p_posted_date date,
  p_amount numeric(14, 2),
  p_transaction_type text,
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
  v_account_mapping_exists boolean;
  v_candidate record;
  v_comparison_date date;
  v_day_distance integer;
  v_existing_provider_mapping record;
  v_conflicting_mapping record;
  v_review_item record;
  v_candidate_amount_cents bigint;
  v_input_amount_cents bigint;
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
    OR p_finance_transaction_id IS NULL
    OR p_provider_transaction_id IS NULL
    OR char_length(trim(p_provider_transaction_id)) < 1
    OR char_length(trim(p_provider_transaction_id)) > 128
    OR p_posted_date IS NULL
    OR p_amount IS NULL
    OR p_amount = 0
    OR p_transaction_type IS NULL
    OR p_observed_at IS NULL
  THEN
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

  SELECT user_id
  INTO v_connection_owner
  FROM public.plaid_connections
  WHERE id = p_plaid_connection_id;

  IF v_connection_owner IS NULL OR v_connection_owner <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'plaid_connection_not_found');
  END IF;

  SELECT user_id
  INTO v_account_owner
  FROM public.finance_accounts
  WHERE id = p_finance_account_id;

  IF v_account_owner IS NULL OR v_account_owner <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'finance_account_not_found');
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

  SELECT
    id,
    user_id,
    account_id,
    transaction_date,
    posted_date,
    amount,
    transaction_type,
    status,
    source
  INTO v_candidate
  FROM public.finance_transactions
  WHERE id = p_finance_transaction_id
  FOR UPDATE;

  IF v_candidate.id IS NULL
    OR v_candidate.user_id <> v_user_id
    OR v_candidate.source <> 'rocket_money_csv'::text
    OR v_candidate.status <> 'posted'::text
  THEN
    RETURN jsonb_build_object('success', false, 'code', 'match_candidate_unavailable');
  END IF;

  IF v_candidate.account_id IS NOT NULL
    AND v_candidate.account_id <> p_finance_account_id
  THEN
    RETURN jsonb_build_object('success', false, 'code', 'match_candidate_ineligible');
  END IF;

  v_candidate_amount_cents := round(abs(v_candidate.amount) * 100)::bigint;
  v_input_amount_cents := round(abs(p_amount) * 100)::bigint;

  IF v_candidate_amount_cents <> v_input_amount_cents THEN
    RETURN jsonb_build_object('success', false, 'code', 'match_candidate_ineligible');
  END IF;

  IF v_candidate.transaction_type <> p_transaction_type THEN
    RETURN jsonb_build_object('success', false, 'code', 'match_candidate_ineligible');
  END IF;

  IF p_transaction_type = 'expense'::text THEN
    IF p_amount >= 0 OR v_candidate.amount >= 0 THEN
      RETURN jsonb_build_object('success', false, 'code', 'match_candidate_ineligible');
    END IF;
  ELSIF p_transaction_type IN ('refund'::text, 'income'::text) THEN
    IF p_amount <= 0 OR v_candidate.amount <= 0 THEN
      RETURN jsonb_build_object('success', false, 'code', 'match_candidate_ineligible');
    END IF;
  ELSIF p_transaction_type IN ('transfer'::text, 'adjustment'::text) THEN
    IF sign(p_amount) <> sign(v_candidate.amount) THEN
      RETURN jsonb_build_object('success', false, 'code', 'match_candidate_ineligible');
    END IF;
  ELSE
    RETURN jsonb_build_object('success', false, 'code', 'match_candidate_ineligible');
  END IF;

  v_comparison_date := COALESCE(v_candidate.posted_date, v_candidate.transaction_date);
  v_day_distance := abs(p_posted_date - v_comparison_date);

  IF v_day_distance > 3 THEN
    RETURN jsonb_build_object('success', false, 'code', 'match_candidate_ineligible');
  END IF;

  SELECT provider_transaction_id, removed_at
  INTO v_conflicting_mapping
  FROM public.plaid_finance_transaction_mappings
  WHERE user_id = v_user_id
    AND finance_transaction_id = p_finance_transaction_id
    AND removed_at IS NULL
    AND provider_transaction_id <> p_provider_transaction_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'match_candidate_already_mapped');
  END IF;

  SELECT id, finance_transaction_id, removed_at
  INTO v_existing_provider_mapping
  FROM public.plaid_finance_transaction_mappings
  WHERE user_id = v_user_id
    AND plaid_connection_id = p_plaid_connection_id
    AND provider_transaction_id = p_provider_transaction_id
  FOR UPDATE;

  IF v_existing_provider_mapping.id IS NOT NULL
    AND v_existing_provider_mapping.removed_at IS NULL
    AND v_existing_provider_mapping.finance_transaction_id <> p_finance_transaction_id
  THEN
    RETURN jsonb_build_object('success', false, 'code', 'provider_transaction_already_mapped');
  END IF;

  IF v_candidate.account_id IS NULL THEN
    UPDATE public.finance_transactions
    SET account_id = p_finance_account_id
    WHERE id = p_finance_transaction_id
      AND user_id = v_user_id
      AND source = 'rocket_money_csv'::text
      AND account_id IS NULL;
  END IF;

  IF v_candidate.posted_date IS NULL THEN
    UPDATE public.finance_transactions
    SET posted_date = p_posted_date
    WHERE id = p_finance_transaction_id
      AND user_id = v_user_id
      AND source = 'rocket_money_csv'::text
      AND posted_date IS NULL;
  END IF;

  IF v_existing_provider_mapping.id IS NOT NULL
    AND v_existing_provider_mapping.removed_at IS NULL
  THEN
    NULL;
  ELSIF v_existing_provider_mapping.id IS NOT NULL THEN
    UPDATE public.plaid_finance_transaction_mappings
    SET
      user_id = v_user_id,
      plaid_connection_id = p_plaid_connection_id,
      finance_transaction_id = p_finance_transaction_id,
      provider_transaction_id = p_provider_transaction_id,
      provider_pending_transaction_id = p_provider_pending_transaction_id,
      provider_observed_at = p_observed_at,
      removed_at = NULL
    WHERE id = v_existing_provider_mapping.id
      AND user_id = v_user_id;
  ELSE
    BEGIN
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
        p_finance_transaction_id,
        p_provider_transaction_id,
        p_provider_pending_transaction_id,
        p_observed_at,
        NULL
      );
    EXCEPTION
      WHEN unique_violation THEN
        SELECT finance_transaction_id, removed_at
        INTO v_existing_provider_mapping
        FROM public.plaid_finance_transaction_mappings
        WHERE user_id = v_user_id
          AND plaid_connection_id = p_plaid_connection_id
          AND provider_transaction_id = p_provider_transaction_id;

        IF v_existing_provider_mapping.removed_at IS NOT NULL
          OR v_existing_provider_mapping.finance_transaction_id <> p_finance_transaction_id
        THEN
          RETURN jsonb_build_object('success', false, 'code', 'provider_transaction_already_mapped');
        END IF;
    END;
  END IF;

  SELECT id, review_status, created_at
  INTO v_review_item
  FROM public.plaid_transaction_match_review_items
  WHERE user_id = v_user_id
    AND plaid_connection_id = p_plaid_connection_id
    AND plaid_transaction_id = p_provider_transaction_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_review_item.review_status = 'pending'::text THEN
      UPDATE public.plaid_transaction_match_review_items
      SET
        review_status = 'matched_existing'::text,
        resolved_finance_transaction_id = p_finance_transaction_id,
        resolved_at = now()
      WHERE id = v_review_item.id
        AND user_id = v_user_id
        AND review_status = 'pending'::text;
    ELSIF v_review_item.review_status = 'matched_existing'::text THEN
      NULL;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'matched_existing',
    'finance_transaction_id', p_finance_transaction_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'match_commit_failed');
END;
$function$;

REVOKE ALL ON FUNCTION public.commit_plaid_rocket_money_transaction_match(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  numeric,
  text,
  timestamp with time zone
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.commit_plaid_rocket_money_transaction_match(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  numeric,
  text,
  timestamp with time zone
) FROM anon;

GRANT EXECUTE ON FUNCTION public.commit_plaid_rocket_money_transaction_match(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  numeric,
  text,
  timestamp with time zone
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.commit_plaid_rocket_money_transaction_match(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  numeric,
  text,
  timestamp with time zone
) TO service_role;
