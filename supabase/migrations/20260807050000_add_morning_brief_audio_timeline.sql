-- Phase 5A: Morning Brief audio timeline metadata for ritual synchronization.
-- Timeline generation is server-only and keyed to audio_content_hash.

ALTER TABLE public.morning_briefings
  ADD COLUMN audio_timeline jsonb;

ALTER TABLE public.morning_briefings
  ADD COLUMN audio_timeline_content_hash text;

ALTER TABLE public.morning_briefings
  ADD COLUMN audio_duration_ms integer;

ALTER TABLE public.morning_briefings
  ADD COLUMN audio_timeline_generated_at timestamp with time zone;

ALTER TABLE public.morning_briefings
  ADD COLUMN audio_timeline_error_code text;

ALTER TABLE public.morning_briefings
  ADD COLUMN audio_timeline_model text;

ALTER TABLE public.morning_briefings
  ADD CONSTRAINT morning_briefings_audio_timeline_content_hash_check
    CHECK (
      audio_timeline_content_hash IS NULL
      OR audio_timeline_content_hash ~ '^[0-9a-f]{64}$'::text
    );

ALTER TABLE public.morning_briefings
  ADD CONSTRAINT morning_briefings_audio_duration_ms_check
    CHECK (
      audio_duration_ms IS NULL
      OR audio_duration_ms > 0
    );

ALTER TABLE public.morning_briefings
  ADD CONSTRAINT morning_briefings_audio_timeline_error_code_check
    CHECK (
      audio_timeline_error_code IS NULL
      OR btrim(audio_timeline_error_code) <> ''::text
    );

ALTER TABLE public.morning_briefings
  ADD CONSTRAINT morning_briefings_audio_timeline_error_code_values_check
    CHECK (
      audio_timeline_error_code IS NULL
      OR audio_timeline_error_code = ANY (
        ARRAY[
          'timeline_transcription_failed'::text,
          'timeline_alignment_failed'::text,
          'timeline_storage_download_failed'::text,
          'timeline_invalid'::text
        ]
      )
    );

-- Timeline fields must represent one of two coherent states:
--   (A) no valid timeline — all success fields null; error code optional
--   (B) valid timeline — all success fields present, no error, hash matches audio
ALTER TABLE public.morning_briefings
  ADD CONSTRAINT morning_briefings_audio_timeline_state_check
    CHECK (
      (
        audio_timeline IS NULL
        AND audio_timeline_content_hash IS NULL
        AND audio_duration_ms IS NULL
        AND audio_timeline_generated_at IS NULL
        AND audio_timeline_model IS NULL
      )
      OR (
        audio_timeline IS NOT NULL
        AND audio_timeline_content_hash IS NOT NULL
        AND audio_duration_ms IS NOT NULL
        AND audio_duration_ms > 0
        AND audio_timeline_generated_at IS NOT NULL
        AND audio_timeline_model IS NOT NULL
        AND btrim(audio_timeline_model) <> ''::text
        AND audio_timeline_error_code IS NULL
        AND audio_content_hash IS NOT NULL
        AND audio_timeline_content_hash = audio_content_hash
      )
    );
