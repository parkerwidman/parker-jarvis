-- Fixture for PostgREST-like identity validation. Run as postgres before the authenticator script.
-- Example:
--   docker exec -i supabase_db_parker-jarvis psql -U postgres -d postgres < supabase/tests/jarvis_goal_task_security_identity_setup.sql

DO $setup$
DECLARE
  user_a uuid := '14141414-1414-1414-1414-141414141414';
  goal_id uuid;
  level_1 uuid;
BEGIN
  INSERT INTO auth.users (id) VALUES (user_a)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.jarvis_profiles (user_id)
  VALUES (user_a)
  ON CONFLICT DO NOTHING;

  DELETE FROM public.tasks WHERE user_id = user_a;
  DELETE FROM public.jarvis_goal_levels WHERE user_id = user_a;
  DELETE FROM public.jarvis_goals WHERE user_id = user_a;

  INSERT INTO public.jarvis_goals (user_id, title, goal_type, domain)
  VALUES (user_a, 'Identity goal', 'short_term', 'personal')
  RETURNING id INTO goal_id;

  INSERT INTO public.jarvis_goal_levels (user_id, goal_id, name, position)
  VALUES (user_a, goal_id, 'Level 1', 10)
  RETURNING id INTO level_1;

  INSERT INTO public.tasks (user_id, title, goal_id, goal_level_id, position)
  VALUES (user_a, 'Identity goal task', goal_id, level_1, 10);

  INSERT INTO public.tasks (user_id, title)
  VALUES (user_a, 'Identity standalone');
END;
$setup$;
