-- Atomic increment for savings goal current_cents to prevent race conditions
-- Used by SavingsGoalsDB.addContribution() after inserting a contribution row.

CREATE OR REPLACE FUNCTION increment_goal_current_cents(
  p_goal_id UUID,
  p_amount_cents BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE savings_goals
  SET current_cents = current_cents + p_amount_cents
  WHERE id = p_goal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Goal not found: %', p_goal_id;
  END IF;
END;
$$;
