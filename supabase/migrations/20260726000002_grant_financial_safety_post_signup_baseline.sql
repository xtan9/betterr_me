-- Financial Safety clean-local post-sign-up baseline. Existing RLS policies
-- remain the authorization boundary; this migration changes table ACLs only.
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.tasks TO authenticated;
GRANT SELECT ON TABLE public.habits TO authenticated;
GRANT SELECT ON TABLE public.habit_logs TO authenticated;
GRANT SELECT ON TABLE public.household_members TO authenticated;
GRANT INSERT ON TABLE public.households TO authenticated;
GRANT INSERT ON TABLE public.household_members TO authenticated;
