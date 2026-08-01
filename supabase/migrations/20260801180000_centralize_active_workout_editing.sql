-- Centralize edits to active workouts behind typed, ownership-aware RPCs.
-- Each nested mutation locks its active workout before reading or writing a
-- child row. That lock is the serialization point for exercise ordering and
-- set numbering, and it also makes the active-state check atomic with the edit.

CREATE OR REPLACE FUNCTION public.update_active_workout(
  p_user_id UUID,
  p_workout_id UUID,
  p_changes JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_workout public.workouts;
  updated_workout public.workouts;
  completed_at_value TIMESTAMPTZ;
  requested_status TEXT;
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
    requested_status := p_changes->>'status';
    IF requested_status NOT IN ('completed', 'discarded') THEN
      RETURN jsonb_build_object(
        'type', 'invalid-transition',
        'current_status', current_workout.status
      );
    END IF;
  END IF;

  IF requested_status = 'completed' THEN
    completed_at_value := NOW();
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
      status = CASE
        WHEN p_changes ? 'status' THEN requested_status
        ELSE status
      END,
      completed_at = CASE
        WHEN requested_status = 'completed' THEN completed_at_value
        ELSE completed_at
      END,
      duration_seconds = CASE
        WHEN requested_status = 'completed' THEN
          FLOOR(EXTRACT(EPOCH FROM (completed_at_value - started_at)))::INTEGER
        ELSE duration_seconds
      END
  WHERE id = current_workout.id
  RETURNING * INTO updated_workout;

  RETURN jsonb_build_object(
    'type', 'updated',
    'workout', to_jsonb(updated_workout)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.add_active_workout_exercise(
  p_user_id UUID,
  p_workout_id UUID,
  p_exercise_id UUID,
  p_rest_timer_seconds INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_workout public.workouts;
  created_exercise public.workout_exercises;
  next_sort_order DOUBLE PRECISION;
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

  -- The exercise lookup masks missing and another user's custom exercise in
  -- the same way as a missing workout, while allowing preset exercises.
  PERFORM 1
  FROM public.exercises
  WHERE id = p_exercise_id
    AND (user_id IS NULL OR user_id = p_user_id);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  SELECT COALESCE(MAX(sort_order), 0) + 65536.0
  INTO next_sort_order
  FROM public.workout_exercises
  WHERE workout_id = current_workout.id;

  INSERT INTO public.workout_exercises (
    workout_id,
    exercise_id,
    sort_order,
    rest_timer_seconds
  )
  VALUES (
    current_workout.id,
    p_exercise_id,
    next_sort_order,
    COALESCE(p_rest_timer_seconds, 90)
  )
  RETURNING * INTO created_exercise;

  RETURN jsonb_build_object(
    'type', 'added',
    'exercise', to_jsonb(created_exercise)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_active_workout_exercise(
  p_user_id UUID,
  p_workout_id UUID,
  p_workout_exercise_id UUID,
  p_changes JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_workout public.workouts;
  current_exercise public.workout_exercises;
  updated_exercise public.workout_exercises;
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

  SELECT *
  INTO current_exercise
  FROM public.workout_exercises
  WHERE id = p_workout_exercise_id
    AND workout_id = current_workout.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  UPDATE public.workout_exercises
  SET notes = CASE
        WHEN p_changes ? 'notes' THEN p_changes->>'notes'
        ELSE notes
      END,
      rest_timer_seconds = CASE
        WHEN p_changes ? 'rest_timer_seconds'
          THEN (p_changes->>'rest_timer_seconds')::INTEGER
        ELSE rest_timer_seconds
      END
  WHERE id = current_exercise.id
  RETURNING * INTO updated_exercise;

  RETURN jsonb_build_object(
    'type', 'updated',
    'exercise', to_jsonb(updated_exercise)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_active_workout_exercise(
  p_user_id UUID,
  p_workout_id UUID,
  p_workout_exercise_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_workout public.workouts;
  current_exercise public.workout_exercises;
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

  SELECT *
  INTO current_exercise
  FROM public.workout_exercises
  WHERE id = p_workout_exercise_id
    AND workout_id = current_workout.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  DELETE FROM public.workout_exercises
  WHERE id = current_exercise.id;

  RETURN jsonb_build_object('type', 'removed');
END;
$$;

CREATE OR REPLACE FUNCTION public.add_active_workout_set(
  p_user_id UUID,
  p_workout_id UUID,
  p_workout_exercise_id UUID,
  p_set JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_workout public.workouts;
  current_exercise public.workout_exercises;
  created_set public.workout_sets;
  next_set_number INTEGER;
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

  SELECT *
  INTO current_exercise
  FROM public.workout_exercises
  WHERE id = p_workout_exercise_id
    AND workout_id = current_workout.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  SELECT COALESCE(MAX(set_number), 0) + 1
  INTO next_set_number
  FROM public.workout_sets
  WHERE workout_exercise_id = current_exercise.id;

  INSERT INTO public.workout_sets (
    workout_exercise_id,
    set_number,
    set_type,
    weight_kg,
    reps,
    duration_seconds,
    distance_meters,
    is_completed,
    rpe
  )
  VALUES (
    current_exercise.id,
    next_set_number,
    COALESCE(p_set->>'set_type', 'normal'),
    (p_set->>'weight_kg')::NUMERIC,
    (p_set->>'reps')::INTEGER,
    (p_set->>'duration_seconds')::INTEGER,
    (p_set->>'distance_meters')::NUMERIC,
    COALESCE((p_set->>'is_completed')::BOOLEAN, false),
    (p_set->>'rpe')::SMALLINT
  )
  RETURNING * INTO created_set;

  RETURN jsonb_build_object(
    'type', 'added',
    'set', to_jsonb(created_set)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_active_workout_set(
  p_user_id UUID,
  p_workout_id UUID,
  p_workout_exercise_id UUID,
  p_set_id UUID,
  p_changes JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_workout public.workouts;
  current_exercise public.workout_exercises;
  current_set public.workout_sets;
  updated_set public.workout_sets;
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

  SELECT *
  INTO current_exercise
  FROM public.workout_exercises
  WHERE id = p_workout_exercise_id
    AND workout_id = current_workout.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  SELECT *
  INTO current_set
  FROM public.workout_sets
  WHERE id = p_set_id
    AND workout_exercise_id = current_exercise.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  UPDATE public.workout_sets
  SET set_type = CASE
        WHEN p_changes ? 'set_type' THEN p_changes->>'set_type'
        ELSE set_type
      END,
      weight_kg = CASE
        WHEN p_changes ? 'weight_kg' THEN (p_changes->>'weight_kg')::NUMERIC
        ELSE weight_kg
      END,
      reps = CASE
        WHEN p_changes ? 'reps' THEN (p_changes->>'reps')::INTEGER
        ELSE reps
      END,
      duration_seconds = CASE
        WHEN p_changes ? 'duration_seconds'
          THEN (p_changes->>'duration_seconds')::INTEGER
        ELSE duration_seconds
      END,
      distance_meters = CASE
        WHEN p_changes ? 'distance_meters'
          THEN (p_changes->>'distance_meters')::NUMERIC
        ELSE distance_meters
      END,
      is_completed = CASE
        WHEN p_changes ? 'is_completed'
          THEN (p_changes->>'is_completed')::BOOLEAN
        ELSE is_completed
      END,
      rpe = CASE
        WHEN p_changes ? 'rpe' THEN (p_changes->>'rpe')::SMALLINT
        ELSE rpe
      END
  WHERE id = current_set.id
  RETURNING * INTO updated_set;

  RETURN jsonb_build_object(
    'type', 'updated',
    'set', to_jsonb(updated_set)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_active_workout_set(
  p_user_id UUID,
  p_workout_id UUID,
  p_workout_exercise_id UUID,
  p_set_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_workout public.workouts;
  current_exercise public.workout_exercises;
  current_set public.workout_sets;
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

  SELECT *
  INTO current_exercise
  FROM public.workout_exercises
  WHERE id = p_workout_exercise_id
    AND workout_id = current_workout.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  SELECT *
  INTO current_set
  FROM public.workout_sets
  WHERE id = p_set_id
    AND workout_exercise_id = current_exercise.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  DELETE FROM public.workout_sets
  WHERE id = current_set.id;

  RETURN jsonb_build_object('type', 'removed');
END;
$$;

REVOKE ALL ON FUNCTION public.update_active_workout(UUID, UUID, JSONB)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_active_workout_exercise(UUID, UUID, UUID, INTEGER)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_active_workout_exercise(UUID, UUID, UUID, JSONB)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_active_workout_exercise(UUID, UUID, UUID)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_active_workout_set(UUID, UUID, UUID, JSONB)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_active_workout_set(UUID, UUID, UUID, UUID, JSONB)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_active_workout_set(UUID, UUID, UUID, UUID)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.update_active_workout(UUID, UUID, JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_active_workout_exercise(UUID, UUID, UUID, INTEGER)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_active_workout_exercise(UUID, UUID, UUID, JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_active_workout_exercise(UUID, UUID, UUID)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_active_workout_set(UUID, UUID, UUID, JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_active_workout_set(UUID, UUID, UUID, UUID, JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_active_workout_set(UUID, UUID, UUID, UUID)
  TO authenticated;

-- These RPCs remain security-invoker functions. RLS still enforces the
-- authenticated user's access to every row, while the explicit p_user_id and
-- relationship predicates keep missing and cross-owner targets masked.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.workouts,
  public.workout_exercises,
  public.workout_sets
  TO authenticated;
GRANT SELECT ON TABLE public.exercises TO authenticated;
