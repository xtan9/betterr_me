-- Retire the approved Money and household-sharing model after the Control Plane migration.
-- deliberately forward-only: every verified relation uses RESTRICT so catalog
-- drift blocks deployment instead of deleting an unreviewed dependency.

DROP POLICY "Users can view own and household member profiles" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Retire legacy bill reminder state before tightening the retained reminder
-- contract. This is forward-only: old bill rows are Money data covered by the
-- approved deletion, and all future rows are limited to retained sources.
DELETE FROM public.reminder_defaults WHERE source_type = 'bill';
DELETE FROM public.reminders WHERE source_type = 'bill';

ALTER TABLE public.reminders DROP CONSTRAINT reminders_source_type_check;
ALTER TABLE public.reminders
  ADD CONSTRAINT reminders_source_type_check
  CHECK (source_type IN ('calendar_event', 'task', 'habit'));

ALTER TABLE public.reminder_defaults DROP CONSTRAINT reminder_defaults_source_type_check;
ALTER TABLE public.reminder_defaults
  ADD CONSTRAINT reminder_defaults_source_type_check
  CHECK (source_type IN ('calendar_event', 'task', 'habit'));

COMMENT ON TABLE public.reminders IS 'Source-agnostic reminders for calendar events, tasks, and habits';
COMMENT ON TABLE public.reminder_defaults IS 'Per-user smart default reminder settings by retained source type';

-- This retained policy references household_members. Remove it explicitly
-- before the RESTRICT drop so a future dependency still stops this migration.
DROP POLICY "Users can view their households" ON public.households;

DROP TABLE public.financial_safety_return_touches RESTRICT;
DROP TABLE public.financial_safety_funnel_events RESTRICT;
DROP TABLE public.financial_safety_checkups RESTRICT;
DROP TABLE public.goal_contributions RESTRICT;
DROP TABLE public.budget_categories RESTRICT;
DROP TABLE public.transaction_splits RESTRICT;
DROP TABLE public.hidden_categories RESTRICT;
DROP TABLE public.merchant_category_rules RESTRICT;
DROP TABLE public.dismissed_insights RESTRICT;
DROP TABLE public.confirmed_income_patterns RESTRICT;
DROP TABLE public.household_invitations RESTRICT;
DROP TABLE public.recurring_bills RESTRICT;
DROP TABLE public.savings_goals RESTRICT;
DROP TABLE public.net_worth_snapshots RESTRICT;
DROP TABLE public.manual_assets RESTRICT;
DROP TABLE public.transactions RESTRICT;
DROP TABLE public.accounts RESTRICT;
DROP TABLE public.bank_connections RESTRICT;
DROP TABLE public.transaction_categories RESTRICT;
DROP TABLE public.budgets RESTRICT;
DROP TABLE public.household_members RESTRICT;
DROP TABLE public.households RESTRICT;

REVOKE EXECUTE ON FUNCTION public.create_plaid_secret(TEXT, TEXT, TEXT) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.get_plaid_secret(TEXT) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.delete_plaid_secret(TEXT) FROM service_role;

DROP FUNCTION public.financial_safety_prevent_first_touch_mutation() RESTRICT;
DROP FUNCTION public.financial_safety_prevent_household_mutation() RESTRICT;
-- This RPC exists only in the superseded, unmerged branch; production lacks it.
DROP FUNCTION IF EXISTS public.initialize_my_household() RESTRICT;
DROP FUNCTION public.get_my_household_ids() RESTRICT;
DROP FUNCTION public.create_plaid_secret(TEXT, TEXT, TEXT) RESTRICT;
DROP FUNCTION public.get_plaid_secret(TEXT) RESTRICT;
DROP FUNCTION public.delete_plaid_secret(TEXT) RESTRICT;
