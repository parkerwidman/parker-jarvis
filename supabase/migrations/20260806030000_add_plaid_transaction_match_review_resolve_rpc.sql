CREATE OR REPLACE FUNCTION public.resolve_plaid_transaction_match_review_item(
  p_user_id uuid,
  p_review_item_id uuid,
  p_action text,
  p_candidate_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_review_item record;
  v_candidate record;
  v_candidate_tx record;
  v_connection_owner uuid;
  v_account_owner uuid;
  v_account_source text;
  v_account_mapping_exists boolean;
  v_existing_provider_mapping record;
  v_conflicting_mapping record;
  v_finance_transaction_id uuid;
  v_comparison_date date;
  v_day_distance integer;
  v_candidate_amount_cents bigint;
  v_input_amount_cents bigint;
  v_observed_at timestamp with time zone;
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

  IF p_review_item_id IS NULL
    OR p_action IS NULL
    OR p_action NOT IN ('match_existing'::text, 'import_new'::text)
  THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
  END IF;

  IF p_action = 'match_existing'::text AND p_candidate_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
  END IF;

  IF p_action = 'import_new'::text AND p_candidate_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
  END IF;

  SELECT
    id,
    user_id,
    plaid_connection_id,
    finance_account_id,
    plaid_transaction_id,
    pending_plaid_transaction_id,
    transaction_date,
    posted_date,
    amount,
    merchant,
    description,
    transaction_type,
    review_status,
    resolved_finance_transaction_id,
    resolved_at,
    created_at
  INTO v_review_item
  FROM public.plaid_transaction_match_review_items
  WHERE id = p_review_item_id
  FOR UPDATE;

  IF v_review_item.id IS NULL OR v_review_item.user_id <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'review_item_not_found');
  END IF;

  v_observed_at := now();

  IF v_review_item.review_status = 'removed'::text THEN
    RETURN jsonb_build_object('success', false, 'code', 'review_item_not_pending');
  END IF;

  IF v_review_item.review_status = 'matched_existing'::text THEN
    IF p_action = 'match_existing'::text THEN
      IF p_candidate_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
      END IF;

      SELECT finance_transaction_id
      INTO v_candidate
      FROM public.plaid_transaction_match_review_candidates
      WHERE id = p_candidate_id
        AND review_item_id = v_review_item.id
        AND user_id = v_user_id;

      IF v_candidate.finance_transaction_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'candidate_not_found');
      END IF;

      IF v_review_item.resolved_finance_transaction_id = v_candidate.finance_transaction_id THEN
        RETURN jsonb_build_object('success', true, 'code', 'matched_existing');
      END IF;

      RETURN jsonb_build_object('success', false, 'code', 'review_item_not_pending');
    END IF;

    RETURN jsonb_build_object('success', false, 'code', 'review_item_not_pending');
  END IF;

  IF v_review_item.review_status = 'imported_new'::text THEN
    IF p_action = 'import_new'::text THEN
      RETURN jsonb_build_object('success', true, 'code', 'imported_new');
    END IF;

    RETURN jsonb_build_object('success', false, 'code', 'review_item_not_pending');
  END IF;

  IF v_review_item.review_status <> 'pending'::text THEN
    RETURN jsonb_build_object('success', false, 'code', 'review_item_not_pending');
  END IF;

  SELECT user_id
  INTO v_connection_owner
  FROM public.plaid_connections
  WHERE id = v_review_item.plaid_connection_id;

  IF v_connection_owner IS NULL OR v_connection_owner <> v_user_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'plaid_connection_not_found');
  END IF;

  SELECT user_id, source
  INTO v_account_owner, v_account_source
  FROM public.finance_accounts
  WHERE id = v_review_item.finance_account_id;

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
      AND plaid_connection_id = v_review_item.plaid_connection_id
      AND finance_account_id = v_review_item.finance_account_id
  ) INTO v_account_mapping_exists;

  IF NOT v_account_mapping_exists THEN
    RETURN jsonb_build_object('success', false, 'code', 'finance_account_not_mapped');
  END IF;

  IF p_action = 'match_existing'::text THEN
    SELECT
      id,
      user_id,
      review_item_id,
      finance_transaction_id
    INTO v_candidate
    FROM public.plaid_transaction_match_review_candidates
    WHERE id = p_candidate_id
      AND review_item_id = v_review_item.id
      AND user_id = v_user_id
    FOR UPDATE;

    IF v_candidate.id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'candidate_not_found');
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
    INTO v_candidate_tx
    FROM public.finance_transactions
    WHERE id = v_candidate.finance_transaction_id
    FOR UPDATE;

    IF v_candidate_tx.id IS NULL
      OR v_candidate_tx.user_id <> v_user_id
      OR v_candidate_tx.source <> 'rocket_money_csv'::text
      OR v_candidate_tx.status <> 'posted'::text
    THEN
      RETURN jsonb_build_object('success', false, 'code', 'match_candidate_unavailable');
    END IF;

    IF v_candidate_tx.account_id IS NOT NULL
      AND v_candidate_tx.account_id <> v_review_item.finance_account_id
    THEN
      RETURN jsonb_build_object('success', false, 'code', 'match_candidate_ineligible');
    END IF;

    v_candidate_amount_cents := round(abs(v_candidate_tx.amount) * 100)::bigint;
    v_input_amount_cents := round(abs(v_review_item.amount) * 100)::bigint;

    IF v_candidate_amount_cents <> v_input_amount_cents THEN
      RETURN jsonb_build_object('success', false, 'code', 'match_candidate_ineligible');
    END IF;

    IF v_candidate_tx.transaction_type <> v_review_item.transaction_type THEN
      RETURN jsonb_build_object('success', false, 'code', 'match_candidate_ineligible');
    END IF;

    IF v_review_item.transaction_type = 'expense'::text THEN
      IF v_review_item.amount >= 0 OR v_candidate_tx.amount >= 0 THEN
        RETURN jsonb_build_object('success', false, 'code', 'match_candidate_ineligible');
      END IF;
    ELSIF v_review_item.transaction_type IN ('refund'::text, 'income'::text) THEN
      IF v_review_item.amount <= 0 OR v_candidate_tx.amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'code', 'match_candidate_ineligible');
      END IF;
    ELSIF v_review_item.transaction_type IN ('transfer'::text, 'adjustment'::text) THEN
      IF sign(v_review_item.amount) <> sign(v_candidate_tx.amount) THEN
        RETURN jsonb_build_object('success', false, 'code', 'match_candidate_ineligible');
      END IF;
    ELSE
      RETURN jsonb_build_object('success', false, 'code', 'match_candidate_ineligible');
    END IF;

    v_comparison_date := COALESCE(v_candidate_tx.posted_date, v_candidate_tx.transaction_date);
    v_day_distance := abs(v_review_item.posted_date - v_comparison_date);

    IF v_day_distance > 3 THEN
      RETURN jsonb_build_object('success', false, 'code', 'match_candidate_ineligible');
    END IF;

    SELECT provider_transaction_id, removed_at
    INTO v_conflicting_mapping
    FROM public.plaid_finance_transaction_mappings
    WHERE user_id = v_user_id
      AND finance_transaction_id = v_candidate.finance_transaction_id
      AND removed_at IS NULL
      AND provider_transaction_id <> v_review_item.plaid_transaction_id
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object('success', false, 'code', 'match_candidate_already_mapped');
    END IF;

    SELECT id, finance_transaction_id, removed_at
    INTO v_existing_provider_mapping
    FROM public.plaid_finance_transaction_mappings
    WHERE user_id = v_user_id
      AND plaid_connection_id = v_review_item.plaid_connection_id
      AND provider_transaction_id = v_review_item.plaid_transaction_id
    FOR UPDATE;

    IF v_existing_provider_mapping.id IS NOT NULL
      AND v_existing_provider_mapping.removed_at IS NULL
      AND v_existing_provider_mapping.finance_transaction_id <> v_candidate.finance_transaction_id
    THEN
      RETURN jsonb_build_object('success', false, 'code', 'provider_transaction_already_mapped');
    END IF;

    IF v_candidate_tx.account_id IS NULL THEN
      UPDATE public.finance_transactions
      SET account_id = v_review_item.finance_account_id
      WHERE id = v_candidate.finance_transaction_id
        AND user_id = v_user_id
        AND source = 'rocket_money_csv'::text
        AND account_id IS NULL;
    END IF;

    IF v_candidate_tx.posted_date IS NULL THEN
      UPDATE public.finance_transactions
      SET posted_date = v_review_item.posted_date
      WHERE id = v_candidate.finance_transaction_id
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
        plaid_connection_id = v_review_item.plaid_connection_id,
        finance_transaction_id = v_candidate.finance_transaction_id,
        provider_transaction_id = v_review_item.plaid_transaction_id,
        provider_pending_transaction_id = v_review_item.pending_plaid_transaction_id,
        provider_observed_at = v_observed_at,
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
          v_review_item.plaid_connection_id,
          v_candidate.finance_transaction_id,
          v_review_item.plaid_transaction_id,
          v_review_item.pending_plaid_transaction_id,
          v_observed_at,
          NULL
        );
      EXCEPTION
        WHEN unique_violation THEN
          SELECT finance_transaction_id, removed_at
          INTO v_existing_provider_mapping
          FROM public.plaid_finance_transaction_mappings
          WHERE user_id = v_user_id
            AND plaid_connection_id = v_review_item.plaid_connection_id
            AND provider_transaction_id = v_review_item.plaid_transaction_id;

          IF v_existing_provider_mapping.removed_at IS NOT NULL
            OR v_existing_provider_mapping.finance_transaction_id <> v_candidate.finance_transaction_id
          THEN
            RETURN jsonb_build_object('success', false, 'code', 'provider_transaction_already_mapped');
          END IF;
      END;
    END IF;

    UPDATE public.plaid_transaction_match_review_items
    SET
      review_status = 'matched_existing'::text,
      resolved_finance_transaction_id = v_candidate.finance_transaction_id,
      resolved_at = v_observed_at
    WHERE id = v_review_item.id
      AND user_id = v_user_id
      AND review_status = 'pending'::text;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'code', 'resolve_failed');
    END IF;

    RETURN jsonb_build_object('success', true, 'code', 'matched_existing');
  END IF;

  SELECT id, finance_transaction_id, removed_at
  INTO v_existing_provider_mapping
  FROM public.plaid_finance_transaction_mappings
  WHERE user_id = v_user_id
    AND plaid_connection_id = v_review_item.plaid_connection_id
    AND provider_transaction_id = v_review_item.plaid_transaction_id
  FOR UPDATE;

  IF v_existing_provider_mapping.id IS NOT NULL
    AND v_existing_provider_mapping.removed_at IS NULL
  THEN
    SELECT id, user_id, source
    INTO v_candidate_tx
    FROM public.finance_transactions
    WHERE id = v_existing_provider_mapping.finance_transaction_id;

    IF v_candidate_tx.id IS NOT NULL
      AND v_candidate_tx.user_id = v_user_id
      AND v_candidate_tx.source = 'plaid'::text
    THEN
      UPDATE public.plaid_transaction_match_review_items
      SET
        review_status = 'imported_new'::text,
        resolved_finance_transaction_id = v_candidate_tx.id,
        resolved_at = v_observed_at
      WHERE id = v_review_item.id
        AND user_id = v_user_id
        AND review_status = 'pending'::text;

      RETURN jsonb_build_object('success', true, 'code', 'imported_new');
    END IF;

    RETURN jsonb_build_object('success', false, 'code', 'provider_transaction_already_mapped');
  END IF;

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
    v_review_item.finance_account_id,
    NULL,
    v_review_item.transaction_date,
    v_review_item.posted_date,
    v_review_item.amount,
    NULLIF(trim(both FROM v_review_item.merchant), ''),
    NULLIF(trim(both FROM v_review_item.description), ''),
    v_review_item.transaction_type,
    'posted'::text,
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
    v_review_item.plaid_connection_id,
    v_finance_transaction_id,
    v_review_item.plaid_transaction_id,
    v_review_item.pending_plaid_transaction_id,
    v_observed_at,
    NULL
  );

  UPDATE public.plaid_transaction_match_review_items
  SET
    review_status = 'imported_new'::text,
    resolved_finance_transaction_id = v_finance_transaction_id,
    resolved_at = v_observed_at
  WHERE id = v_review_item.id
    AND user_id = v_user_id
    AND review_status = 'pending'::text;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'resolve_failed');
  END IF;

  RETURN jsonb_build_object('success', true, 'code', 'imported_new');
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'resolve_failed');
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_plaid_transaction_match_review_item(
  uuid,
  uuid,
  text,
  uuid
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.resolve_plaid_transaction_match_review_item(
  uuid,
  uuid,
  text,
  uuid
) FROM anon;

GRANT EXECUTE ON FUNCTION public.resolve_plaid_transaction_match_review_item(
  uuid,
  uuid,
  text,
  uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.resolve_plaid_transaction_match_review_item(
  uuid,
  uuid,
  text,
  uuid
) TO service_role;
