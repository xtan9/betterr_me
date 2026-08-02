-- Retire the verified legacy Profile contracts after #674.
--
-- This migration is intentionally separate from the storage foundation. The
-- nested Preference is checked against the duplicated column before any
-- destructive DDL runs, so an authority mismatch aborts the whole migration.

-- PostgreSQL requires the target function owner to retain CREATE on the
-- function's schema while ownership is transferred. This is revoked again at
-- the end of the migration; it is never a caller capability.
grant usage, create on schema public to betterr_profile_preferences;

do $$
declare
  authority_mismatch_count bigint;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'email_notifications_enabled'
  ) then
    raise exception
      'Profile retirement blocked: duplicated email notification column is missing';
  end if;

  select count(*)
  into authority_mismatch_count
  from public.profiles
  where not coalesce(preferences ? 'email_notifications_enabled', false)
    or jsonb_typeof(preferences->'email_notifications_enabled') <> 'boolean'
    or case
      when jsonb_typeof(preferences->'email_notifications_enabled') = 'boolean'
        then (preferences->>'email_notifications_enabled')::boolean
          is distinct from email_notifications_enabled
      else true
    end;

  if authority_mismatch_count > 0 then
    raise exception using
      errcode = '22023',
      message = format(
        'Profile retirement blocked: nested Reminder Email Preference disagrees with the legacy column for %s profile(s)',
        authority_mismatch_count
      );
  end if;
end
$$;

-- The unsubscribe job remains a narrow, service-only owner command. It returns
-- only the accepted Notification outcome and never exposes a profile envelope.
create or replace function public.disable_reminder_email_for_service(
  profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  outcome jsonb;
begin
  if profile_id is null then
    raise exception using errcode = '22023', message = 'Profile subject required';
  end if;

  outcome := public.merge_profile_preference_intent_for_subject(
    profile_id,
    jsonb_build_object('email_notifications_enabled', false)
  );

  return jsonb_build_object(
    'enabled', false,
    'preferenceRevision', outcome->'preference_revision',
    'changed', outcome->'changed'
  );
end;
$$;

alter function public.disable_reminder_email_for_service(uuid)
  owner to betterr_profile_preferences;
revoke execute on function public.disable_reminder_email_for_service(uuid)
  from public, anon, authenticated;
grant execute on function public.disable_reminder_email_for_service(uuid)
  to service_role;

-- Keep the generic merger and subject-taking implementation private to the
-- trusted owner. Browser and service callers use only named owner commands.
revoke execute on function public.merge_profile_preference_intent(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.merge_profile_preference_intent(jsonb)
  to betterr_profile_preferences;
revoke execute on function public.merge_profile_preference_intent_for_subject(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.merge_profile_preference_intent_for_subject(uuid, jsonb)
  to betterr_profile_preferences;

-- The nested Preference is authoritative and the old storage column is no
-- longer part of the persistence contract.
alter table public.profiles
  drop column email_notifications_enabled;

-- Remove both row-shaped compatibility envelopes. DROP FUNCTION also removes
-- their obsolete grants; the dedicated service command above is the only
-- surviving privileged email-disable capability.
drop function if exists public.update_profile_preferences(uuid, jsonb);
drop function if exists public.update_profile_preferences_for_service(uuid, jsonb);

revoke create on schema public from betterr_profile_preferences;
