-- Permit create_outlook_draft in action_requests for auto-execute draft auditing.

ALTER TABLE public.action_requests
  DROP CONSTRAINT action_requests_action_type_check;

ALTER TABLE public.action_requests
  ADD CONSTRAINT action_requests_action_type_check
    CHECK (
      action_type = ANY (
        ARRAY[
          'create_outlook_calendar_event'::text,
          'create_outlook_reminder'::text,
          'create_outlook_draft'::text,
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
