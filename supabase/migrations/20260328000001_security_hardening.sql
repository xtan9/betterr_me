-- Defense-in-depth: enable RLS on oauth_codes with no policies.
-- This blocks anon/authenticated PostgREST access while service-role
-- (which bypasses RLS) continues to work as before.

ALTER TABLE oauth_codes ENABLE ROW LEVEL SECURITY;
