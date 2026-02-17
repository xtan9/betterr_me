-- Fix handle_new_user trigger to handle OAuth users without email
-- and not block signup on any error.
--
-- Issues fixed:
-- 1. NEW.email is NULL for some OAuth providers (GitHub without public email,
--    Apple Sign-In with hidden email). The NOT NULL constraint on profiles.email
--    caused the insert to fail, blocking signup entirely.
-- 2. No exception handling meant ANY error (constraint violation, RLS, etc.)
--    would prevent the user from being created in auth.users.
--
-- Solution:
-- - COALESCE(NEW.email, 'no-email-' || NEW.id::text) ensures a unique,
--   non-null fallback for emailless users
-- - EXCEPTION WHEN OTHERS catches all errors, logs a warning, and allows
--   signup to proceed. The ensureProfile() application helper provides
--   defense-in-depth for profile creation.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, 'no-email-' || NEW.id::text),
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log the error but do not block signup.
  -- The ensureProfile() helper in the application layer will create
  -- the profile on the user's first API write if the trigger failed.
  RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
