-- Centralize workout completion and discard behind typed, atomic RPCs.
-- The caller supplies the trusted user identity and (for completion) the
-- domain clock's timestamp. The row lock serializes terminal transitions;
-- PostgreSQL rolls back the terminal state and all derived fields together
-- if any part of the write fails.

-- Active detail edits no longer own terminal transitions. Keep this function
-- for title/notes edits while rejecting the old status escape hatch.
CREATE OR REPLACE FUNCTION public.update_active_workout(
  p_user_id UUID,
  p_workout_id UUID,
  p_changes JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_workout public.workouts;
  updated_workout public.workouts;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Cannot edit a workout for another user';
  END IF;

  SELECT *
  INTO current_workout
  FROM public.workouts
  WHERE id = p_workout_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  IF current_workout.status <> 'in_progress' THEN
    RETURN jsonb_build_object(
      'type', 'invalid-transition',
      'current_status', current_workout.status
    );
  END IF;

  IF p_changes ? 'status' THEN
    RETURN jsonb_build_object(
      'type', 'invalid-transition',
      'current_status', current_workout.status
    );
  END IF;

  UPDATE public.workouts
  SET title = CASE
        WHEN p_changes ? 'title' THEN p_changes->>'title'
        ELSE title
      END,
      notes = CASE
        WHEN p_changes ? 'notes' THEN p_changes->>'notes'
        ELSE notes
      END
  WHERE id = current_workout.id
  RETURNING * INTO updated_workout;

  RETURN jsonb_build_object(
    'type', 'updated',
    'workout', to_jsonb(updated_workout)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_workout_atomically(
  p_user_id UUID,
  p_workout_id UUID,
  p_completed_at TIMESTAMPTZ,
  p_changes JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_workout public.workouts;
  completed_workout public.workouts;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  SELECT *
  INTO current_workout
  FROM public.workouts
  WHERE id = p_workout_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  IF current_workout.status = 'completed' THEN
    RETURN jsonb_build_object(
      'type', 'already-applied',
      'workout', to_jsonb(current_workout)
    );
  END IF;

  IF current_workout.status <> 'in_progress' THEN
    RETURN jsonb_build_object(
      'type', 'invalid-transition',
      'current_status', current_workout.status
    );
  END IF;

  UPDATE public.workouts
  SET title = CASE
        WHEN p_changes ? 'title' THEN p_changes->>'title'
        ELSE title
      END,
      notes = CASE
        WHEN p_changes ? 'notes' THEN p_changes->>'notes'
        ELSE notes
      END,
      status = 'completed',
      completed_at = p_completed_at,
      duration_seconds = GREATEST(
        0,
        FLOOR(EXTRACT(EPOCH FROM (p_completed_at - started_at)))
      )::INTEGER
  WHERE id = current_workout.id
  RETURNING * INTO completed_workout;

  RETURN jsonb_build_object(
    'type', 'transitioned',
    'workout', to_jsonb(completed_workout)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.discard_workout_atomically(
  p_user_id UUID,
  p_workout_id UUID,
  p_changes JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_workout public.workouts;
  discarded_workout public.workouts;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  SELECT *
  INTO current_workout
  FROM public.workouts
  WHERE id = p_workout_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  IF current_workout.status = 'discarded' THEN
    RETURN jsonb_build_object(
      'type', 'already-applied',
      'workout', to_jsonb(current_workout)
    );
  END IF;

  IF current_workout.status <> 'in_progress' THEN
    RETURN jsonb_build_object(
      'type', 'invalid-transition',
      'current_status', current_workout.status
    );
  END IF;

  UPDATE public.workouts
  SET title = CASE
        WHEN p_changes ? 'title' THEN p_changes->>'title'
        ELSE title
      END,
      notes = CASE
        WHEN p_changes ? 'notes' THEN p_changes->>'notes'
        ELSE notes
      END,
      status = 'discarded'
  WHERE id = current_workout.id
  RETURNING * INTO discarded_workout;

  RETURN jsonb_build_object(
    'type', 'transitioned',
    'workout', to_jsonb(discarded_workout)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_workout_atomically(UUID, UUID, TIMESTAMPTZ, JSONB)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.discard_workout_atomically(UUID, UUID, JSONB)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.complete_workout_atomically(UUID, UUID, TIMESTAMPTZ, JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.discard_workout_atomically(UUID, UUID, JSONB)
  TO authenticated;
