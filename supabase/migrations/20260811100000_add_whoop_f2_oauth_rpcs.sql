-- WHOOP Fitness F2: refresh single-flight metadata and server-only OAuth RPCs.

ALTER TABLE public.whoop_connection_credentials
  ADD COLUMN refresh_claim_id uuid,
  ADD COLUMN refresh_claimed_at timestamp with time zone,
  ADD COLUMN token_version bigint DEFAULT 0 NOT NULL;

ALTER TABLE public.whoop_connection_credentials
  ADD CONSTRAINT whoop_connection_credentials_token_version_check
    CHECK (token_version >= 0);

CREATE OR REPLACE FUNCTION public.whoop_upsert_oauth_connection(
  p_user_id uuid,
  p_whoop_user_id bigint,
  p_granted_scopes text[],
  p_access_token_expires_at timestamp with time zone,
  p_encrypted_access_token text,
  p_encrypted_refresh_token text,
  p_encryption_version smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_connection_id uuid;
  v_now timestamp with time zone := now();
BEGIN
  IF p_user_id IS NULL
    OR p_whoop_user_id IS NULL
    OR p_granted_scopes IS NULL
    OR p_access_token_expires_at IS NULL
    OR p_encrypted_access_token IS NULL
    OR char_length(trim(p_encrypted_access_token)) < 1
    OR p_encrypted_refresh_token IS NULL
    OR char_length(trim(p_encrypted_refresh_token)) < 1
    OR p_encryption_version IS NULL
    OR p_encryption_version < 1
  THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
  END IF;

  INSERT INTO public.whoop_connections (
    user_id,
    whoop_user_id,
    status,
    granted_scopes,
    access_token_expires_at,
    connected_at,
    disconnected_at,
    last_error_code,
    sync_in_progress_at
  )
  VALUES (
    p_user_id,
    p_whoop_user_id,
    'connected',
    p_granted_scopes,
    p_access_token_expires_at,
    v_now,
    NULL,
    NULL,
    NULL
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    whoop_user_id = EXCLUDED.whoop_user_id,
    status = 'connected',
    granted_scopes = EXCLUDED.granted_scopes,
    access_token_expires_at = EXCLUDED.access_token_expires_at,
    connected_at = EXCLUDED.connected_at,
    disconnected_at = NULL,
    last_error_code = NULL,
    sync_in_progress_at = NULL,
    updated_at = v_now
  RETURNING id INTO v_connection_id;

  INSERT INTO public.whoop_connection_credentials (
    connection_id,
    encrypted_access_token,
    encrypted_refresh_token,
    encryption_version,
    refresh_claim_id,
    refresh_claimed_at,
    token_version
  )
  VALUES (
    v_connection_id,
    p_encrypted_access_token,
    p_encrypted_refresh_token,
    p_encryption_version,
    NULL,
    NULL,
    1
  )
  ON CONFLICT (connection_id) DO UPDATE
  SET
    encrypted_access_token = EXCLUDED.encrypted_access_token,
    encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
    encryption_version = EXCLUDED.encryption_version,
    refresh_claim_id = NULL,
    refresh_claimed_at = NULL,
    token_version = public.whoop_connection_credentials.token_version + 1,
    updated_at = v_now;

  RETURN jsonb_build_object(
    'success', true,
    'connection_id', v_connection_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'persistence_failed');
END;
$function$;

CREATE OR REPLACE FUNCTION public.whoop_claim_refresh(
  p_connection_id uuid,
  p_claim_id uuid,
  p_stale_after_seconds integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_row public.whoop_connection_credentials%ROWTYPE;
  v_stale_after integer;
BEGIN
  IF p_connection_id IS NULL OR p_claim_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
  END IF;

  v_stale_after := COALESCE(p_stale_after_seconds, 90);

  IF v_stale_after < 1 OR v_stale_after > 600 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
  END IF;

  SELECT *
  INTO v_row
  FROM public.whoop_connection_credentials
  WHERE connection_id = p_connection_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'credentials_not_found');
  END IF;

  IF v_row.refresh_claim_id IS NULL
    OR v_row.refresh_claimed_at IS NULL
    OR v_row.refresh_claimed_at + make_interval(secs => v_stale_after) <= now()
  THEN
    UPDATE public.whoop_connection_credentials
    SET
      refresh_claim_id = p_claim_id,
      refresh_claimed_at = now(),
      updated_at = now()
    WHERE connection_id = p_connection_id;

    RETURN jsonb_build_object(
      'success', true,
      'claimed', true,
      'token_version', v_row.token_version
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'claimed', false,
    'token_version', v_row.token_version,
    'current_claim_id', v_row.refresh_claim_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'claim_failed');
END;
$function$;

CREATE OR REPLACE FUNCTION public.whoop_complete_refresh(
  p_connection_id uuid,
  p_claim_id uuid,
  p_encrypted_access_token text,
  p_encrypted_refresh_token text,
  p_access_token_expires_at timestamp with time zone,
  p_prior_token_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_updated_count integer;
  v_new_token_version bigint;
BEGIN
  IF p_connection_id IS NULL
    OR p_claim_id IS NULL
    OR p_encrypted_access_token IS NULL
    OR char_length(trim(p_encrypted_access_token)) < 1
    OR p_encrypted_refresh_token IS NULL
    OR char_length(trim(p_encrypted_refresh_token)) < 1
    OR p_access_token_expires_at IS NULL
    OR p_prior_token_version IS NULL
  THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
  END IF;

  UPDATE public.whoop_connection_credentials
  SET
    encrypted_access_token = p_encrypted_access_token,
    encrypted_refresh_token = p_encrypted_refresh_token,
    refresh_claim_id = NULL,
    refresh_claimed_at = NULL,
    token_version = token_version + 1,
    updated_at = now()
  WHERE connection_id = p_connection_id
    AND refresh_claim_id = p_claim_id
    AND token_version = p_prior_token_version
  RETURNING token_version INTO v_new_token_version;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count <> 1 THEN
    RETURN jsonb_build_object('success', false, 'code', 'claim_mismatch');
  END IF;

  UPDATE public.whoop_connections
  SET
    access_token_expires_at = p_access_token_expires_at,
    last_error_code = NULL,
    updated_at = now()
  WHERE id = p_connection_id;

  RETURN jsonb_build_object(
    'success', true,
    'token_version', v_new_token_version
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'persistence_failed');
END;
$function$;

CREATE OR REPLACE FUNCTION public.whoop_release_refresh_claim(
  p_connection_id uuid,
  p_claim_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_updated_count integer;
BEGIN
  IF p_connection_id IS NULL OR p_claim_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
  END IF;

  UPDATE public.whoop_connection_credentials
  SET
    refresh_claim_id = NULL,
    refresh_claimed_at = NULL,
    updated_at = now()
  WHERE connection_id = p_connection_id
    AND refresh_claim_id = p_claim_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count <> 1 THEN
    RETURN jsonb_build_object('success', false, 'code', 'claim_mismatch');
  END IF;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'release_failed');
END;
$function$;

CREATE OR REPLACE FUNCTION public.whoop_disconnect_connection(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_connection_id uuid;
  v_now timestamp with time zone := now();
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_input');
  END IF;

  SELECT id
  INTO v_connection_id
  FROM public.whoop_connections
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'connection_not_found');
  END IF;

  DELETE FROM public.whoop_connection_credentials
  WHERE connection_id = v_connection_id;

  UPDATE public.whoop_connections
  SET
    status = 'disconnected',
    disconnected_at = v_now,
    access_token_expires_at = NULL,
    last_error_code = NULL,
    sync_in_progress_at = NULL,
    updated_at = v_now
  WHERE id = v_connection_id;

  RETURN jsonb_build_object('success', true, 'connection_id', v_connection_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'disconnect_failed');
END;
$function$;

REVOKE ALL ON FUNCTION public.whoop_upsert_oauth_connection(
  uuid, bigint, text[], timestamp with time zone, text, text, smallint
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.whoop_upsert_oauth_connection(
  uuid, bigint, text[], timestamp with time zone, text, text, smallint
) FROM anon;
REVOKE ALL ON FUNCTION public.whoop_upsert_oauth_connection(
  uuid, bigint, text[], timestamp with time zone, text, text, smallint
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.whoop_upsert_oauth_connection(
  uuid, bigint, text[], timestamp with time zone, text, text, smallint
) TO service_role;

REVOKE ALL ON FUNCTION public.whoop_claim_refresh(uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.whoop_claim_refresh(uuid, uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.whoop_claim_refresh(uuid, uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.whoop_claim_refresh(uuid, uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.whoop_complete_refresh(
  uuid, uuid, text, text, timestamp with time zone, bigint
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.whoop_complete_refresh(
  uuid, uuid, text, text, timestamp with time zone, bigint
) FROM anon;
REVOKE ALL ON FUNCTION public.whoop_complete_refresh(
  uuid, uuid, text, text, timestamp with time zone, bigint
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.whoop_complete_refresh(
  uuid, uuid, text, text, timestamp with time zone, bigint
) TO service_role;

REVOKE ALL ON FUNCTION public.whoop_release_refresh_claim(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.whoop_release_refresh_claim(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.whoop_release_refresh_claim(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.whoop_release_refresh_claim(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.whoop_disconnect_connection(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.whoop_disconnect_connection(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.whoop_disconnect_connection(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.whoop_disconnect_connection(uuid) TO service_role;
