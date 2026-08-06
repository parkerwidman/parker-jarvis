CREATE OR REPLACE FUNCTION public.import_rocket_money_business_expenses(
  p_input jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_content_hash text;
  v_business_category_id uuid;
  v_default_reminder_days smallint;
  v_rows jsonb;
  v_row jsonb;
  v_row_count integer;
  v_batch_id uuid;
  v_transaction_id uuid;
  v_recurring_id uuid;
  v_source_row_index integer;
  v_source_fingerprint text;
  v_transaction_date date;
  v_original_date date;
  v_merchant text;
  v_description text;
  v_jarvis_amount numeric(14, 2);
  v_transaction_type text;
  v_funding_source text;
  v_cost_treatment text;
  v_prepaid_months smallint;
  v_service_through_date date;
  v_classification_status text;
  v_notes text;
  v_recurrence jsonb;
  v_recurrence_name text;
  v_recurrence_type text;
  v_recurrence_frequency text;
  v_recurrence_expected_amount numeric(14, 2);
  v_next_expected_date date;
  v_spending_amount numeric(14, 2);
  v_imported_count integer := 0;
  v_recurring_count integer := 0;
  v_owner_funded_total numeric(14, 2) := 0;
  v_monthly_recurring_total numeric(14, 2) := 0;
  v_annual_recurring_total numeric(14, 2) := 0;
  v_existing_batch_id uuid;
  v_existing_fingerprint text;
  v_seen_fingerprints text[] := ARRAY[]::text[];
  v_seen_row_indexes integer[] := ARRAY[]::integer[];
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object' THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
  END IF;

  v_content_hash := trim(both FROM COALESCE(p_input ->> 'content_hash', ''));

  IF v_content_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_content_hash');
  END IF;

  IF p_input ->> 'business_category_id' IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
  END IF;

  BEGIN
    v_business_category_id := (p_input ->> 'business_category_id')::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN jsonb_build_object('success', false, 'code', 'category_not_found');
  END;

  SELECT id
  INTO v_business_category_id
  FROM public.finance_categories
  WHERE id = v_business_category_id
    AND user_id = v_user_id
    AND slug = 'business'
    AND category_kind = 'expense'
    AND active = true;

  IF v_business_category_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'category_not_found');
  END IF;

  v_default_reminder_days := COALESCE((p_input ->> 'default_reminder_days')::smallint, 3);

  IF v_default_reminder_days < 0 OR v_default_reminder_days > 90 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
  END IF;

  v_rows := p_input -> 'rows';

  IF v_rows IS NULL OR jsonb_typeof(v_rows) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
  END IF;

  v_row_count := jsonb_array_length(v_rows);

  IF v_row_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'no_importable_rows');
  END IF;

  IF v_row_count > 5000 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
  END IF;

  SELECT id
  INTO v_existing_batch_id
  FROM public.finance_import_batches
  WHERE user_id = v_user_id
    AND content_hash = v_content_hash
    AND status = ANY (ARRAY['processing'::text, 'completed'::text])
  LIMIT 1;

  IF v_existing_batch_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'batch_already_exists');
  END IF;

  FOR v_row IN
    SELECT value
    FROM jsonb_array_elements(v_rows)
  LOOP
    v_source_fingerprint := trim(both FROM COALESCE(v_row ->> 'source_fingerprint', ''));

    IF v_source_fingerprint !~ '^rm:[a-f0-9]{64}$' THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_fingerprint');
    END IF;

    IF v_source_fingerprint = ANY (v_seen_fingerprints) THEN
      RETURN jsonb_build_object('success', false, 'code', 'duplicate_rows_in_file');
    END IF;

    v_seen_fingerprints := array_append(v_seen_fingerprints, v_source_fingerprint);

    IF COALESCE(v_row ->> 'personal_or_business', '') <> 'business' THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_classification');
    END IF;

    IF COALESCE(v_row ->> 'business_context', '') <> 'melusi' THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_classification');
    END IF;

    v_classification_status := COALESCE(v_row ->> 'classification_status', '');

    IF v_classification_status = 'needs_review' THEN
      RETURN jsonb_build_object('success', false, 'code', 'needs_review_present');
    END IF;

    IF v_classification_status NOT IN ('user_confirmed', 'inferred') THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_classification');
    END IF;

    v_funding_source := COALESCE(v_row ->> 'funding_source', '');

    IF v_funding_source NOT IN ('owner_funded', 'business_account', 'unknown') THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_classification');
    END IF;

    v_cost_treatment := COALESCE(v_row ->> 'cost_treatment', '');

    IF v_cost_treatment NOT IN (
      'one_time',
      'monthly_recurring',
      'annual_recurring',
      'prepaid',
      'unknown'
    ) THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_classification');
    END IF;

    v_transaction_type := COALESCE(v_row ->> 'transaction_type', '');

    IF v_transaction_type NOT IN ('expense', 'refund') THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_classification');
    END IF;

    BEGIN
      v_jarvis_amount := (v_row ->> 'jarvis_amount')::numeric(14, 2);
    EXCEPTION
      WHEN invalid_text_representation THEN
        RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
    END;

    IF v_jarvis_amount IS NULL OR v_jarvis_amount = 0 THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
    END IF;

    IF v_transaction_type = 'expense' AND v_jarvis_amount >= 0 THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_classification');
    END IF;

    IF v_transaction_type = 'refund' AND v_jarvis_amount <= 0 THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_classification');
    END IF;

    v_recurrence := v_row -> 'recurrence_proposal';

    IF v_cost_treatment = 'monthly_recurring' THEN
      IF v_recurrence IS NULL
        OR jsonb_typeof(v_recurrence) <> 'object'
        OR COALESCE(v_recurrence ->> 'frequency', '') <> 'monthly'
        OR COALESCE(v_recurrence ->> 'recurring_type', '') <> 'subscription'
      THEN
        RETURN jsonb_build_object('success', false, 'code', 'recurrence_conflict');
      END IF;
    ELSIF v_cost_treatment = 'annual_recurring' THEN
      IF v_recurrence IS NULL
        OR jsonb_typeof(v_recurrence) <> 'object'
        OR COALESCE(v_recurrence ->> 'frequency', '') <> 'annual'
        OR COALESCE(v_recurrence ->> 'recurring_type', '') <> 'subscription'
      THEN
        RETURN jsonb_build_object('success', false, 'code', 'recurrence_conflict');
      END IF;
    ELSIF v_recurrence IS NOT NULL AND jsonb_typeof(v_recurrence) = 'object' THEN
      RETURN jsonb_build_object('success', false, 'code', 'recurrence_conflict');
    END IF;

    IF v_transaction_type = 'refund' AND v_recurrence IS NOT NULL AND jsonb_typeof(v_recurrence) = 'object' THEN
      RETURN jsonb_build_object('success', false, 'code', 'recurrence_conflict');
    END IF;

    IF v_cost_treatment IN ('monthly_recurring', 'annual_recurring') THEN
      v_recurrence_name := trim(both FROM COALESCE(v_recurrence ->> 'name', ''));

      IF char_length(v_recurrence_name) < 1 OR char_length(v_recurrence_name) > 200 THEN
        RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
      END IF;

      BEGIN
        v_recurrence_expected_amount := (v_recurrence ->> 'expected_amount')::numeric(14, 2);
      EXCEPTION
        WHEN invalid_text_representation THEN
          RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
      END;

      IF v_recurrence_expected_amount IS NULL OR v_recurrence_expected_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
      END IF;
    END IF;

    IF (v_row ->> 'source_row_index') IS NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
    END IF;

    BEGIN
      v_source_row_index := (v_row ->> 'source_row_index')::integer;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
    END;

    IF v_source_row_index < 0 THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
    END IF;

    IF v_source_row_index = ANY (v_seen_row_indexes) THEN
      RETURN jsonb_build_object('success', false, 'code', 'duplicate_rows_in_file');
    END IF;

    v_seen_row_indexes := array_append(v_seen_row_indexes, v_source_row_index);

    BEGIN
      v_transaction_date := (v_row ->> 'transaction_date')::date;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
    END;

    IF v_row ->> 'original_date' IS NOT NULL AND length(trim(v_row ->> 'original_date')) > 0 THEN
      BEGIN
        v_original_date := (v_row ->> 'original_date')::date;
      EXCEPTION
        WHEN invalid_text_representation THEN
          RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
      END;
    ELSE
      v_original_date := NULL;
    END IF;

    v_merchant := trim(both FROM COALESCE(v_row ->> 'merchant', ''));

    IF char_length(v_merchant) < 1 OR char_length(v_merchant) > 200 THEN
      RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
    END IF;

    IF v_row ->> 'description' IS NOT NULL THEN
      v_description := trim(both FROM v_row ->> 'description');
      IF char_length(v_description) > 500 THEN
        RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
      END IF;
      IF char_length(v_description) = 0 THEN
        v_description := NULL;
      END IF;
    ELSE
      v_description := NULL;
    END IF;

    IF v_row ->> 'notes' IS NOT NULL THEN
      v_notes := trim(both FROM v_row ->> 'notes');
      IF char_length(v_notes) > 1000 THEN
        RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
      END IF;
      IF char_length(v_notes) = 0 THEN
        v_notes := NULL;
      END IF;
    ELSE
      v_notes := NULL;
    END IF;

    IF v_row ->> 'prepaid_months' IS NOT NULL AND length(trim(v_row ->> 'prepaid_months')) > 0 THEN
      BEGIN
        v_prepaid_months := (v_row ->> 'prepaid_months')::smallint;
      EXCEPTION
        WHEN invalid_text_representation THEN
          RETURN jsonb_build_object('success', false, 'code', 'invalid_classification');
      END;

      IF v_prepaid_months <= 0 THEN
        RETURN jsonb_build_object('success', false, 'code', 'invalid_classification');
      END IF;
    ELSE
      v_prepaid_months := NULL;
    END IF;

    IF v_row ->> 'service_through_date' IS NOT NULL
      AND length(trim(v_row ->> 'service_through_date')) > 0
    THEN
      BEGIN
        v_service_through_date := (v_row ->> 'service_through_date')::date;
      EXCEPTION
        WHEN invalid_text_representation THEN
          RETURN jsonb_build_object('success', false, 'code', 'invalid_classification');
      END;
    ELSE
      v_service_through_date := NULL;
    END IF;
  END LOOP;

  SELECT deduplication_fingerprint
  INTO v_existing_fingerprint
  FROM public.finance_transactions
  WHERE user_id = v_user_id
    AND source = 'rocket_money_csv'
    AND deduplication_fingerprint = ANY (v_seen_fingerprints)
  LIMIT 1;

  IF v_existing_fingerprint IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'fingerprint_conflict');
  END IF;

  SELECT source_fingerprint
  INTO v_existing_fingerprint
  FROM public.finance_import_batch_items
  WHERE user_id = v_user_id
    AND source_fingerprint = ANY (v_seen_fingerprints)
    AND transaction_id IS NOT NULL
  LIMIT 1;

  IF v_existing_fingerprint IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'fingerprint_conflict');
  END IF;

  INSERT INTO public.finance_import_batches (
    user_id,
    source,
    content_hash,
    row_count,
    imported_count,
    skipped_count,
    status
  )
  VALUES (
    v_user_id,
    'rocket_money_csv',
    v_content_hash,
    v_row_count,
    0,
    0,
    'processing'
  )
  RETURNING id INTO v_batch_id;

  FOR v_row IN
    SELECT value
    FROM jsonb_array_elements(v_rows)
  LOOP
    v_source_row_index := (v_row ->> 'source_row_index')::integer;
    v_source_fingerprint := trim(both FROM v_row ->> 'source_fingerprint');
    v_transaction_date := (v_row ->> 'transaction_date')::date;

    IF v_row ->> 'original_date' IS NOT NULL AND length(trim(v_row ->> 'original_date')) > 0 THEN
      v_original_date := (v_row ->> 'original_date')::date;
    ELSE
      v_original_date := NULL;
    END IF;

    v_merchant := trim(both FROM v_row ->> 'merchant');
    v_description := NULLIF(trim(both FROM COALESCE(v_row ->> 'description', '')), '');
    v_jarvis_amount := (v_row ->> 'jarvis_amount')::numeric(14, 2);
    v_transaction_type := v_row ->> 'transaction_type';
    v_funding_source := v_row ->> 'funding_source';
    v_cost_treatment := v_row ->> 'cost_treatment';
    v_classification_status := v_row ->> 'classification_status';
    v_notes := NULLIF(trim(both FROM COALESCE(v_row ->> 'notes', '')), '');
    v_recurrence := v_row -> 'recurrence_proposal';
    v_recurring_id := NULL;

    IF v_row ->> 'prepaid_months' IS NOT NULL AND length(trim(v_row ->> 'prepaid_months')) > 0 THEN
      v_prepaid_months := (v_row ->> 'prepaid_months')::smallint;
    ELSE
      v_prepaid_months := NULL;
    END IF;

    IF v_row ->> 'service_through_date' IS NOT NULL
      AND length(trim(v_row ->> 'service_through_date')) > 0
    THEN
      v_service_through_date := (v_row ->> 'service_through_date')::date;
    ELSE
      v_service_through_date := NULL;
    END IF;

    IF v_transaction_type = 'expense'
      AND v_cost_treatment IN ('monthly_recurring', 'annual_recurring')
      AND v_recurrence IS NOT NULL
      AND jsonb_typeof(v_recurrence) = 'object'
    THEN
      v_recurrence_name := trim(both FROM COALESCE(v_recurrence ->> 'name', ''));
      v_recurrence_type := v_recurrence ->> 'recurring_type';
      v_recurrence_frequency := v_recurrence ->> 'frequency';
      v_recurrence_expected_amount := (v_recurrence ->> 'expected_amount')::numeric(14, 2);

      IF v_recurrence_frequency = 'monthly' THEN
        v_next_expected_date := (v_transaction_date + interval '1 month')::date;
      ELSE
        v_next_expected_date := (v_transaction_date + interval '1 year')::date;
      END IF;

      WHILE v_next_expected_date < CURRENT_DATE LOOP
        IF v_recurrence_frequency = 'monthly' THEN
          v_next_expected_date := (v_next_expected_date + interval '1 month')::date;
        ELSE
          v_next_expected_date := (v_next_expected_date + interval '1 year')::date;
        END IF;
      END LOOP;

      INSERT INTO public.finance_recurring_items (
        user_id,
        name,
        recurring_type,
        expected_amount,
        amount_variability,
        frequency,
        next_expected_date,
        account_id,
        category_id,
        autopay,
        active,
        reminder_days,
        source
      )
      VALUES (
        v_user_id,
        v_recurrence_name,
        v_recurrence_type,
        v_recurrence_expected_amount,
        'fixed',
        v_recurrence_frequency,
        v_next_expected_date,
        NULL,
        v_business_category_id,
        false,
        true,
        v_default_reminder_days,
        'rocket_money_csv'
      )
      RETURNING id INTO v_recurring_id;

      v_recurring_count := v_recurring_count + 1;
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
      deduplication_fingerprint,
      recurring_item_id,
      personal_or_business
    )
    VALUES (
      v_user_id,
      NULL,
      v_business_category_id,
      v_transaction_date,
      v_original_date,
      v_jarvis_amount,
      v_merchant,
      v_description,
      v_transaction_type,
      'posted',
      v_notes,
      'rocket_money_csv',
      v_source_fingerprint,
      v_recurring_id,
      'business'
    )
    RETURNING id INTO v_transaction_id;

    INSERT INTO public.finance_business_expense_details (
      user_id,
      transaction_id,
      business_context,
      funding_source,
      cost_treatment,
      prepaid_months,
      service_through_date,
      classification_status,
      notes
    )
    VALUES (
      v_user_id,
      v_transaction_id,
      'melusi',
      v_funding_source,
      v_cost_treatment,
      v_prepaid_months,
      v_service_through_date,
      v_classification_status,
      v_notes
    );

    INSERT INTO public.finance_import_batch_items (
      user_id,
      batch_id,
      transaction_id,
      source_row_index,
      source_fingerprint
    )
    VALUES (
      v_user_id,
      v_batch_id,
      v_transaction_id,
      v_source_row_index,
      v_source_fingerprint
    );

    v_imported_count := v_imported_count + 1;

    IF v_transaction_type = 'expense' THEN
      v_spending_amount := abs(v_jarvis_amount);

      IF v_funding_source = 'owner_funded' THEN
        v_owner_funded_total := v_owner_funded_total + v_spending_amount;
      END IF;

      IF v_cost_treatment = 'monthly_recurring' THEN
        v_monthly_recurring_total := v_monthly_recurring_total + v_spending_amount;
      ELSIF v_cost_treatment = 'annual_recurring' THEN
        v_annual_recurring_total := v_annual_recurring_total + v_spending_amount;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.finance_import_batches
  SET
    status = 'completed',
    imported_count = v_imported_count,
    skipped_count = 0,
    completed_at = now()
  WHERE id = v_batch_id
    AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'completed',
    'batch_id', v_batch_id,
    'imported_transaction_count', v_imported_count,
    'recurring_item_count', v_recurring_count,
    'owner_funded_spending_total', v_owner_funded_total,
    'monthly_recurring_amount', v_monthly_recurring_total,
    'annual_recurring_amount', v_annual_recurring_total,
    'estimated_annual_recurring_run_rate',
      v_monthly_recurring_total * 12 + v_annual_recurring_total
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'code', 'fingerprint_conflict');
  WHEN OTHERS THEN
    RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.import_rocket_money_business_expenses(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_rocket_money_business_expenses(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.import_rocket_money_business_expenses(jsonb) TO authenticated;
