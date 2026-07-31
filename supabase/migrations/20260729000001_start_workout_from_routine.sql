-- Create a complete workout session from an already validated routine
-- conversion plan. A PostgreSQL function call is one transaction, so any
-- exercise or set failure rolls back the workout and every child insert.

CREATE OR REPLACE FUNCTION public.start_workout_from_routine(
  p_user_id UUID,
  p_workout JSONB,
  p_exercises JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  created_workout public.workouts;
  created_workout_exercise public.workout_exercises;
  requested_exercise JSONB;
  requested_set JSONB;
  complete_exercises JSONB := '[]'::JSONB;
  complete_workout JSONB;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Cannot start a workout for another user';
  END IF;

  INSERT INTO public.workouts (
    user_id,
    title,
    status,
    started_at,
    routine_id
  )
  VALUES (
    p_user_id,
    p_workout->>'title',
    'in_progress',
    NOW(),
    (p_workout->>'routine_id')::UUID
  )
  RETURNING * INTO created_workout;

  FOR requested_exercise IN
    SELECT value FROM jsonb_array_elements(p_exercises)
  LOOP
    INSERT INTO public.workout_exercises (
      workout_id,
      exercise_id,
      sort_order,
      notes,
      rest_timer_seconds
    )
    VALUES (
      created_workout.id,
      (requested_exercise->'exercise'->>'exercise_id')::UUID,
      (requested_exercise->'exercise'->>'sort_order')::DOUBLE PRECISION,
      requested_exercise->'exercise'->>'notes',
      (requested_exercise->'exercise'->>'rest_timer_seconds')::INTEGER
    )
    RETURNING * INTO created_workout_exercise;

    FOR requested_set IN
      SELECT value FROM jsonb_array_elements(requested_exercise->'sets')
    LOOP
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
        created_workout_exercise.id,
        (requested_set->>'set_number')::INTEGER,
        requested_set->>'set_type',
        (requested_set->>'weight_kg')::NUMERIC,
        (requested_set->>'reps')::INTEGER,
        (requested_set->>'duration_seconds')::INTEGER,
        (requested_set->>'distance_meters')::NUMERIC,
        (requested_set->>'is_completed')::BOOLEAN,
        (requested_set->>'rpe')::SMALLINT
      );
    END LOOP;

    complete_exercises := complete_exercises || jsonb_build_array(
      to_jsonb(created_workout_exercise)
      || jsonb_build_object(
        'exercise',
        (
          SELECT to_jsonb(exercise_row)
          FROM public.exercises AS exercise_row
          WHERE exercise_row.id = created_workout_exercise.exercise_id
        ),
        'sets',
        COALESCE(
          (
            SELECT jsonb_agg(
              to_jsonb(workout_set_row)
              ORDER BY workout_set_row.set_number
            )
            FROM public.workout_sets AS workout_set_row
            WHERE workout_set_row.workout_exercise_id =
              created_workout_exercise.id
          ),
          '[]'::JSONB
        )
      )
    );
  END LOOP;

  complete_workout := to_jsonb(created_workout)
    || jsonb_build_object('exercises', complete_exercises);

  RETURN complete_workout;
END;
$$;

REVOKE ALL ON FUNCTION public.start_workout_from_routine(UUID, JSONB, JSONB)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_workout_from_routine(UUID, JSONB, JSONB)
  TO authenticated;
