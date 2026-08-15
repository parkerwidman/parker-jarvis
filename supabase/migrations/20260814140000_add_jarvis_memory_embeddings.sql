CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

ALTER TABLE public.memories
  ADD COLUMN IF NOT EXISTS embedding extensions.vector(1536),
  ADD COLUMN IF NOT EXISTS embedding_model text,
  ADD COLUMN IF NOT EXISTS embedding_content_hash text,
  ADD COLUMN IF NOT EXISTS embedded_at timestamp with time zone;

ALTER TABLE public.memories
  ADD CONSTRAINT memories_embedding_model_check
    CHECK (embedding_model IS NULL OR char_length(embedding_model) <= 128);

ALTER TABLE public.memories
  ADD CONSTRAINT memories_embedding_content_hash_check
    CHECK (
      embedding_content_hash IS NULL
      OR char_length(embedding_content_hash) = 64
    );

CREATE INDEX IF NOT EXISTS memories_user_active_embedded_idx
  ON public.memories (user_id, importance DESC, created_at DESC)
  WHERE active = true AND embedding IS NOT NULL;

CREATE OR REPLACE FUNCTION public.invalidate_memory_embedding_on_content_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content
     OR NEW.category IS DISTINCT FROM OLD.category THEN
    NEW.embedding := NULL;
    NEW.embedding_model := NULL;
    NEW.embedding_content_hash := NULL;
    NEW.embedded_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invalidate_memory_embedding_on_content_change ON public.memories;

CREATE TRIGGER invalidate_memory_embedding_on_content_change
  BEFORE UPDATE ON public.memories
  FOR EACH ROW
  EXECUTE FUNCTION public.invalidate_memory_embedding_on_content_change();

CREATE OR REPLACE FUNCTION public.match_jarvis_memories(
  query_embedding extensions.vector(1536),
  match_count integer DEFAULT 15,
  match_threshold double precision DEFAULT 0.35,
  expected_embedding_model text DEFAULT 'text-embedding-3-small'
)
RETURNS TABLE (
  id uuid,
  category text,
  content text,
  importance smallint,
  confirmed_by_user boolean,
  created_at timestamp with time zone,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH params AS (
    SELECT
      LEAST(GREATEST(match_count, 1), 50) AS effective_count,
      LEAST(GREATEST(match_threshold, 0.0), 1.0) AS effective_threshold,
      COALESCE(
        NULLIF(btrim(expected_embedding_model), ''),
        'text-embedding-3-small'
      ) AS effective_model
  )
  SELECT
    m.id,
    m.category,
    m.content,
    m.importance,
    m.confirmed_by_user,
    m.created_at,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM public.memories m
  CROSS JOIN params p
  WHERE query_embedding IS NOT NULL
    AND m.user_id = auth.uid()
    AND m.active = true
    AND m.embedding IS NOT NULL
    AND m.embedding_content_hash IS NOT NULL
    AND m.embedding_model = p.effective_model
    AND 1 - (m.embedding <=> query_embedding) >= p.effective_threshold
  ORDER BY
    m.embedding <=> query_embedding,
    m.importance DESC,
    m.created_at DESC,
    m.id
  LIMIT (SELECT effective_count FROM params);
$$;

REVOKE ALL ON FUNCTION public.match_jarvis_memories(extensions.vector, integer, double precision, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_jarvis_memories(extensions.vector, integer, double precision, text) TO authenticated;
