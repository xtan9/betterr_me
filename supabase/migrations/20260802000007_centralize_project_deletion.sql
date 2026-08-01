-- Delete an owner-scoped Project and unassign its dependent Tasks through one
-- atomic mutation boundary. Missing, repeated, cross-owner, and unauthorised
-- requests deliberately share the same not-found outcome.

CREATE OR REPLACE FUNCTION public.delete_project_atomically(
  p_project_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_deleted_project_id UUID;
BEGIN
  IF p_project_id IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    -- The trusted adapter identity cannot be spoofed. Keep this outcome
    -- indistinguishable from a missing or foreign project.
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  -- Lock the owner-scoped row before changing either side of the relationship.
  -- This serializes deletion with other Project mutations for this Project.
  PERFORM 1
  FROM public.projects
  WHERE id = p_project_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- The owner predicate deliberately masks missing and cross-owner rows.
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  -- The foreign key also protects this invariant, but the explicit update
  -- makes dependent Task unassignment visible inside this command boundary.
  UPDATE public.tasks
  SET project_id = NULL
  WHERE project_id = p_project_id;

  DELETE FROM public.projects
  WHERE id = p_project_id
    AND user_id = p_user_id
  RETURNING id INTO v_deleted_project_id;

  IF v_deleted_project_id IS NULL THEN
    RAISE EXCEPTION 'Project disappeared during deletion';
  END IF;

  RETURN jsonb_build_object('type', 'deleted');
END;
$$;

-- SECURITY INVOKER keeps the existing ownership policies authoritative. The
-- adapters expose this function as the only Project deletion seam.
REVOKE ALL ON FUNCTION public.delete_project_atomically(UUID, UUID)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_project_atomically(UUID, UUID)
TO authenticated, service_role;

GRANT SELECT, DELETE ON TABLE public.projects
TO authenticated, service_role;
GRANT SELECT, UPDATE ON TABLE public.tasks
TO authenticated, service_role;
