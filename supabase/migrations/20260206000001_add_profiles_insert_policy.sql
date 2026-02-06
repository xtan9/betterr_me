-- Add INSERT policy for profiles table
-- The handle_new_user() trigger creates profiles via SECURITY DEFINER,
-- but the API also needs to create profiles when the trigger fails.
-- This policy allows authenticated users to insert their own profile row.

CREATE POLICY "Users can create own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
