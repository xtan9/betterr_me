-- Centralize owner-scoped Project changes, including active/archived lifecycle
-- transitions, behind one normalized and idempotent persistence capability.

CREATE OR REPLACE FUNCTION public.update_project_atomically(
  p_project_id UUID,
  p_user_id UUID,
  p_changes JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_project public.projects;
  updated_project public.projects;
  changes JSONB := COALESCE(p_changes, '{}'::JSONB);
  has_effective_change BOOLEAN := FALSE;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'userId',
      'message', 'User identity is required'
    );
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN
    -- The trusted adapter identity cannot be spoofed. Keep this outcome
    -- indistinguishable from a missing or foreign project.
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  IF p_project_id IS NULL THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  SELECT *
  INTO current_project
  FROM public.projects
  WHERE id = p_project_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- The owner predicate deliberately masks missing and cross-owner rows.
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  IF jsonb_typeof(changes) <> 'object' OR changes = '{}'::JSONB THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'changes',
      'message', 'At least one project field must be provided'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(changes) AS key
    WHERE key NOT IN ('name', 'section', 'color', 'status', 'sort_order')
  ) THEN
    RETURN jsonb_build_object(
      'type', 'invalid',
      'field', 'changes',
      'message', 'Project changes contain an unsupported field'
    );
  END IF;

  IF changes ? 'name' THEN
    IF jsonb_typeof(changes->'name') <> 'string'
      OR char_length(btrim(changes->>'name')) = 0 THEN
      RETURN jsonb_build_object(
        'type', 'invalid',
        'field', 'name',
        'message', 'Name is required'
      );
    END IF;
    IF char_length(btrim(changes->>'name')) > 50 THEN
      RETURN jsonb_build_object(
        'type', 'invalid',
        'field', 'name',
        'message', 'Name must be 50 characters or less'
      );
    END IF;
    changes := jsonb_set(
      changes,
      '{name}',
      to_jsonb(btrim(changes->>'name')),
      TRUE
    );
  END IF;

  IF changes ? 'section' THEN
    IF jsonb_typeof(changes->'section') <> 'string'
      OR btrim(changes->>'section') NOT IN ('personal', 'work') THEN
      RETURN jsonb_build_object(
        'type', 'invalid',
        'field', 'section',
        'message', 'Section is invalid'
      );
    END IF;
    changes := jsonb_set(
      changes,
      '{section}',
      to_jsonb(btrim(changes->>'section')),
      TRUE
    );
  END IF;

  IF changes ? 'color' THEN
    IF jsonb_typeof(changes->'color') <> 'string'
      OR (
        btrim(changes->>'color') NOT IN (
          'blue', 'red', 'green', 'orange', 'purple', 'pink', 'teal',
          'yellow', 'indigo', 'cyan', 'slate', 'emerald'
        )
        AND btrim(changes->>'color') !~ '^#[0-9A-Fa-f]{3,8}$'
      ) THEN
      RETURN jsonb_build_object(
        'type', 'invalid',
        'field', 'color',
        'message', 'Color is invalid'
      );
    END IF;
    changes := jsonb_set(
      changes,
      '{color}',
      to_jsonb(btrim(changes->>'color')),
      TRUE
    );
  END IF;

  IF changes ? 'status' THEN
    IF jsonb_typeof(changes->'status') <> 'string'
      OR btrim(changes->>'status') NOT IN ('active', 'archived') THEN
      RETURN jsonb_build_object(
        'type', 'invalid',
        'field', 'status',
        'message', 'Status is invalid'
      );
    END IF;
    changes := jsonb_set(
      changes,
      '{status}',
      to_jsonb(btrim(changes->>'status')),
      TRUE
    );
  END IF;

  IF changes ? 'sort_order' THEN
    IF jsonb_typeof(changes->'sort_order') <> 'number'
      OR (changes->>'sort_order')::DOUBLE PRECISION < 0
      OR (changes->>'sort_order')::DOUBLE PRECISION = 'NaN'::DOUBLE PRECISION
      OR abs((changes->>'sort_order')::DOUBLE PRECISION)
        = 'Infinity'::DOUBLE PRECISION THEN
      RETURN jsonb_build_object(
        'type', 'invalid',
        'field', 'sortOrder',
        'message', 'Sort order must be a non-negative finite number'
      );
    END IF;
  END IF;

  -- Locking the owner-scoped row above makes this comparison and the update
  -- one serialized decision. Status changes therefore have typed, retry-safe
  -- archive/restore outcomes instead of toggle semantics.
  IF changes ? 'name'
    AND current_project.name IS DISTINCT FROM changes->>'name' THEN
    has_effective_change := TRUE;
  END IF;
  IF changes ? 'section'
    AND current_project.section IS DISTINCT FROM changes->>'section' THEN
    has_effective_change := TRUE;
  END IF;
  IF changes ? 'color'
    AND current_project.color IS DISTINCT FROM changes->>'color' THEN
    has_effective_change := TRUE;
  END IF;
  IF changes ? 'status'
    AND current_project.status IS DISTINCT FROM changes->>'status' THEN
    has_effective_change := TRUE;
  END IF;
  IF changes ? 'sort_order'
    AND current_project.sort_order IS DISTINCT FROM
      (changes->>'sort_order')::DOUBLE PRECISION THEN
    has_effective_change := TRUE;
  END IF;

  IF NOT has_effective_change THEN
    RETURN jsonb_build_object(
      'type', 'already-applied',
      'project', to_jsonb(current_project)
    );
  END IF;

  UPDATE public.projects
  SET name = CASE
      WHEN changes ? 'name' THEN changes->>'name'
      ELSE name
    END,
    section = CASE
      WHEN changes ? 'section' THEN changes->>'section'
      ELSE section
    END,
    color = CASE
      WHEN changes ? 'color' THEN changes->>'color'
      ELSE color
    END,
    status = CASE
      WHEN changes ? 'status' THEN changes->>'status'
      ELSE status
    END,
    sort_order = CASE
      WHEN changes ? 'sort_order' THEN (changes->>'sort_order')::DOUBLE PRECISION
      ELSE sort_order
    END
  WHERE id = p_project_id
    AND user_id = p_user_id
  RETURNING * INTO updated_project;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  RETURN jsonb_build_object(
    'type', 'updated',
    'project', to_jsonb(updated_project)
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('type', 'conflict');
END;
$$;

REVOKE ALL ON FUNCTION public.update_project_atomically(UUID, UUID, JSONB)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_project_atomically(UUID, UUID, JSONB)
TO authenticated, service_role;

GRANT SELECT, UPDATE ON TABLE public.projects TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.projects TO service_role;
