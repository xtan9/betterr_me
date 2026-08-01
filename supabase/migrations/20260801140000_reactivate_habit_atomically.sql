-- Reactivate a habit's core lifecycle state in one locked transition.
-- Graduation history is intentionally updated by the post-commit reaction in
-- the Habit mutation module, so a history failure cannot undo this commit.

CREATE OR REPLACE FUNCTION public.reactivate_habit_atomically(
  p_habit_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_habit habits%ROWTYPE;
  v_active habits%ROWTYPE;
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

  IF v_habit.status = 'active' THEN
    RETURN jsonb_build_object(
      'type', 'already-active',
      'habit', to_jsonb(v_habit)
    );
  END IF;

  IF v_habit.status <> 'formed' THEN
    RETURN jsonb_build_object(
      'type', 'invalid-transition',
      'current_status', v_habit.status
    );
  END IF;

  UPDATE public.habits
  SET status = 'active',
      current_streak = 0,
      paused_at = NULL,
      graduated_at = NULL,
      graduated_streak = NULL,
      nudge_dismissed_at = NULL
  WHERE id = p_habit_id
    AND user_id = p_user_id
  RETURNING * INTO v_active;

  RETURN jsonb_build_object(
    'type', 'reactivated',
    'habit', to_jsonb(v_active)
  );
END;
$$;

-- SECURITY INVOKER keeps the existing owner policies authoritative. The
-- adapter exposes this function as the only reactivation core persistence seam.
GRANT SELECT, UPDATE ON public.habits TO authenticated;
GRANT SELECT, UPDATE ON public.habit_graduations TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reactivate_habit_atomically(
  UUID,
  UUID
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reactivate_habit_atomically(
  UUID,
  UUID
) TO authenticated;
