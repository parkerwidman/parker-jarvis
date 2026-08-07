-- Additive recovery timestamp for abandoned Morning Brief audio generation claims.
-- No RLS, grant, or storage policy changes.

ALTER TABLE public.morning_briefings
  ADD COLUMN audio_generation_started_at timestamp with time zone;

ALTER TABLE public.morning_briefings
  ADD CONSTRAINT morning_briefings_audio_generation_started_at_check
    CHECK (
      (
        audio_status = 'generating'::text
        AND audio_generation_started_at IS NOT NULL
      )
      OR (
        audio_status <> 'generating'::text
        AND audio_generation_started_at IS NULL
      )
    );
