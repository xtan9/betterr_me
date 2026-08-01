-- Centralize Project creation behind one normalized, owner-scoped capability.
-- The advisory lock makes append placement deterministic for concurrent creates
-- without exposing a read-then-insert ordering race to adapters.

CREATE OR REPLACE FUNCTION public.create_project_atomically(
  p_user_id UUID,
  p_name TEXT,
  p_section TEXT,
  p_color TEXT,
  p_status TEXT,
  p_sort_order DOUBLE PRECISION
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  created_project public.projects;
  next_sort_order DOUBLE PRECISION;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'userId',
      'message', 'User identity is required'
    );
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    -- A caller cannot choose another owner's identity. The application
    -- adapter supplies the trusted identity and service-role API-key calls
    -- remain supported when auth.uid() is absent.
    RETURN jsonb_build_object('type', 'conflict');
  END IF;

  IF p_name IS NULL OR char_length(btrim(p_name)) = 0 THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'name',
      'message', 'Name is required'
    );
  END IF;
  IF char_length(btrim(p_name)) > 50 THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'name',
      'message', 'Name must be 50 characters or less'
    );
  END IF;

  IF p_section IS NULL OR p_section NOT IN ('personal', 'work') THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'section',
      'message', 'Section is invalid'
    );
  END IF;

  IF p_color IS NULL
    OR (
      p_color NOT IN (
        'blue', 'red', 'green', 'orange', 'purple', 'pink', 'teal',
        'yellow', 'indigo', 'cyan', 'slate', 'emerald'
      )
      AND p_color !~ '^#[0-9A-Fa-f]{3,8}$'
    )
  THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'color',
      'message', 'Color is invalid'
    );
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('active', 'archived') THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'status',
      'message', 'Status is invalid'
    );
  END IF;

  IF p_sort_order IS NOT NULL
    AND (
      p_sort_order < 0
      OR p_sort_order = 'NaN'::DOUBLE PRECISION
      OR abs(p_sort_order) = 'Infinity'::DOUBLE PRECISION
    )
  THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'sortOrder',
      'message', 'Sort order must be a non-negative finite number'
    );
  END IF;

  -- Serialize only creates for the same owner's section. This keeps the
  -- max-plus-gap calculation and insert in one atomic decision while leaving
  -- unrelated users and sections independent.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::TEXT || ':' || p_section, 0)
  );

  next_sort_order := p_sort_order;
  IF next_sort_order IS NULL THEN
    SELECT COALESCE(MAX(sort_order), 0) + 65536.0
    INTO next_sort_order
    FROM public.projects
    WHERE user_id = p_user_id
      AND section = p_section;
  END IF;

  INSERT INTO public.projects (
    user_id,
    name,
    section,
    color,
    status,
    sort_order
  )
  VALUES (
    p_user_id,
    btrim(p_name),
    p_section,
    btrim(p_color),
    p_status,
    next_sort_order
  )
  RETURNING * INTO created_project;

  RETURN jsonb_build_object(
    'type', 'created',
    'project', to_jsonb(created_project)
  );
EXCEPTION
  WHEN unique_violation THEN
    -- Keep expected persistence conflicts typed while allowing all other
    -- infrastructure and programming failures to escape to the adapter.
    RETURN jsonb_build_object('type', 'conflict');
END;
$$;

REVOKE ALL ON FUNCTION public.create_project_atomically(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  DOUBLE PRECISION
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_project_atomically(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  DOUBLE PRECISION
) TO authenticated, service_role;

GRANT SELECT, INSERT ON TABLE public.projects TO authenticated;
GRANT SELECT, INSERT ON TABLE public.projects TO service_role;
