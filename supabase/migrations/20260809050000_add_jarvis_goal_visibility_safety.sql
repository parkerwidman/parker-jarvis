CREATE OR REPLACE VIEW public.jarvis_visible_tasks
WITH (security_invoker = true)
AS
SELECT t.*
FROM public.tasks t
LEFT JOIN public.jarvis_goals g
  ON g.id = t.goal_id
WHERE t.goal_id IS NULL
   OR g.status IS DISTINCT FROM 'archived'::text;

GRANT SELECT ON public.jarvis_visible_tasks TO authenticated;

GRANT SELECT ON public.jarvis_visible_tasks TO service_role;

CREATE OR REPLACE FUNCTION public.clear_jarvis_today_priority_on_goal_change()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
BEGIN
  IF NEW.status = 'active'::text
     AND NEW.goal_type = 'short_term'::text THEN
    RETURN NEW;
  END IF;

  UPDATE public.jarvis_profiles
  SET today_priority_goal_id = NULL,
      updated_at = now()
  WHERE user_id = NEW.user_id
    AND today_priority_goal_id = NEW.id;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER clear_jarvis_today_priority_on_goal_change
  AFTER UPDATE OF status, goal_type ON public.jarvis_goals
  FOR EACH ROW
  WHEN (
    (
      OLD.status IS DISTINCT FROM NEW.status
      OR OLD.goal_type IS DISTINCT FROM NEW.goal_type
    )
    AND (
      NEW.status IS DISTINCT FROM 'active'::text
      OR NEW.goal_type IS DISTINCT FROM 'short_term'::text
    )
  )
  EXECUTE FUNCTION public.clear_jarvis_today_priority_on_goal_change();

REVOKE DELETE ON public.jarvis_goals FROM authenticated;
