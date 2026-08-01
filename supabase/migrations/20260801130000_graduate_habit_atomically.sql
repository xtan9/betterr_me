-- Graduate a habit and append its history in one database transaction.
-- Row locking makes concurrent graduation requests observe one ordered state
-- transition; any failed statement aborts the complete function transaction.

CREATE OR REPLACE FUNCTION public.graduate_habit_atomically(
  p_habit_id UUID,
  p_user_id UUID,
  p_graduated_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_habit habits%ROWTYPE;
  v_formed habits%ROWTYPE;
BEGIN
  -- Use the same not-found result for an unauthorised identity, a missing
  -- habit, and a habit owned by somebody else.
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  SELECT *
  INTO v_habit
  FROM public.habits
  WHERE id = p_habit_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  IF v_habit.status = 'formed' THEN
    RETURN jsonb_build_object(
      'type', 'already-formed',
      'habit', to_jsonb(v_habit)
    );
  END IF;

  IF v_habit.status <> 'active' THEN
    RETURN jsonb_build_object(
      'type', 'invalid-transition',
      'current_status', v_habit.status
    );
  END IF;

  UPDATE public.habits
  SET status = 'formed',
      graduated_at = p_graduated_at,
      graduated_streak = v_habit.current_streak,
      nudge_dismissed_at = NULL
  WHERE id = p_habit_id
    AND user_id = p_user_id
  RETURNING * INTO v_formed;

  INSERT INTO public.habit_graduations (
    habit_id,
    user_id,
    graduated_at,
    graduated_streak
  )
  VALUES (
    p_habit_id,
    p_user_id,
    p_graduated_at,
    v_habit.current_streak
  );

  RETURN jsonb_build_object(
    'type', 'graduated',
    'habit', to_jsonb(v_formed)
  );
END;
$$;

-- SECURITY INVOKER keeps the existing owner policies authoritative. The
-- adapter exposes this function as the only graduation persistence seam.
GRANT SELECT, UPDATE ON public.habits TO authenticated;
GRANT SELECT, INSERT ON public.habit_graduations TO authenticated;

REVOKE EXECUTE ON FUNCTION public.graduate_habit_atomically(
  UUID,
  UUID,
  TIMESTAMPTZ
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.graduate_habit_atomically(
  UUID,
  UUID,
  TIMESTAMPTZ
) TO authenticated;
