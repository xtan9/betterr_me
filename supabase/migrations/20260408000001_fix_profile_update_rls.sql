-- Fix infinite recursion in profiles UPDATE policy.
-- The previous WITH CHECK subquery `SELECT role FROM profiles WHERE id = auth.uid()`
-- triggers the same RLS policy recursively, causing "infinite recursion detected".
-- Fix: use a security-definer function to read the current role without RLS.

CREATE OR REPLACE FUNCTION public.get_own_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = public.get_own_role()
  );
