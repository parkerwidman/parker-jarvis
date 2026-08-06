-- Extend action_type to permit approval-gated task creation.
ALTER TABLE public.action_requests
  DROP CONSTRAINT action_requests_action_type_check;

ALTER TABLE public.action_requests
  ADD CONSTRAINT action_requests_action_type_check
    CHECK (
      action_type = ANY (
        ARRAY[
          'create_outlook_calendar_event'::text,
          'update_outlook_calendar_event'::text,
          'delete_outlook_calendar_event'::text,
          'send_outlook_email'::text,
          'publish_social_post'::text,
          'delete_file'::text,
          'create_task'::text,
          'other'::text
        ]
      )
    );

-- Prevent mutation of immutable proposal fields after insert.
CREATE OR REPLACE FUNCTION public.prevent_action_request_immutable_updates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'action_request user_id is immutable';
  END IF;

  IF OLD.action_type IS DISTINCT FROM NEW.action_type THEN
    RAISE EXCEPTION 'action_request action_type is immutable';
  END IF;

  IF OLD.payload IS DISTINCT FROM NEW.payload THEN
    RAISE EXCEPTION 'action_request payload is immutable';
  END IF;

  IF OLD.risk_level IS DISTINCT FROM NEW.risk_level THEN
    RAISE EXCEPTION 'action_request risk_level is immutable';
  END IF;

  IF OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'action_request created_at is immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER action_requests_immutable_fields
  BEFORE UPDATE ON public.action_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_action_request_immutable_updates();
