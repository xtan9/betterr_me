-- Fix infinite recursion in RLS policies.
--
-- The profiles SELECT policy joins household_members, whose own SELECT policy
-- also subqueries household_members, causing Postgres error 42P17.
-- Solution: a SECURITY DEFINER function that bypasses RLS for the lookup,
-- breaking the circular dependency.

CREATE OR REPLACE FUNCTION get_user_household_ids(uid UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id FROM household_members WHERE user_id = uid;
$$;

-- Recreate household_members SELECT policy using the function (no self-reference)
DROP POLICY IF EXISTS "Users can view household memberships" ON household_members;
CREATE POLICY "Users can view household memberships"
  ON household_members FOR SELECT
  USING (household_id IN (SELECT get_user_household_ids(auth.uid())));
