-- Persist an already validated workout-to-routine conversion plan in one
-- transaction and return the complete nested routine.

ALTER TABLE public.routine_exercises
  ADD COLUMN target_distance_meters NUMERIC(10,2);

CREATE OR REPLACE FUNCTION public.save_workout_as_routine(
  p_user_id UUID,
  p_routine JSONB,
  p_exercises JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  created_routine public.routines;
  created_routine_exercise public.routine_exercises;
  requested_exercise JSONB;
  complete_exercises JSONB := '[]'::JSONB;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Cannot save a routine for another user';
  END IF;

  INSERT INTO public.routines (user_id, name, notes)
  VALUES (
    p_user_id,
    p_routine->>'name',
    p_routine->>'notes'
  )
  RETURNING * INTO created_routine;

  FOR requested_exercise IN
    SELECT value FROM jsonb_array_elements(p_exercises)
  LOOP
    INSERT INTO public.routine_exercises (
      routine_id,
      exercise_id,
      sort_order,
      target_sets,
      target_reps,
      target_weight_kg,
      target_duration_seconds,
      target_distance_meters,
      rest_timer_seconds,
      notes
    )
    VALUES (
      created_routine.id,
      (requested_exercise->>'exercise_id')::UUID,
      (requested_exercise->>'sort_order')::DOUBLE PRECISION,
      (requested_exercise->>'target_sets')::INTEGER,
      (requested_exercise->>'target_reps')::INTEGER,
      (requested_exercise->>'target_weight_kg')::NUMERIC,
      (requested_exercise->>'target_duration_seconds')::INTEGER,
      (requested_exercise->>'target_distance_meters')::NUMERIC,
      (requested_exercise->>'rest_timer_seconds')::INTEGER,
      requested_exercise->>'notes'
    )
    RETURNING * INTO created_routine_exercise;

    complete_exercises := complete_exercises || jsonb_build_array(
      to_jsonb(created_routine_exercise)
      || jsonb_build_object(
        'exercise',
        (
          SELECT to_jsonb(exercise_row)
          FROM public.exercises AS exercise_row
          WHERE exercise_row.id = created_routine_exercise.exercise_id
        )
      )
    );
  END LOOP;

  RETURN to_jsonb(created_routine)
    || jsonb_build_object('exercises', complete_exercises);
END;
$$;

REVOKE ALL ON FUNCTION public.save_workout_as_routine(UUID, JSONB, JSONB)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_workout_as_routine(UUID, JSONB, JSONB)
  TO authenticated;

-- The function remains a security-invoker boundary. Existing RLS policies
-- enforce ownership for every inserted and returned row.
GRANT SELECT, INSERT ON TABLE
  public.routines,
  public.routine_exercises
  TO authenticated;
GRANT SELECT ON TABLE public.exercises TO authenticated;
