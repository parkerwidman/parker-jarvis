-- D4.1 validation for jarvis goals foundation additions.
\set ON_ERROR_STOP on

DO $validate$
DECLARE
  user_a uuid := '11111111-1111-1111-1111-111111111111';
  goal_personal_short uuid;
  goal_melusi_short uuid;
  goal_completed uuid;
BEGIN
  INSERT INTO auth.users (id) VALUES (user_a) ON CONFLICT DO NOTHING;
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);

  INSERT INTO public.jarvis_goals (
    user_id, title, goal_type, domain, status
  ) VALUES (
    user_a, 'Personal short', 'short_term', 'personal', 'active'
  ) RETURNING id INTO goal_personal_short;

  INSERT INTO public.jarvis_goals (
    user_id, title, goal_type, domain, status, target_date, notes
  ) VALUES (
    user_a, 'Melusi short', 'short_term', 'melusi', 'active', NULL, NULL
  ) RETURNING id INTO goal_melusi_short;

  INSERT INTO public.jarvis_goals (
    user_id, title, goal_type, domain, status
  ) VALUES (
    user_a, 'Completed personal', 'short_term', 'personal', 'completed'
  ) RETURNING id INTO goal_completed;

  ASSERT (SELECT public.set_jarvis_goal_priority(goal_personal_short)->>'success') = 'true';
  ASSERT (SELECT public.set_jarvis_goal_priority(goal_melusi_short)->>'success') = 'true';

  ASSERT (
    SELECT COUNT(*)
    FROM public.jarvis_goal_priorities
    WHERE user_id = user_a
  ) = 2;

  PERFORM public.set_jarvis_goal_priority(goal_melusi_short);

  ASSERT (
    SELECT goal_id
    FROM public.jarvis_goal_priorities
    WHERE user_id = user_a
      AND domain = 'melusi'
      AND goal_type = 'short_term'
  ) = goal_melusi_short;

  ASSERT (SELECT public.set_jarvis_goal_priority(goal_completed)->>'code') = 'goal_completed';

  UPDATE public.jarvis_goals
  SET status = 'archived'
  WHERE id = goal_personal_short;

  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.jarvis_goal_priorities
    WHERE goal_id = goal_personal_short
  );

  -- Partial metadata updates must preserve omitted NOT NULL fields.
  UPDATE public.jarvis_goals
  SET title = 'Get off academic probation and get into Tippie',
      description = 'Keep overview',
      notes = 'Keep notes',
      target_date = NULL,
      domain = 'personal',
      goal_type = 'short_term'
  WHERE id = goal_melusi_short;

  UPDATE public.jarvis_goals
  SET domain = 'personal',
      goal_type = 'long_term'
  WHERE id = goal_melusi_short;

  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);

  ASSERT (
    SELECT public.update_jarvis_goal_metadata(
      p_goal_id := goal_melusi_short,
      p_target_date := DATE '2026-08-17'
    )->>'success'
  ) = 'true';

  ASSERT (
    SELECT title
    FROM public.jarvis_goals
    WHERE id = goal_melusi_short
  ) = 'Get off academic probation and get into Tippie';

  ASSERT (
    SELECT domain
    FROM public.jarvis_goals
    WHERE id = goal_melusi_short
  ) = 'personal';

  ASSERT (
    SELECT goal_type
    FROM public.jarvis_goals
    WHERE id = goal_melusi_short
  ) = 'long_term';

  ASSERT (
    SELECT description
    FROM public.jarvis_goals
    WHERE id = goal_melusi_short
  ) = 'Keep overview';

  ASSERT (
    SELECT notes
    FROM public.jarvis_goals
    WHERE id = goal_melusi_short
  ) = 'Keep notes';

  ASSERT (
    SELECT target_date
    FROM public.jarvis_goals
    WHERE id = goal_melusi_short
  ) = DATE '2026-08-17';

  ASSERT (
    SELECT public.update_jarvis_goal_metadata(
      p_goal_id := goal_melusi_short,
      p_notes := 'Updated notes'
    )->>'success'
  ) = 'true';

  ASSERT (
    SELECT notes
    FROM public.jarvis_goals
    WHERE id = goal_melusi_short
  ) = 'Updated notes';

  ASSERT (
    SELECT goal_type
    FROM public.jarvis_goals
    WHERE id = goal_melusi_short
  ) = 'long_term';

  ASSERT (
    SELECT public.update_jarvis_goal_metadata(
      p_goal_id := goal_melusi_short,
      p_description := 'Updated overview'
    )->>'success'
  ) = 'true';

  ASSERT (
    SELECT description
    FROM public.jarvis_goals
    WHERE id = goal_melusi_short
  ) = 'Updated overview';

  ASSERT (
    SELECT domain
    FROM public.jarvis_goals
    WHERE id = goal_melusi_short
  ) = 'personal';

  ASSERT (
    SELECT public.update_jarvis_goal_metadata(
      p_goal_id := goal_melusi_short,
      p_title := 'Updated title'
    )->>'success'
  ) = 'true';

  ASSERT (
    SELECT title
    FROM public.jarvis_goals
    WHERE id = goal_melusi_short
  ) = 'Updated title';

  ASSERT (
    SELECT target_date
    FROM public.jarvis_goals
    WHERE id = goal_melusi_short
  ) = DATE '2026-08-17';

  ASSERT (
    SELECT public.update_jarvis_goal_metadata(
      p_goal_id := goal_melusi_short,
      p_clear_target_date := true
    )->>'success'
  ) = 'true';

  ASSERT (
    SELECT target_date
    FROM public.jarvis_goals
    WHERE id = goal_melusi_short
  ) IS NULL;

  ASSERT (
    SELECT title
    FROM public.jarvis_goals
    WHERE id = goal_melusi_short
  ) = 'Updated title';

  ASSERT (
    SELECT public.update_jarvis_goal_metadata(
      p_goal_id := goal_melusi_short,
      p_description := 'Still here'
    )->>'success'
  ) = 'true';

  ASSERT (
    SELECT public.update_jarvis_goal_metadata(
      p_goal_id := goal_melusi_short,
      p_description := ''
    )->>'success'
  ) = 'true';

  ASSERT (
    SELECT description
    FROM public.jarvis_goals
    WHERE id = goal_melusi_short
  ) IS NULL;

  ASSERT (
    SELECT public.update_jarvis_goal_metadata(
      p_goal_id := goal_melusi_short,
      p_notes := 'Still here'
    )->>'success'
  ) = 'true';

  ASSERT (
    SELECT public.update_jarvis_goal_metadata(
      p_goal_id := goal_melusi_short,
      p_notes := ''
    )->>'success'
  ) = 'true';

  ASSERT (
    SELECT notes
    FROM public.jarvis_goals
    WHERE id = goal_melusi_short
  ) IS NULL;

  ASSERT (
    SELECT public.update_jarvis_goal_metadata(
      p_goal_id := goal_melusi_short,
      p_domain := 'melusi'
    )->>'success'
  ) = 'true';

  ASSERT (
    SELECT domain
    FROM public.jarvis_goals
    WHERE id = goal_melusi_short
  ) = 'melusi';

  ASSERT (
    SELECT goal_type
    FROM public.jarvis_goals
    WHERE id = goal_melusi_short
  ) = 'long_term';

  ASSERT (
    SELECT public.update_jarvis_goal_metadata(
      p_goal_id := goal_melusi_short,
      p_goal_type := 'three_month'
    )->>'success'
  ) = 'true';

  ASSERT (
    SELECT goal_type
    FROM public.jarvis_goals
    WHERE id = goal_melusi_short
  ) = 'three_month';

  ASSERT (
    SELECT domain
    FROM public.jarvis_goals
    WHERE id = goal_melusi_short
  ) = 'melusi';

  RAISE NOTICE 'D4.1 jarvis goals foundation validation passed';
END;
$validate$;
