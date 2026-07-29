-- Merge validated preference intents in the database so concurrent partial
-- updates cannot replace one another with stale caller-side snapshots.
create or replace function public.update_profile_preferences(
  profile_id uuid,
  preference_patch jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  updated_profile public.profiles;
begin
  if preference_patch is null
    or jsonb_typeof(preference_patch) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'Preference patch must be a non-empty object';
  end if;

  if preference_patch = '{}'::jsonb then
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
    'quiet_hours_end'
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

revoke execute on function public.update_profile_preferences(uuid, jsonb)
  from public, anon;
grant execute on function public.update_profile_preferences(uuid, jsonb)
  to authenticated;
