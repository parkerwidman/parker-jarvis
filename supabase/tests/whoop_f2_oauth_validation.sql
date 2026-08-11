-- Local validation for WHOOP Fitness F2 OAuth RPCs.
-- Example:
--   npx supabase db reset --local
--   docker exec -i supabase_db_parker-jarvis psql -U postgres -d postgres < supabase/tests/whoop_f2_oauth_validation.sql

DO $validate$
DECLARE
  user_f2 uuid := 'f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2';
  connection_f2 uuid;
  claim_a uuid := 'f2a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1';
  claim_b uuid := 'f2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2';
  upsert_result jsonb;
  claim_result jsonb;
  complete_result jsonb;
  release_result jsonb;
  disconnect_result jsonb;
  policy_count integer;
BEGIN
  -- Remove prior F2 fixture rows so this script is rerun-safe.
  DELETE FROM public.whoop_connection_credentials
  WHERE connection_id IN (
    SELECT id FROM public.whoop_connections WHERE user_id = user_f2
  );

  DELETE FROM public.whoop_connections
  WHERE user_id = user_f2;

  DELETE FROM auth.users
  WHERE id = user_f2;

  INSERT INTO auth.users (id)
  VALUES (user_f2);

  SELECT public.whoop_upsert_oauth_connection(
    user_f2,
    10129,
    ARRAY['offline', 'read:recovery'],
    now() + interval '1 hour',
    'enc-access-a',
    'enc-refresh-a',
    1::smallint
  ) INTO upsert_result;

  IF COALESCE((upsert_result->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'whoop_upsert_oauth_connection failed: %', upsert_result;
  END IF;

  connection_f2 := (upsert_result->>'connection_id')::uuid;

  IF connection_f2 IS NULL THEN
    RAISE EXCEPTION 'whoop_upsert_oauth_connection must return connection_id';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.whoop_connections
    WHERE user_id = user_f2
      AND id = connection_f2
      AND status = 'connected'
      AND whoop_user_id = 10129
      AND disconnected_at IS NULL
  ) THEN
    RAISE EXCEPTION 'whoop_upsert_oauth_connection did not update connection metadata';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.whoop_connection_credentials
    WHERE connection_id = connection_f2
      AND encrypted_access_token = 'enc-access-a'
      AND encrypted_refresh_token = 'enc-refresh-a'
      AND token_version >= 1
  ) THEN
    RAISE EXCEPTION 'whoop_upsert_oauth_connection did not persist credentials';
  END IF;

  SELECT public.whoop_claim_refresh(connection_f2, claim_a, 90)
  INTO claim_result;

  IF COALESCE((claim_result->>'claimed')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'first refresh claim should succeed: %', claim_result;
  END IF;

  SELECT public.whoop_claim_refresh(connection_f2, claim_b, 90)
  INTO claim_result;

  IF COALESCE((claim_result->>'claimed')::boolean, false) IS NOT FALSE THEN
    RAISE EXCEPTION 'second refresh claim should lose: %', claim_result;
  END IF;

  SELECT public.whoop_complete_refresh(
    connection_f2,
    claim_b,
    'enc-access-b',
    'enc-refresh-b',
    now() + interval '2 hours',
    COALESCE((claim_result->>'token_version')::bigint, 0)
  ) INTO complete_result;

  IF COALESCE((complete_result->>'success')::boolean, false) IS NOT FALSE THEN
    RAISE EXCEPTION 'wrong claim must not complete refresh: %', complete_result;
  END IF;

  SELECT public.whoop_complete_refresh(
    connection_f2,
    claim_a,
    'enc-access-winner',
    'enc-refresh-winner',
    now() + interval '2 hours',
    COALESCE((claim_result->>'token_version')::bigint, 0)
  ) INTO complete_result;

  IF COALESCE((complete_result->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'winner claim should complete refresh: %', complete_result;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.whoop_connection_credentials
    WHERE connection_id = connection_f2
      AND encrypted_access_token = 'enc-access-winner'
      AND encrypted_refresh_token = 'enc-refresh-winner'
      AND refresh_claim_id IS NULL
      AND refresh_claimed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'complete refresh did not persist rotated credentials';
  END IF;

  SELECT public.whoop_release_refresh_claim(connection_f2, claim_a)
  INTO release_result;

  SELECT public.whoop_disconnect_connection(user_f2)
  INTO disconnect_result;

  IF COALESCE((disconnect_result->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'disconnect should succeed: %', disconnect_result;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.whoop_connection_credentials
    WHERE connection_id = connection_f2
  ) THEN
    RAISE EXCEPTION 'disconnect must delete credentials';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.whoop_connections
    WHERE user_id = user_f2
      AND status = 'disconnected'
      AND access_token_expires_at IS NULL
  ) THEN
    RAISE EXCEPTION 'disconnect must mark connection disconnected';
  END IF;

  SELECT COUNT(*)
  INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'whoop_connection_credentials';

  IF policy_count <> 0 THEN
    RAISE EXCEPTION 'whoop_connection_credentials must remain without client policies';
  END IF;

  RAISE NOTICE 'WHOOP F2 OAuth validation passed';
END;
$validate$;
