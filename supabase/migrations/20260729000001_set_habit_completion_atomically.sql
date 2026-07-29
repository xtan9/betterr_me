-- Serialize a habit's completion log and denormalized streak update.
-- Row locking makes concurrent desired-state requests apply in arrival order,
-- while the function transaction rolls every critical write back on failure.

CREATE OR REPLACE FUNCTION set_habit_completion_atomically(
  p_habit_id UUID,
  p_user_id UUID,
  p_logged_date DATE,
  p_completed BOOLEAN,
  p_today DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_habit habits%ROWTYPE;
  v_log habit_logs%ROWTYPE;
  v_frequency_type TEXT;
  v_target_per_week INTEGER;
  v_current_streak INTEGER := 0;
  v_best_streak INTEGER;
  v_check_date DATE;
  v_week_start DATE;
  v_completions INTEGER;
  v_offset INTEGER;
  v_scheduled BOOLEAN;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Habit not found';
  END IF;

  SELECT *
  INTO v_habit
  FROM habits
  WHERE id = p_habit_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Habit not found';
  END IF;

  INSERT INTO habit_logs (habit_id, user_id, logged_date, completed)
  VALUES (p_habit_id, p_user_id, p_logged_date, p_completed)
  ON CONFLICT (habit_id, logged_date)
  DO UPDATE SET completed = EXCLUDED.completed
  RETURNING * INTO v_log;

  v_frequency_type := v_habit.frequency->>'type';

  IF v_frequency_type IN ('weekly', 'times_per_week') THEN
    v_target_per_week := CASE
      WHEN v_frequency_type = 'weekly' THEN 1
      ELSE (v_habit.frequency->>'count')::INTEGER
    END;
    v_week_start := p_today - EXTRACT(DOW FROM p_today)::INTEGER;

    SELECT count(*)
    INTO v_completions
    FROM habit_logs
    WHERE habit_id = p_habit_id
      AND user_id = p_user_id
      AND completed
      AND logged_date BETWEEN v_week_start AND p_today;

    IF v_completions >= v_target_per_week THEN
      v_current_streak := 1;
    ELSIF EXTRACT(DOW FROM p_today)::INTEGER = 6 THEN
      v_current_streak := 0;
      v_best_streak := v_habit.best_streak;
    END IF;

    IF v_completions >= v_target_per_week
       OR EXTRACT(DOW FROM p_today)::INTEGER <> 6 THEN
      FOR v_offset IN 1..53 LOOP
        SELECT count(*)
        INTO v_completions
        FROM habit_logs
        WHERE habit_id = p_habit_id
          AND user_id = p_user_id
          AND completed
          AND logged_date BETWEEN
            v_week_start - (v_offset * 7)
            AND v_week_start - (v_offset * 7) + 6;

        EXIT WHEN v_completions < v_target_per_week;
        v_current_streak := v_current_streak + 1;
        EXIT WHEN v_current_streak > 52;
      END LOOP;
    END IF;
  ELSE
    FOR v_offset IN 0..365 LOOP
      v_check_date := p_today - v_offset;
      v_scheduled := CASE v_frequency_type
        WHEN 'daily' THEN TRUE
        WHEN 'weekdays' THEN EXTRACT(DOW FROM v_check_date)::INTEGER BETWEEN 1 AND 5
        WHEN 'custom' THEN EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(v_habit.frequency->'days') AS day_number
          WHERE day_number::INTEGER = EXTRACT(DOW FROM v_check_date)::INTEGER
        )
        ELSE FALSE
      END;

      IF v_scheduled THEN
        IF EXISTS (
          SELECT 1
          FROM habit_logs
          WHERE habit_id = p_habit_id
            AND user_id = p_user_id
            AND logged_date = v_check_date
            AND completed
        ) THEN
          v_current_streak := v_current_streak + 1;
        ELSIF v_check_date <> p_today THEN
          EXIT;
        END IF;
      END IF;
    END LOOP;
  END IF;

  v_best_streak := GREATEST(
    v_current_streak,
    COALESCE(v_best_streak, v_habit.best_streak)
  );

  UPDATE habits
  SET current_streak = v_current_streak,
      best_streak = v_best_streak
  WHERE id = p_habit_id
    AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'log', to_jsonb(v_log),
    'completed', p_completed,
    'current_streak', v_current_streak,
    'best_streak', v_best_streak
  );
END;
$$;
