-- Delete a Journal entry and its dependent links through one owner-scoped
-- transaction boundary. Missing, repeated, cross-owner, and unauthorised
-- requests deliberately share the same not-found outcome.

CREATE OR REPLACE FUNCTION public.delete_journal_entry_atomically(
  p_entry_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_deleted_entry_id UUID;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  -- Lock the owned entry before removing either side of the relationship.
  -- This serializes deletion with other Journal mutations for this entry.
  PERFORM 1
  FROM public.journal_entries
  WHERE id = p_entry_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  -- The foreign key also protects this invariant, but the explicit delete
  -- makes the Journal command's dependent-link cleanup visible and testable.
  DELETE FROM public.journal_entry_links
  WHERE entry_id = p_entry_id;

  DELETE FROM public.journal_entries
  WHERE id = p_entry_id
    AND user_id = p_user_id
  RETURNING id INTO v_deleted_entry_id;

  IF v_deleted_entry_id IS NULL THEN
    RAISE EXCEPTION 'Journal entry disappeared during deletion';
  END IF;

  RETURN jsonb_build_object('type', 'deleted');
END;
$$;

-- SECURITY INVOKER keeps the existing ownership policies authoritative. The
-- adapter exposes this function as the only Journal entry deletion seam.
GRANT SELECT, UPDATE, DELETE
  ON public.journal_entries
  TO authenticated;
GRANT DELETE ON public.journal_entry_links TO authenticated;

REVOKE ALL ON FUNCTION public.delete_journal_entry_atomically(UUID, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_journal_entry_atomically(UUID, UUID)
  TO authenticated;
