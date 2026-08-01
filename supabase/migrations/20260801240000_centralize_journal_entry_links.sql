-- Centralize Journal entry link mutations behind ownership-aware capabilities.
-- Both the entry and the polymorphic target are checked while the relevant
-- rows are locked. Missing and cross-owner rows intentionally share the same
-- not-found outcome.

CREATE OR REPLACE FUNCTION public.link_journal_entry(
  p_user_id UUID,
  p_entry_id UUID,
  p_link_type TEXT,
  p_link_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  linked_link public.journal_entry_links;
  existing_link public.journal_entry_links;
BEGIN
  -- The adapter passes the trusted identity, but the database verifies it
  -- again. A caller cannot use this capability as another user.
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  IF p_link_type IS NULL
    OR p_link_type NOT IN ('habit', 'task', 'project')
    OR p_link_id IS NULL THEN
    RETURN jsonb_build_object('type', 'conflict');
  END IF;

  -- Locking the entry makes the ownership/existence decision part of the
  -- mutation. RLS also applies because this function is security-invoker.
  PERFORM 1
  FROM public.journal_entries
  WHERE id = p_entry_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  -- The link target is part of the same ownership decision. The three
  -- branches intentionally have identical missing/cross-owner behavior.
  IF p_link_type = 'habit' THEN
    PERFORM 1
    FROM public.habits
    WHERE id = p_link_id
      AND user_id = p_user_id
    FOR UPDATE;
  ELSIF p_link_type = 'task' THEN
    PERFORM 1
    FROM public.tasks
    WHERE id = p_link_id
      AND user_id = p_user_id
    FOR UPDATE;
  ELSE
    PERFORM 1
    FROM public.projects
    WHERE id = p_link_id
      AND user_id = p_user_id
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  -- The unique key makes a repeated link an explicit, idempotent outcome.
  INSERT INTO public.journal_entry_links (entry_id, link_type, link_id)
  VALUES (p_entry_id, p_link_type, p_link_id)
  ON CONFLICT (entry_id, link_type, link_id) DO NOTHING
  RETURNING * INTO linked_link;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'type', 'linked',
      'link', to_jsonb(linked_link)
    );
  END IF;

  SELECT *
  INTO existing_link
  FROM public.journal_entry_links
  WHERE entry_id = p_entry_id
    AND link_type = p_link_type
    AND link_id = p_link_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'conflict');
  END IF;

  RETURN jsonb_build_object(
    'type', 'already-applied',
    'link', to_jsonb(existing_link)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unlink_journal_entry(
  p_user_id UUID,
  p_entry_id UUID,
  p_link_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_link public.journal_entry_links;
  removed_link public.journal_entry_links;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  PERFORM 1
  FROM public.journal_entries
  WHERE id = p_entry_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  -- Resolve the link through its owned entry before inspecting its target.
  -- This prevents link IDs from disclosing another entry's relationship.
  SELECT *
  INTO current_link
  FROM public.journal_entry_links
  WHERE id = p_link_id
    AND entry_id = p_entry_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  IF current_link.link_type = 'habit' THEN
    PERFORM 1
    FROM public.habits
    WHERE id = current_link.link_id
      AND user_id = p_user_id
    FOR UPDATE;
  ELSIF current_link.link_type = 'task' THEN
    PERFORM 1
    FROM public.tasks
    WHERE id = current_link.link_id
      AND user_id = p_user_id
    FOR UPDATE;
  ELSIF current_link.link_type = 'project' THEN
    PERFORM 1
    FROM public.projects
    WHERE id = current_link.link_id
      AND user_id = p_user_id
    FOR UPDATE;
  ELSE
    RETURN jsonb_build_object('type', 'conflict');
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  DELETE FROM public.journal_entry_links
  WHERE id = current_link.id
    AND entry_id = p_entry_id
  RETURNING * INTO removed_link;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'conflict');
  END IF;

  RETURN jsonb_build_object(
    'type', 'unlinked',
    'link', to_jsonb(removed_link)
  );
END;
$$;

-- Security-invoker row locks require the same narrow read/update privileges
-- used by the existing ownership policies. The link table additionally needs
-- insert/delete for the atomic relationship mutation.
GRANT SELECT, UPDATE ON public.habits TO authenticated;
GRANT SELECT, UPDATE ON public.tasks TO authenticated;
GRANT SELECT, UPDATE ON public.projects TO authenticated;
GRANT SELECT, INSERT, DELETE
  ON public.journal_entry_links
  TO authenticated;

REVOKE ALL ON FUNCTION public.link_journal_entry(UUID, UUID, TEXT, UUID)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unlink_journal_entry(UUID, UUID, UUID)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.link_journal_entry(UUID, UUID, TEXT, UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_journal_entry(UUID, UUID, UUID)
  TO authenticated;
