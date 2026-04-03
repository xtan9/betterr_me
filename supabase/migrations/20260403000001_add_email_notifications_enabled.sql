-- Add email notification preference to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email_notifications_enabled boolean NOT NULL DEFAULT false;
