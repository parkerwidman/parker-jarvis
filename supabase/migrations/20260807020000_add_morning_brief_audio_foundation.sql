-- Phase 1: Morning Brief audio lifecycle fields and private storage bucket.
-- Audio uploads, deletions, signing, and cleanup are service-role only; no
-- browser-facing storage.objects policies are required for this bucket.

ALTER TABLE public.morning_briefings
  ADD COLUMN audio_status text DEFAULT 'none'::text NOT NULL;

ALTER TABLE public.morning_briefings
  ADD COLUMN audio_content_hash text;

ALTER TABLE public.morning_briefings
  ADD COLUMN audio_storage_path text;

ALTER TABLE public.morning_briefings
  ADD COLUMN audio_generated_at timestamp with time zone;

ALTER TABLE public.morning_briefings
  ADD COLUMN audio_error_code text;

ALTER TABLE public.morning_briefings
  ADD COLUMN audio_model text;

ALTER TABLE public.morning_briefings
  ADD COLUMN audio_voice text;

ALTER TABLE public.morning_briefings
  ADD CONSTRAINT morning_briefings_audio_status_check
    CHECK (
      audio_status = ANY (
        ARRAY[
          'none'::text,
          'pending'::text,
          'generating'::text,
          'ready'::text,
          'failed'::text
        ]
      )
    );

ALTER TABLE public.morning_briefings
  ADD CONSTRAINT morning_briefings_audio_content_hash_check
    CHECK (
      audio_content_hash IS NULL
      OR audio_content_hash ~ '^[0-9a-f]{64}$'::text
    );

ALTER TABLE public.morning_briefings
  ADD CONSTRAINT morning_briefings_audio_storage_path_check
    CHECK (
      audio_storage_path IS NULL
      OR btrim(audio_storage_path) <> ''::text
    );

ALTER TABLE public.morning_briefings
  ADD CONSTRAINT morning_briefings_audio_error_code_check
    CHECK (
      audio_error_code IS NULL
      OR btrim(audio_error_code) <> ''::text
    );

ALTER TABLE public.morning_briefings
  ADD CONSTRAINT morning_briefings_audio_ready_fields_check
    CHECK (
      audio_status <> 'ready'::text
      OR (
        audio_content_hash IS NOT NULL
        AND audio_storage_path IS NOT NULL
        AND audio_generated_at IS NOT NULL
      )
    );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'morning-brief-audio',
  'morning-brief-audio',
  false,
  10485760,
  ARRAY['audio/mpeg']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  name = 'morning-brief-audio',
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['audio/mpeg']::text[];
