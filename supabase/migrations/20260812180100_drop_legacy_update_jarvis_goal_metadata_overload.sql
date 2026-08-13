-- D4.2 hotfix: remove legacy 4-arg metadata RPC overload.
-- D4.1 expanded update_jarvis_goal_metadata to 8 args but CREATE OR REPLACE
-- does not drop a different signature. PostgREST cannot reliably resolve RPC
-- calls while both overloads share p_goal_id/p_title/p_domain/p_goal_type.

DROP FUNCTION IF EXISTS public.update_jarvis_goal_metadata(uuid, text, text, text);
