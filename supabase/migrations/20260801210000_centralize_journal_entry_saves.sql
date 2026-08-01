-- Centralize journal entry creation and updates behind one ownership-aware,
-- concurrency-safe save capability. Date saves insert first and then lock the
-- conflicting row before updating it, so concurrent saves converge on the
-- existing (user_id, entry_date) row instead of creating duplicates.

CREATE OR REPLACE FUNCTION public.save_journal_entry(
  p_user_id UUID,
  p_entry_id UUID,
  p_entry_date DATE,
  p_changes JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_entry public.journal_entries;
  saved_entry public.journal_entries;
  changes JSONB := COALESCE(p_changes, '{}'::jsonb);
  save_type TEXT;
BEGIN
  -- The identity is trusted by the adapter but checked again at the database
  -- boundary. Cross-owner requests are deliberately indistinguishable from
  -- missing entries.
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  -- An ID save is an explicit update. Locking the row makes ownership,
  -- existence, and the update one serialized decision.
  IF p_entry_id IS NOT NULL THEN
    SELECT *
    INTO current_entry
    FROM public.journal_entries
    WHERE id = p_entry_id
      AND user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('type', 'not-found');
    END IF;

    -- Entry dates are the identity of a date save and are not mutable through
    -- the explicit ID update path. A caller presenting both identities must
    -- present the same entry or receive a conflict.
    IF p_entry_date IS NOT NULL
      AND current_entry.entry_date IS DISTINCT FROM p_entry_date THEN
      RETURN jsonb_build_object('type', 'conflict');
    END IF;

    save_type := 'updated';
  ELSE

    -- A date is required for a save that does not name an existing entry. The
    -- domain module rejects this before the RPC; retaining a typed result keeps
    -- the persistence capability safe when called directly.
    IF p_entry_date IS NULL THEN
      RETURN jsonb_build_object('type', 'conflict');
    END IF;

    -- DO NOTHING lets us distinguish insertion from a date conflict without
    -- relying on implementation-specific tuple metadata. PostgreSQL waits for
    -- an in-flight conflicting insert before choosing this branch.
    INSERT INTO public.journal_entries (
      user_id,
      entry_date,
      title,
      content,
      mood,
      word_count,
      tags,
      prompt_key
    )
    VALUES (
      p_user_id,
      p_entry_date,
      COALESCE(changes->>'title', ''),
      COALESCE(changes->'content', '{"type":"doc","content":[]}'::jsonb),
      CASE
        WHEN changes ? 'mood' THEN (changes->>'mood')::INTEGER
        ELSE NULL
      END,
      COALESCE((changes->>'word_count')::INTEGER, 0),
      CASE
        WHEN changes ? 'tags' THEN ARRAY(
          SELECT jsonb_array_elements_text(changes->'tags')
        )
        ELSE ARRAY[]::TEXT[]
      END,
      CASE
        WHEN changes ? 'prompt_key' THEN changes->>'prompt_key'
        ELSE NULL
      END
    )
    ON CONFLICT (user_id, entry_date) DO NOTHING
    RETURNING * INTO saved_entry;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'type', 'created',
        'entry', to_jsonb(saved_entry)
      );
    END IF;

    -- The conflicting row is now committed and can be locked before applying
    -- this save. This is the retry/update half of the same atomic capability.
    SELECT *
    INTO current_entry
    FROM public.journal_entries
    WHERE user_id = p_user_id
      AND entry_date = p_entry_date
    FOR UPDATE;

    IF NOT FOUND THEN
      -- This can only occur if the conflicting row was removed after the
      -- conflict check. Treat it as an expected conflict rather than exposing
      -- an implementation detail to adapters.
      RETURN jsonb_build_object('type', 'conflict');
    END IF;

    save_type := 'updated';
  END IF;

  UPDATE public.journal_entries
  SET title = CASE
        WHEN changes ? 'title' THEN changes->>'title'
        ELSE title
      END,
      content = CASE
        WHEN changes ? 'content' THEN changes->'content'
        ELSE content
      END,
      mood = CASE
        WHEN changes ? 'mood' THEN (changes->>'mood')::INTEGER
        ELSE mood
      END,
      word_count = CASE
        WHEN changes ? 'word_count' THEN (changes->>'word_count')::INTEGER
        ELSE word_count
      END,
      tags = CASE
        WHEN changes ? 'tags' THEN ARRAY(
          SELECT jsonb_array_elements_text(changes->'tags')
        )
        ELSE tags
      END,
      prompt_key = CASE
        WHEN changes ? 'prompt_key' THEN changes->>'prompt_key'
        ELSE prompt_key
      END
  WHERE id = current_entry.id
  RETURNING * INTO saved_entry;

  RETURN jsonb_build_object(
    'type', save_type,
    'entry', to_jsonb(saved_entry)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_journal_entry(UUID, UUID, DATE, JSONB)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.save_journal_entry(UUID, UUID, DATE, JSONB)
  TO authenticated;

-- The RPC remains security-invoker so RLS enforces ownership for every row.
-- Journal reads and deletes remain query-owned by the existing repository;
-- creates and updates are now owned by the Journal save capability.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.journal_entries
  TO authenticated;
