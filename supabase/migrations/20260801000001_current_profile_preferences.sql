-- Establish the private storage foundation for Current Profile and domain-owned
-- Preferences. JSON remains an adapter detail; the canonical browser contracts
-- are composed by the application layer.

-- -----------------------------------------------------------------------------
-- Preflight: stop before changing data when a supported value is ambiguous.
-- -----------------------------------------------------------------------------
do $$
declare
  unknown_profile_count integer;
  one_sided_quiet_window_count integer;
begin
  if exists (
    select 1
    from public.profiles
    where preferences is null
      or jsonb_typeof(preferences) <> 'object'
  ) then
    raise exception
      'Current Profile migration blocked: preferences must be a non-null JSON object';
  end if;

  if exists (
    select 1
    from public.profiles
    where preferences ? 'theme'
      and (
        jsonb_typeof(preferences->'theme') <> 'string'
        or preferences->>'theme' not in ('system', 'light', 'dark')
      )
  ) then
    raise exception
      'Current Profile migration blocked: malformed Theme Preference';
  end if;

  if exists (
    select 1
    from public.profiles
    where preferences ? 'week_start_day'
      and (
        jsonb_typeof(preferences->'week_start_day') <> 'number'
        or preferences->>'week_start_day' not in ('0', '1')
      )
  ) then
    raise exception
      'Current Profile migration blocked: unsupported Week Start Preference';
  end if;

  if exists (
    select 1
    from public.profiles
    where preferences ? 'weight_unit'
      and (
        jsonb_typeof(preferences->'weight_unit') <> 'string'
        or preferences->>'weight_unit' not in ('kg', 'lbs')
      )
  ) then
    raise exception
      'Current Profile migration blocked: malformed Weight Unit Preference';
  end if;

  if exists (
    select 1
    from public.profiles
    where preferences ? 'email_notifications_enabled'
      and jsonb_typeof(preferences->'email_notifications_enabled') <> 'boolean'
  ) then
    raise exception
      'Current Profile migration blocked: malformed Reminder Email Preference';
  end if;

  select count(*)
  into one_sided_quiet_window_count
  from public.profiles
  where (preferences ? 'quiet_hours_start')
      <> (preferences ? 'quiet_hours_end')
     or (
       preferences ? 'quiet_hours_start'
       and preferences ? 'quiet_hours_end'
       and (
         (jsonb_typeof(preferences->'quiet_hours_start') = 'null')
           <> (jsonb_typeof(preferences->'quiet_hours_end') = 'null')
       )
     );

  raise notice
    'Current Profile migration found % one-sided Push Quiet Window records',
    one_sided_quiet_window_count;

  -- A complete, non-null pair must be a valid local-wall-clock interval.
  if exists (
    select 1
    from public.profiles
    where preferences ? 'quiet_hours_start'
      and preferences ? 'quiet_hours_end'
      and jsonb_typeof(preferences->'quiet_hours_start') <> 'null'
      and jsonb_typeof(preferences->'quiet_hours_end') <> 'null'
      and (
        jsonb_typeof(preferences->'quiet_hours_start') <> 'string'
        or jsonb_typeof(preferences->'quiet_hours_end') <> 'string'
        or preferences->>'quiet_hours_start' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or preferences->>'quiet_hours_end' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or preferences->>'quiet_hours_start' = preferences->>'quiet_hours_end'
      )
  ) then
    raise exception
      'Current Profile migration blocked: malformed Push Quiet Window';
  end if;

  select count(*)
  into unknown_profile_count
  from public.profiles
  where exists (
    select 1
    from jsonb_object_keys(preferences) as key(name)
    where key.name not in (
      'date_format',
      'week_start_day',
      'theme',
      'weight_unit',
      'quiet_hours_start',
      'quiet_hours_end',
      'email_notifications_enabled'
    )
  );

  raise notice
    'Current Profile migration preserving unknown Preference keys in % profiles',
    unknown_profile_count;
end
$$;

-- Repair only one-sided windows. A complete window is never rewritten here.
update public.profiles
set preferences = preferences || jsonb_build_object(
  'quiet_hours_start', null,
  'quiet_hours_end', null
)
where (preferences ? 'quiet_hours_start')
    <> (preferences ? 'quiet_hours_end')
   or (
     preferences ? 'quiet_hours_start'
     and preferences ? 'quiet_hours_end'
     and (
       (jsonb_typeof(preferences->'quiet_hours_start') = 'null')
         <> (jsonb_typeof(preferences->'quiet_hours_end') = 'null')
     )
   );

-- Add stable assigned defaults without deleting dormant or unknown storage.
update public.profiles
set preferences = jsonb_build_object(
  'theme', coalesce(preferences->'theme', '"system"'::jsonb),
  'week_start_day', coalesce(preferences->'week_start_day', '1'::jsonb),
  'weight_unit', coalesce(preferences->'weight_unit', '"kg"'::jsonb),
  'email_notifications_enabled', coalesce(
    preferences->'email_notifications_enabled',
    to_jsonb(coalesce(email_notifications_enabled, false))
  ),
  'quiet_hours_start', coalesce(preferences->'quiet_hours_start', 'null'::jsonb),
  'quiet_hours_end', coalesce(preferences->'quiet_hours_end', 'null'::jsonb)
) || preferences;

alter table public.profiles
  alter column preferences set not null,
  alter column preferences set default '{
    "date_format": "MM/DD/YYYY",
    "week_start_day": 1,
    "theme": "system",
    "weight_unit": "kg",
    "email_notifications_enabled": false,
    "quiet_hours_start": null,
    "quiet_hours_end": null
  }'::jsonb;

alter table public.profiles
  add column if not exists preference_revision bigint not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_preferences_object_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_preferences_object_check
      check (jsonb_typeof(preferences) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_supported_preferences_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_supported_preferences_check
      check (
        (preferences ? 'theme' and (
          jsonb_typeof(preferences->'theme') = 'string'
          and preferences->>'theme' in ('system', 'light', 'dark')
        ))
        and (preferences ? 'week_start_day' and (
          jsonb_typeof(preferences->'week_start_day') = 'number'
          and preferences->>'week_start_day' in ('0', '1')
        ))
        and (preferences ? 'weight_unit' and (
          jsonb_typeof(preferences->'weight_unit') = 'string'
          and preferences->>'weight_unit' in ('kg', 'lbs')
        ))
        and (preferences ? 'email_notifications_enabled' and
           jsonb_typeof(preferences->'email_notifications_enabled') = 'boolean')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_push_quiet_window_pair_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_push_quiet_window_pair_check
      check (
        (
          preferences ? 'quiet_hours_start'
          and preferences ? 'quiet_hours_end'
          and preferences->'quiet_hours_start' = 'null'::jsonb
          and preferences->'quiet_hours_end' = 'null'::jsonb
        )
        or (
          preferences ? 'quiet_hours_start'
          and preferences ? 'quiet_hours_end'
          and jsonb_typeof(preferences->'quiet_hours_start') = 'string'
          and jsonb_typeof(preferences->'quiet_hours_end') = 'string'
          and preferences->>'quiet_hours_start' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          and preferences->>'quiet_hours_end' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          and preferences->>'quiet_hours_start' <> preferences->>'quiet_hours_end'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_preference_revision_nonnegative_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_preference_revision_nonnegative_check
      check (preference_revision >= 0);
  end if;
end
$$;

-- The private role already owns the legacy preference wrapper. Extend its
-- column privileges for the new domain commands.
grant select, update (full_name, avatar_url, timezone, preferences, preference_revision)
  on table public.profiles to betterr_profile_preferences;
grant usage on schema auth to betterr_profile_preferences;
grant select (email_confirmed_at)
  on table auth.users to betterr_profile_preferences;
-- PostgreSQL requires the target function owner to retain CREATE on the
-- containing schema when ownership is transferred. Revoke it again after the
-- functions are installed below.
grant usage, create on schema public to betterr_profile_preferences;

-- -----------------------------------------------------------------------------
-- Private revisioned preference merge and owner-specific command functions.
-- -----------------------------------------------------------------------------

create or replace function public.merge_profile_preference_intent(
  preference_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid;
  current_preferences jsonb;
  merged_preferences jsonb;
  current_revision bigint;
  next_revision bigint;
  changed boolean;
begin
  caller_id := coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
  );

  if caller_id is null then
    raise exception using errcode = '28000', message = 'Authenticated subject required';
  end if;

  if preference_patch is null
    or jsonb_typeof(preference_patch) <> 'object'
    or preference_patch = '{}'::jsonb
    or preference_patch - array[
      'theme',
      'week_start_day',
      'weight_unit',
      'email_notifications_enabled',
      'quiet_hours_start',
      'quiet_hours_end'
    ] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'Invalid preference intent';
  end if;

  if (preference_patch ? 'quiet_hours_start')
      <> (preference_patch ? 'quiet_hours_end') then
    raise exception using errcode = '22023', message = 'Invalid Push Quiet Window';
  end if;

  select preferences, preference_revision
  into current_preferences, current_revision
  from public.profiles
  where id = caller_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  merged_preferences := current_preferences || preference_patch;
  changed := merged_preferences is distinct from current_preferences;
  next_revision := case when changed then current_revision + 1 else current_revision end;

  if changed then
    update public.profiles
    set preferences = merged_preferences,
        preference_revision = next_revision
    where id = caller_id;
  end if;

  return jsonb_build_object(
    'preference_revision', next_revision,
    'changed', changed
  );
end;
$$;

alter function public.merge_profile_preference_intent(jsonb)
  owner to betterr_profile_preferences;
revoke execute on function public.merge_profile_preference_intent(jsonb)
  from public, anon, authenticated;
grant execute on function public.merge_profile_preference_intent(jsonb)
  to betterr_profile_preferences;

create or replace function public.set_appearance_preference(theme text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  outcome jsonb;
begin
  if theme not in ('system', 'light', 'dark') then
    raise exception using errcode = '22023', message = 'Invalid Theme Preference';
  end if;
  outcome := public.merge_profile_preference_intent(
    jsonb_build_object('theme', theme)
  );
  return jsonb_build_object('theme', theme)
    || jsonb_build_object(
      'preferenceRevision', outcome->'preference_revision',
      'changed', outcome->'changed'
    );
end;
$$;

create or replace function public.set_localization_preference(week_start text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  outcome jsonb;
  stored_week_start integer;
begin
  if week_start not in ('sunday', 'monday') then
    raise exception using errcode = '22023', message = 'Invalid Week Start Preference';
  end if;
  stored_week_start := case when week_start = 'sunday' then 0 else 1 end;
  outcome := public.merge_profile_preference_intent(
    jsonb_build_object('week_start_day', stored_week_start)
  );
  return jsonb_build_object('weekStart', week_start)
    || jsonb_build_object(
      'preferenceRevision', outcome->'preference_revision',
      'changed', outcome->'changed'
    );
end;
$$;

create or replace function public.set_fitness_preference(weight_unit text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  outcome jsonb;
begin
  if weight_unit not in ('kg', 'lbs') then
    raise exception using errcode = '22023', message = 'Invalid Weight Unit Preference';
  end if;
  outcome := public.merge_profile_preference_intent(
    jsonb_build_object('weight_unit', weight_unit)
  );
  return jsonb_build_object('weightUnit', weight_unit)
    || jsonb_build_object(
      'preferenceRevision', outcome->'preference_revision',
      'changed', outcome->'changed'
    );
end;
$$;

create or replace function public.set_notification_preference(intent jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid;
  intent_type text;
  value jsonb;
  enabled boolean;
  email_confirmed_at timestamptz;
  start_local text;
  end_local text;
  current_timezone text;
  outcome jsonb;
begin
  if intent is null or jsonb_typeof(intent) <> 'object' then
    raise exception using errcode = '22023', message = 'Invalid Notification Preference';
  end if;

  intent_type := intent->>'type';
  caller_id := coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
  );
  if caller_id is null then
    raise exception using errcode = '28000', message = 'Authenticated subject required';
  end if;

  if intent_type = 'setReminderEmail' then
    if jsonb_typeof(intent->'enabled') <> 'boolean' then
      raise exception using errcode = '22023', message = 'Invalid Reminder Email Preference';
    end if;
    enabled := (intent->>'enabled')::boolean;
    if enabled then
      select users.email_confirmed_at
      into email_confirmed_at
      from auth.users as users
      where users.id = caller_id;
      if email_confirmed_at is null then
        raise exception using
          errcode = 'P0001',
          message = 'identity_email_unavailable';
      end if;
    end if;
    outcome := public.merge_profile_preference_intent(
      jsonb_build_object('email_notifications_enabled', enabled)
    );
    return jsonb_build_object(
      'reminderEmail', jsonb_build_object('enabled', enabled),
      'preferenceRevision', outcome->'preference_revision',
      'changed', outcome->'changed'
    );
  end if;

  if intent_type <> 'setPushQuietWindow' then
    raise exception using errcode = '22023', message = 'Invalid Notification Preference';
  end if;

  value := intent->'value';
  if value is null or jsonb_typeof(value) <> 'object' then
    raise exception using errcode = '22023', message = 'Invalid Push Quiet Window';
  end if;

  if value->>'status' = 'disabled' then
    if value - 'status' <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'Invalid Push Quiet Window';
    end if;
    outcome := public.merge_profile_preference_intent(jsonb_build_object(
      'quiet_hours_start', null,
      'quiet_hours_end', null
    ));
    return jsonb_build_object(
      'pushQuietWindow', jsonb_build_object('status', 'disabled'),
      'preferenceRevision', outcome->'preference_revision',
      'changed', outcome->'changed'
    );
  end if;

  if value->>'status' <> 'enabled'
    or value - array['status', 'startLocal', 'endLocal'] <> '{}'::jsonb
    or jsonb_typeof(value->'startLocal') <> 'string'
    or jsonb_typeof(value->'endLocal') <> 'string' then
    raise exception using errcode = '22023', message = 'Invalid Push Quiet Window';
  end if;

  start_local := value->>'startLocal';
  end_local := value->>'endLocal';
  if start_local !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or end_local !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or start_local = end_local then
    raise exception using errcode = '22023', message = 'Invalid Push Quiet Window';
  end if;

  select timezone
  into current_timezone
  from public.profiles
  where id = caller_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  if current_timezone is null
    or not exists (
      select 1 from pg_timezone_names where name = current_timezone
    ) then
    raise exception using
      errcode = 'P0001',
      message = 'user_time_zone_unresolved';
  end if;

  outcome := public.merge_profile_preference_intent(jsonb_build_object(
    'quiet_hours_start', start_local,
    'quiet_hours_end', end_local
  ));
  return jsonb_build_object(
    'pushQuietWindow', jsonb_build_object(
      'status', 'enabled',
      'startLocal', start_local,
      'endLocal', end_local
    ),
    'preferenceRevision', outcome->'preference_revision',
    'changed', outcome->'changed'
  );
end;
$$;

create or replace function public.update_profile_details(details_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid;
  current_full_name text;
  current_avatar_url text;
  next_full_name text;
  next_avatar_url text;
  changed boolean;
begin
  caller_id := coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
  );
  if caller_id is null then
    raise exception using errcode = '28000', message = 'Authenticated subject required';
  end if;
  if details_patch is null
    or jsonb_typeof(details_patch) <> 'object'
    or details_patch = '{}'::jsonb
    or details_patch - array['full_name', 'avatar_url'] <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'Invalid Profile Details command';
  end if;
  if details_patch ? 'full_name'
    and jsonb_typeof(details_patch->'full_name') not in ('null', 'string') then
    raise exception using errcode = '22023', message = 'Invalid Profile Details command';
  end if;
  if details_patch ? 'avatar_url'
    and jsonb_typeof(details_patch->'avatar_url') not in ('null', 'string') then
    raise exception using errcode = '22023', message = 'Invalid Profile Details command';
  end if;

  select full_name, avatar_url
  into current_full_name, current_avatar_url
  from public.profiles
  where id = caller_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  next_full_name := case
    when details_patch ? 'full_name' then details_patch->>'full_name'
    else current_full_name
  end;
  next_avatar_url := case
    when details_patch ? 'avatar_url' then details_patch->>'avatar_url'
    else current_avatar_url
  end;
  changed := next_full_name is distinct from current_full_name
    or next_avatar_url is distinct from current_avatar_url;

  if changed then
    update public.profiles
    set full_name = next_full_name,
        avatar_url = next_avatar_url
    where id = caller_id;
  end if;

  return jsonb_build_object(
    'fullName', next_full_name,
    'avatarUrl', next_avatar_url,
    'changed', changed
  );
end;
$$;

create or replace function public.set_user_time_zone(time_zone text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid;
  current_timezone text;
  changed boolean;
begin
  caller_id := coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
  );
  if caller_id is null then
    raise exception using errcode = '28000', message = 'Authenticated subject required';
  end if;
  if time_zone is not null
    and not exists (select 1 from pg_timezone_names where name = time_zone) then
    raise exception using errcode = '22023', message = 'Invalid User Time Zone';
  end if;

  select timezone into current_timezone
  from public.profiles
  where id = caller_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  changed := current_timezone is distinct from time_zone;
  if changed then
    update public.profiles
    set timezone = time_zone
    where id = caller_id;
  end if;

  return jsonb_build_object('timeZone', time_zone, 'changed', changed);
end;
$$;

alter function public.set_appearance_preference(text)
  owner to betterr_profile_preferences;
alter function public.set_localization_preference(text)
  owner to betterr_profile_preferences;
alter function public.set_fitness_preference(text)
  owner to betterr_profile_preferences;
alter function public.set_notification_preference(jsonb)
  owner to betterr_profile_preferences;
alter function public.update_profile_details(jsonb)
  owner to betterr_profile_preferences;
alter function public.set_user_time_zone(text)
  owner to betterr_profile_preferences;

revoke execute on function public.set_appearance_preference(text)
  from public, anon;
revoke execute on function public.set_localization_preference(text)
  from public, anon;
revoke execute on function public.set_fitness_preference(text)
  from public, anon;
revoke execute on function public.set_notification_preference(jsonb)
  from public, anon;
revoke execute on function public.update_profile_details(jsonb)
  from public, anon;
revoke execute on function public.set_user_time_zone(text)
  from public, anon;

grant execute on function public.set_appearance_preference(text)
  to authenticated;
grant execute on function public.set_localization_preference(text)
  to authenticated;
grant execute on function public.set_fitness_preference(text)
  to authenticated;
grant execute on function public.set_notification_preference(jsonb)
  to authenticated;
grant execute on function public.update_profile_details(jsonb)
  to authenticated;
grant execute on function public.set_user_time_zone(text)
  to authenticated;

revoke create on schema public from betterr_profile_preferences;

-- -----------------------------------------------------------------------------
-- Legacy compatibility: preserve the row-shaped response while making every
-- accepted legacy write revisioned and atomic.
-- -----------------------------------------------------------------------------

create or replace function public.update_profile_preferences(
  profile_id uuid,
  preference_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  request_subject uuid;
  current_preferences jsonb;
  merged_preferences jsonb;
  current_revision bigint;
  next_revision bigint;
  updated_profile public.profiles;
begin
  request_subject := coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
  );
  if coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role'
  ) is distinct from 'service_role'
  and request_subject is distinct from profile_id then
    raise exception 'Cannot update preferences for another user';
  end if;

  if preference_patch is null
    or jsonb_typeof(preference_patch) <> 'object'
    or preference_patch = '{}'::jsonb then
    raise exception using errcode = '22023', message = 'Preference patch must be a non-empty object';
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
    raise exception using errcode = '22023', message = 'Preference patch contains unsupported keys';
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
      or preference_patch->>'week_start_day' not in ('0', '1')
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
  if preference_patch ? 'email_notifications_enabled'
    and jsonb_typeof(preference_patch->'email_notifications_enabled') <> 'boolean' then
    raise exception using errcode = '22023', message = 'Invalid email_notifications_enabled';
  end if;
  if preference_patch ? 'quiet_hours_start'
    and jsonb_typeof(preference_patch->'quiet_hours_start') not in ('null', 'string') then
    raise exception using errcode = '22023', message = 'Invalid quiet_hours_start';
  end if;
  if preference_patch ? 'quiet_hours_end'
    and jsonb_typeof(preference_patch->'quiet_hours_end') not in ('null', 'string') then
    raise exception using errcode = '22023', message = 'Invalid quiet_hours_end';
  end if;
  if preference_patch ? 'quiet_hours_start'
    and jsonb_typeof(preference_patch->'quiet_hours_start') = 'string'
    and preference_patch->>'quiet_hours_start' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception using errcode = '22023', message = 'Invalid quiet_hours_start';
  end if;
  if preference_patch ? 'quiet_hours_end'
    and jsonb_typeof(preference_patch->'quiet_hours_end') = 'string'
    and preference_patch->>'quiet_hours_end' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception using errcode = '22023', message = 'Invalid quiet_hours_end';
  end if;

  select preferences, preference_revision
  into current_preferences, current_revision
  from public.profiles
  where id = profile_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = format('Profile not found for user %s', profile_id);
  end if;

  merged_preferences := coalesce(current_preferences, '{}'::jsonb) || preference_patch;
  next_revision := case
    when merged_preferences is distinct from current_preferences
      then current_revision + 1
    else current_revision
  end;

  update public.profiles
  set preferences = merged_preferences,
      preference_revision = next_revision
  where id = profile_id
  returning * into updated_profile;

  return to_jsonb(updated_profile);
end;
$$;

alter function public.update_profile_preferences(uuid, jsonb)
  owner to betterr_profile_preferences;
revoke execute on function public.update_profile_preferences(uuid, jsonb)
  from public, anon;
grant execute on function public.update_profile_preferences(uuid, jsonb)
  to authenticated, service_role;
