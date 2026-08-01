-- Delete a Habit and its source-owned lifecycle data through one
-- owner-scoped transaction boundary.
--
-- Habit logs, milestones, and graduation history already cascade from the
-- Habit. Reminder Configuration is source-owned by a Habit when its
-- source_type is 'habit', so those rows are deleted with the Habit. The
-- per-user reminder_defaults row is a reusable preference and is preserved.

-- Remove legacy source links before enforcing the tenant-scoped relationship.
DELETE FROM public.reminders AS reminder
WHERE reminder.source_type = 'habit'
  AND NOT EXISTS (
    SELECT 1
    FROM public.habits AS habit
    WHERE habit.id = reminder.source_id
      AND habit.user_id = reminder.user_id
  );

-- The redundant unique key is the target required by PostgreSQL for the
-- composite source-owner foreign key below.
ALTER TABLE public.habits
  ADD CONSTRAINT habits_id_user_id_key UNIQUE (id, user_id);

-- Project the polymorphic Habit source into a nullable FK column. Reminder
-- rows for other source types produce NULL and are outside this relationship.
-- The composite key prevents a Habit delete and a same-source reminder insert
-- from committing an orphaned Reminder Configuration concurrently.
ALTER TABLE public.reminders
  ADD COLUMN habit_source_id UUID
  GENERATED ALWAYS AS (
    CASE
      WHEN source_type = 'habit' THEN source_id
      ELSE NULL::UUID
    END
  ) STORED;

ALTER TABLE public.reminders
  ADD CONSTRAINT reminders_habit_owner_fkey
  FOREIGN KEY (habit_source_id, user_id)
  REFERENCES public.habits (id, user_id)
  ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.delete_habit_atomically(
  p_habit_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_deleted_habit_id UUID;
BEGIN
  -- Missing, cross-owner, and unauthorised requests intentionally share one
  -- result and return before any destructive statement is reached.
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  PERFORM 1
  FROM public.habits
  WHERE id = p_habit_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('type', 'not-found');
  END IF;

  -- Keep the source-owned cleanup explicit even though the FK also cascades;
  -- this makes the lifecycle rule visible at the command boundary and leaves
  -- reusable reminder defaults untouched.
  DELETE FROM public.reminders
  WHERE user_id = p_user_id
    AND source_type = 'habit'
    AND source_id = p_habit_id;

  DELETE FROM public.habits
  WHERE id = p_habit_id
    AND user_id = p_user_id
  RETURNING id INTO v_deleted_habit_id;

  IF v_deleted_habit_id IS NULL THEN
    RAISE EXCEPTION 'Habit disappeared during lifecycle delete';
  END IF;

  RETURN jsonb_build_object('type', 'deleted');
END;
$$;

-- SECURITY INVOKER keeps the existing owner policies authoritative. The
-- adapter exposes this function as the only Habit deletion persistence seam.
GRANT SELECT, DELETE ON public.habits TO authenticated;
GRANT DELETE ON public.reminders TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_habit_atomically(UUID, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_habit_atomically(UUID, UUID)
  TO authenticated;
