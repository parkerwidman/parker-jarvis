CREATE OR REPLACE FUNCTION public.prevent_jarvis_pending_schedule_action_identity_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'pending_schedule_action_identity_immutable';
  END IF;

  IF NEW.action_type IS DISTINCT FROM OLD.action_type THEN
    RAISE EXCEPTION 'pending_schedule_action_identity_immutable';
  END IF;

  IF NEW.payload IS DISTINCT FROM OLD.payload THEN
    RAISE EXCEPTION 'pending_schedule_action_identity_immutable';
  END IF;

  IF NEW.summary IS DISTINCT FROM OLD.summary THEN
    RAISE EXCEPTION 'pending_schedule_action_identity_immutable';
  END IF;

  IF NEW.agent_key IS DISTINCT FROM OLD.agent_key THEN
    RAISE EXCEPTION 'pending_schedule_action_identity_immutable';
  END IF;

  IF NEW.thread_id IS DISTINCT FROM OLD.thread_id THEN
    RAISE EXCEPTION 'pending_schedule_action_identity_immutable';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'pending_schedule_action_identity_immutable';
  END IF;

  IF NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'pending_schedule_action_identity_immutable';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER prevent_jarvis_pending_schedule_action_identity_mutation
  BEFORE UPDATE ON public.jarvis_pending_schedule_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_jarvis_pending_schedule_action_identity_mutation();

CREATE UNIQUE INDEX jarvis_pending_schedule_actions_one_active_main_idx
  ON public.jarvis_pending_schedule_actions (user_id)
  WHERE status = 'pending'::text AND agent_key = 'main'::text;

CREATE OR REPLACE FUNCTION public.jarvis_schedule_execute_pending_action(
  p_pending_action_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_action public.jarvis_pending_schedule_actions%ROWTYPE;
  v_result jsonb;
  v_safe_error text;
  v_rpc text;
  v_args jsonb;
  v_payload_version integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated');
  END IF;

  SELECT *
  INTO v_action
  FROM public.jarvis_pending_schedule_actions
  WHERE id = p_pending_action_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'pending_action_not_found');
  END IF;

  IF v_action.status = 'executed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'code', 'already_executed',
      'already_executed', true,
      'summary', v_action.summary,
      'result', v_action.result
    );
  END IF;

  IF v_action.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'code', 'cancelled');
  END IF;

  IF v_action.status = 'failed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'failed',
      'safe_error_message', v_action.safe_error_message
    );
  END IF;

  IF v_action.status = 'expired' OR v_action.expires_at <= now() THEN
    UPDATE public.jarvis_pending_schedule_actions
    SET status = 'expired'
    WHERE id = v_action.id;

    RETURN jsonb_build_object('success', false, 'code', 'expired');
  END IF;

  IF v_action.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'code', 'not_pending');
  END IF;

  v_payload_version := NULLIF(v_action.payload->>'version', '')::integer;

  IF v_payload_version IS DISTINCT FROM 1 THEN
    UPDATE public.jarvis_pending_schedule_actions
    SET status = 'failed',
        safe_error_message = 'Jarvis could not apply your schedule change.',
        result = jsonb_build_object('success', false, 'summary', v_action.summary)
    WHERE id = v_action.id;

    RETURN jsonb_build_object(
      'success', false,
      'code', 'invalid_payload',
      'safe_error_message', 'Jarvis could not apply your schedule change.'
    );
  END IF;

  v_rpc := v_action.payload->'execution'->>'rpc';
  v_args := v_action.payload->'execution'->'args';

  IF v_rpc IS NULL OR v_args IS NULL OR jsonb_typeof(v_args) <> 'object' THEN
    UPDATE public.jarvis_pending_schedule_actions
    SET status = 'failed',
        safe_error_message = 'Jarvis could not apply your schedule change.',
        result = jsonb_build_object('success', false, 'summary', v_action.summary)
    WHERE id = v_action.id;

    RETURN jsonb_build_object(
      'success', false,
      'code', 'invalid_payload',
      'safe_error_message', 'Jarvis could not apply your schedule change.'
    );
  END IF;

  UPDATE public.jarvis_pending_schedule_actions
  SET status = 'confirmed',
      confirmed_at = now()
  WHERE id = v_action.id;

  BEGIN
    CASE v_rpc
      WHEN 'jarvis_schedule_upsert_one_off_override' THEN
        SELECT public.jarvis_schedule_upsert_one_off_override(
          (v_args->>'p_schedule_id')::uuid,
          (v_args->>'p_occurrence_date')::date,
          v_args->>'p_title',
          v_args->>'p_category',
          (v_args->>'p_start_time')::time,
          NULLIF(v_args->>'p_end_time', '')::time,
          NULLIF(v_args->>'p_notes', ''),
          NULLIF(v_args->>'p_override_id', '')::uuid
        ) INTO v_result;
      WHEN 'jarvis_schedule_add_recurring_item' THEN
        SELECT public.jarvis_schedule_add_recurring_item(
          (v_args->>'p_schedule_id')::uuid,
          (v_args->>'p_day_of_week')::smallint,
          (v_args->>'p_effective_start_date')::date,
          v_args->>'p_title',
          v_args->>'p_category',
          (v_args->>'p_start_time')::time,
          NULLIF(v_args->>'p_end_time', '')::time,
          NULLIF(v_args->>'p_notes', '')
        ) INTO v_result;
      WHEN 'jarvis_schedule_upsert_replace_override' THEN
        SELECT public.jarvis_schedule_upsert_replace_override(
          (v_args->>'p_schedule_id')::uuid,
          (v_args->>'p_schedule_item_id')::uuid,
          (v_args->>'p_occurrence_date')::date,
          v_args->>'p_title',
          v_args->>'p_category',
          (v_args->>'p_start_time')::time,
          NULLIF(v_args->>'p_end_time', '')::time,
          NULLIF(v_args->>'p_notes', ''),
          NULLIF(v_args->>'p_override_id', '')::uuid
        ) INTO v_result;
      WHEN 'jarvis_schedule_move_occurrence' THEN
        SELECT public.jarvis_schedule_move_occurrence(
          (v_args->>'p_schedule_id')::uuid,
          (v_args->>'p_schedule_item_id')::uuid,
          (v_args->>'p_source_date')::date,
          (v_args->>'p_target_date')::date,
          v_args->>'p_title',
          v_args->>'p_category',
          (v_args->>'p_start_time')::time,
          NULLIF(v_args->>'p_end_time', '')::time,
          NULLIF(v_args->>'p_notes', ''),
          NULLIF(v_args->>'p_source_override_id', '')::uuid
        ) INTO v_result;
      WHEN 'jarvis_schedule_split_item_this_and_future' THEN
        SELECT public.jarvis_schedule_split_item_this_and_future(
          (v_args->>'p_schedule_id')::uuid,
          (v_args->>'p_schedule_item_id')::uuid,
          (v_args->>'p_split_date')::date,
          v_args->>'p_title',
          v_args->>'p_category',
          (v_args->>'p_day_of_week')::smallint,
          (v_args->>'p_start_time')::time,
          NULLIF(v_args->>'p_end_time', '')::time,
          NULLIF(v_args->>'p_notes', '')
        ) INTO v_result;
      WHEN 'jarvis_schedule_update_item_entire_series' THEN
        SELECT public.jarvis_schedule_update_item_entire_series(
          (v_args->>'p_schedule_id')::uuid,
          (v_args->>'p_schedule_item_id')::uuid,
          v_args->>'p_title',
          v_args->>'p_category',
          (v_args->>'p_day_of_week')::smallint,
          (v_args->>'p_start_time')::time,
          NULLIF(v_args->>'p_end_time', '')::time,
          NULLIF(v_args->>'p_notes', '')
        ) INTO v_result;
      WHEN 'jarvis_schedule_skip_occurrence' THEN
        SELECT public.jarvis_schedule_skip_occurrence(
          (v_args->>'p_schedule_id')::uuid,
          (v_args->>'p_schedule_item_id')::uuid,
          (v_args->>'p_occurrence_date')::date,
          NULLIF(v_args->>'p_override_id', '')::uuid
        ) INTO v_result;
      WHEN 'jarvis_schedule_end_item_this_and_future' THEN
        SELECT public.jarvis_schedule_end_item_this_and_future(
          (v_args->>'p_schedule_id')::uuid,
          (v_args->>'p_schedule_item_id')::uuid,
          (v_args->>'p_split_date')::date
        ) INTO v_result;
      WHEN 'jarvis_schedule_delete_item_entire_series' THEN
        SELECT public.jarvis_schedule_delete_item_entire_series(
          (v_args->>'p_schedule_id')::uuid,
          (v_args->>'p_schedule_item_id')::uuid
        ) INTO v_result;
      WHEN 'jarvis_schedule_delete_one_off_override' THEN
        SELECT public.jarvis_schedule_delete_one_off_override(
          (v_args->>'p_schedule_id')::uuid,
          (v_args->>'p_override_id')::uuid
        ) INTO v_result;
      ELSE
        v_result := jsonb_build_object('success', false, 'code', 'unsupported_rpc');
    END CASE;
  EXCEPTION
    WHEN OTHERS THEN
      v_result := jsonb_build_object('success', false, 'code', 'execution_failed');
  END;

  IF COALESCE((v_result->>'success')::boolean, false) THEN
    UPDATE public.jarvis_pending_schedule_actions
    SET status = 'executed',
        executed_at = now(),
        result = jsonb_build_object(
          'success', true,
          'summary', v_action.summary
        ),
        safe_error_message = NULL
    WHERE id = v_action.id;

    RETURN jsonb_build_object(
      'success', true,
      'summary', v_action.summary,
      'result', jsonb_build_object('success', true, 'summary', v_action.summary)
    );
  END IF;

  v_safe_error := CASE v_result->>'code'
    WHEN 'invalid_date' THEN 'That date falls outside the selected schedule period.'
    WHEN 'invalid_occurrence' THEN 'That schedule block is no longer valid for the proposed change.'
    WHEN 'schedule_not_found' THEN 'Jarvis could not find that schedule block.'
    WHEN 'schedule_item_not_found' THEN 'Jarvis could not find that schedule block.'
    WHEN 'unsupported_rpc' THEN 'Jarvis could not apply your schedule change.'
    WHEN 'invalid_payload' THEN 'Jarvis could not apply your schedule change.'
    ELSE 'Jarvis could not apply your schedule change.'
  END;

  UPDATE public.jarvis_pending_schedule_actions
  SET status = 'failed',
      safe_error_message = v_safe_error,
      result = jsonb_build_object(
        'success', false,
        'summary', v_action.summary
      )
  WHERE id = v_action.id;

  RETURN jsonb_build_object(
    'success', false,
    'code', COALESCE(v_result->>'code', 'execution_failed'),
    'safe_error_message', v_safe_error
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.prevent_jarvis_pending_schedule_action_identity_mutation()
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.jarvis_schedule_execute_pending_action(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.jarvis_schedule_execute_pending_action(uuid)
  FROM PUBLIC;
