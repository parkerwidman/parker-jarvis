-- Phase 5C: Morning Brief mode recommendation metadata for ritual synchronization.
-- Recommendation is derived from the structured main priority domain, not UI mode.

ALTER TABLE public.morning_briefings
  ADD COLUMN recommended_mode text;

ALTER TABLE public.morning_briefings
  ADD COLUMN recommendation_sentence_index integer;

ALTER TABLE public.morning_briefings
  ADD CONSTRAINT morning_briefings_recommended_mode_values_check
    CHECK (
      recommended_mode IS NULL
      OR recommended_mode = ANY (ARRAY['personal'::text, 'melusi'::text])
    );

ALTER TABLE public.morning_briefings
  ADD CONSTRAINT morning_briefings_recommendation_sentence_index_check
    CHECK (
      recommendation_sentence_index IS NULL
      OR recommendation_sentence_index >= 0
    );

ALTER TABLE public.morning_briefings
  ADD CONSTRAINT morning_briefings_recommendation_metadata_state_check
    CHECK (
      (
        recommended_mode IS NULL
        AND recommendation_sentence_index IS NULL
      )
      OR (
        recommended_mode IS NOT NULL
        AND recommendation_sentence_index IS NOT NULL
      )
    );
