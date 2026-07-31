-- Move the email notification setting into the same atomic preference document
-- used by every other settings surface.
update public.profiles
set preferences = coalesce(preferences, '{}'::jsonb) || jsonb_build_object(
  'email_notifications_enabled',
  email_notifications_enabled
);

alter table public.profiles
  alter column preferences set default '{
    "date_format": "MM/DD/YYYY",
    "week_start_day": 1,
    "theme": "system",
    "email_notifications_enabled": false
  }'::jsonb;

create or replace function public.update_profile_preferences(
  profile_id uuid,
  preference_patch jsonb
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  updated_profile public.profiles;
begin
  if coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role'
  ) is distinct from 'service_role'
  and coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub'
    )::uuid is distinct from profile_id then
    raise exception 'Cannot update preferences for another user';
  end if;

  if preference_patch is null
    or jsonb_typeof(preference_patch) <> 'object'
    or preference_patch = '{}'::jsonb then
    raise exception using
      errcode = '22023',
      message = 'Preference patch must be a non-empty object';
  end if;

  if preference_patch - array[
    'date_format',
    'week_start_day',
    'theme',
    'weight_unit',
    'quiet_hours_start',
    'quiet_hours_end',
    'email_notifications_enabled'
  ] <> '{}'::jsonb then
    raise exception using
      errcode = '22023',
      message = 'Preference patch contains unsupported keys';
  end if;

  if preference_patch ? 'date_format'
    and (
      jsonb_typeof(preference_patch->'date_format') <> 'string'
      or length(preference_patch->>'date_format') not between 1 and 50
    ) then
    raise exception using errcode = '22023', message = 'Invalid date_format';
  end if;

  if preference_patch ? 'week_start_day'
    and (
      jsonb_typeof(preference_patch->'week_start_day') <> 'number'
      or (preference_patch->>'week_start_day')::numeric not between 0 and 6
      or trunc((preference_patch->>'week_start_day')::numeric)
        <> (preference_patch->>'week_start_day')::numeric
    ) then
    raise exception using errcode = '22023', message = 'Invalid week_start_day';
  end if;

  if preference_patch ? 'theme'
    and (
      jsonb_typeof(preference_patch->'theme') <> 'string'
      or preference_patch->>'theme' not in ('system', 'light', 'dark')
    ) then
    raise exception using errcode = '22023', message = 'Invalid theme';
  end if;

  if preference_patch ? 'weight_unit'
    and (
      jsonb_typeof(preference_patch->'weight_unit') <> 'string'
      or preference_patch->>'weight_unit' not in ('kg', 'lbs')
    ) then
    raise exception using errcode = '22023', message = 'Invalid weight_unit';
  end if;

  if preference_patch ? 'quiet_hours_start'
    and jsonb_typeof(preference_patch->'quiet_hours_start') not in ('null', 'string') then
    raise exception using errcode = '22023', message = 'Invalid quiet_hours_start';
  end if;

  if jsonb_typeof(preference_patch->'quiet_hours_start') = 'string'
    and (preference_patch->>'quiet_hours_start')
      !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception using errcode = '22023', message = 'Invalid quiet_hours_start';
  end if;

  if preference_patch ? 'quiet_hours_end'
    and jsonb_typeof(preference_patch->'quiet_hours_end') not in ('null', 'string') then
    raise exception using errcode = '22023', message = 'Invalid quiet_hours_end';
  end if;

  if jsonb_typeof(preference_patch->'quiet_hours_end') = 'string'
    and (preference_patch->>'quiet_hours_end')
      !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception using errcode = '22023', message = 'Invalid quiet_hours_end';
  end if;

  if preference_patch ? 'email_notifications_enabled'
    and jsonb_typeof(preference_patch->'email_notifications_enabled') <> 'boolean' then
    raise exception using
      errcode = '22023',
      message = 'Invalid email_notifications_enabled';
  end if;

  update public.profiles
  set preferences = coalesce(preferences, '{}'::jsonb) || preference_patch
  where id = profile_id
  returning * into updated_profile;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = format('Profile not found for user %s', profile_id);
  end if;

  return to_jsonb(updated_profile);
end;
$$;

alter function public.update_profile_preferences(uuid, jsonb)
  security definer;
alter function public.update_profile_preferences(uuid, jsonb)
  owner to betterr_profile_preferences;
revoke execute on function public.update_profile_preferences(uuid, jsonb)
  from public, anon;
grant execute on function public.update_profile_preferences(uuid, jsonb)
  to authenticated, service_role;
