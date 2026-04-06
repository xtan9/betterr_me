-- Add role column to profiles table for admin access control
ALTER TABLE profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin'));

-- Replace UPDATE policy to prevent role self-escalation
-- The profileUpdateSchema Zod validation also strips role as defense-in-depth
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Seed admin user
UPDATE profiles SET role = 'admin' WHERE email = 'steventanxd@gmail.com';
