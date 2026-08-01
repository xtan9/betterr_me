-- Close the Preference command boundary:
--   * owner commands use auth.uid() and never accept a target subject;
--   * the generic merger is callable only by the trusted function owner;
--   * legacy browser writes remain one validated, revisioned transaction; and
--   * service jobs use an explicitly separate, service_role-only interface.

-- PostgreSQL requires the new owner to retain CREATE while functions are
-- transferred. Remove that capability again after all definitions are owned.
grant usage, create on schema public to betterr_profile_preferences;
grant select, update (preferences, preference_revision)
  on table public.profiles to betterr_profile_preferences;

-- The private role is the only owner of the trusted wrappers. This policy
-- lets those wrappers reach the explicit subject they validate (including a
-- server-job subject) without granting any direct table capability to API
-- roles. The owner wrappers enforce auth.uid() before calling the merger.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'betterr_profile_preferences_storage_access'
  ) then
    create policy betterr_profile_preferences_storage_access
      on public.profiles
      as permissive
      for all
      to betterr_profile_preferences
      using (current_user = 'betterr_profile_preferences')
      with check (current_user = 'betterr_profile_preferences');
  end if;
end
$$;

-- The private function role cannot be granted usage on Supabase's protected
-- auth schema by ordinary application migrations. Resolve auth.uid() once in
-- this trusted, read-only bridge owned by the migration role, then expose the
-- bridge only to the Preference function owner.
create or replace function public.current_preference_subject()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid();
$$;

revoke execute on function public.current_preference_subject()
  from public, anon, authenticated, service_role;
grant execute on function public.current_preference_subject()
  to betterr_profile_preferences;

-- Supabase's auth schema is protected from the private role. Keep verified
-- Identity Email lookup behind the same migration-owned bridge rather than
-- weakening auth-schema privileges for the Preference wrappers.
create or replace function public.current_preference_identity_email_confirmed_at()
returns timestamptz
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select users.email_confirmed_at
  from auth.users as users
  where users.id = auth.uid();
$$;

revoke execute on function public.current_preference_identity_email_confirmed_at()
  from public, anon, authenticated, service_role;
grant execute on function public.current_preference_identity_email_confirmed_at()
  to betterr_profile_preferences;

-- The subject-taking merger is an implementation detail shared by the narrow
-- owner wrappers, the legacy adapter, and the separate service adapter. It is
-- never a PostgREST capability.
create or replace function public.merge_profile_preference_intent_for_subject(
  subject_id uuid,
  preference_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_preferences jsonb;
  merged_preferences jsonb;
  current_revision bigint;
  next_revision bigint;
  changed boolean;
begin
  if subject_id is null then
    raise exception using errcode = '28000', message = 'Authenticated subject required';
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
      or (preference_patch->>'week_start_day')::numeric not in (0, 1)
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

  if preference_patch ? 'email_notifications_enabled'
    and jsonb_typeof(preference_patch->'email_notifications_enabled') <> 'boolean' then
    raise exception using
      errcode = '22023',
      message = 'Invalid email_notifications_enabled';
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
    and preference_patch->>'quiet_hours_start'
      !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception using errcode = '22023', message = 'Invalid quiet_hours_start';
  end if;
  if preference_patch ? 'quiet_hours_end'
    and jsonb_typeof(preference_patch->'quiet_hours_end') = 'string'
    and preference_patch->>'quiet_hours_end'
      !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception using errcode = '22023', message = 'Invalid quiet_hours_end';
  end if;
  if (preference_patch ? 'quiet_hours_start')
      <> (preference_patch ? 'quiet_hours_end') then
    raise exception using errcode = '22023', message = 'Invalid Push Quiet Window';
  end if;
  if preference_patch ? 'quiet_hours_start'
    and preference_patch ? 'quiet_hours_end'
    and (
      (jsonb_typeof(preference_patch->'quiet_hours_start') = 'null')
        <> (jsonb_typeof(preference_patch->'quiet_hours_end') = 'null')
      or (
        jsonb_typeof(preference_patch->'quiet_hours_start') = 'string'
        and jsonb_typeof(preference_patch->'quiet_hours_end') = 'string'
        and preference_patch->>'quiet_hours_start'
          = preference_patch->>'quiet_hours_end'
      )
    ) then
    raise exception using errcode = '22023', message = 'Invalid Push Quiet Window';
  end if;

  select preferences, preference_revision
  into current_preferences, current_revision
  from public.profiles
  where id = subject_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;

  merged_preferences := coalesce(current_preferences, '{}'::jsonb) || preference_patch;
  changed := merged_preferences is distinct from current_preferences;
  next_revision := case
    when changed then current_revision + 1
    else current_revision
  end;

  -- One row update is the complete accepted write. The existing trigger
  -- independently enforces the same revision transition for any direct SQL
  -- update, while this function avoids an update entirely for a no-op.
  if changed then
    update public.profiles
    set preferences = merged_preferences,
        preference_revision = next_revision
    where id = subject_id;
  end if;

  return jsonb_build_object(
    'preference_revision', next_revision,
    'changed', changed
  );
end;
$$;

alter function public.merge_profile_preference_intent_for_subject(uuid, jsonb)
  owner to betterr_profile_preferences;
revoke execute on function public.merge_profile_preference_intent_for_subject(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.merge_profile_preference_intent_for_subject(uuid, jsonb)
  to betterr_profile_preferences;

-- Owner-facing generic dispatch derives the subject from the database auth
-- identity. Its signature deliberately has no profile identifier.
create or replace function public.merge_profile_preference_intent(
  preference_patch jsonb
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $$
  select public.merge_profile_preference_intent_for_subject(
    public.current_preference_subject(),
    preference_patch
  );
$$;

alter function public.merge_profile_preference_intent(jsonb)
  owner to betterr_profile_preferences;
revoke execute on function public.merge_profile_preference_intent(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.merge_profile_preference_intent(jsonb)
  to betterr_profile_preferences;

-- The notification wrapper is repeated here only to make its identity lookup
-- explicit and to reject extra fields at the SQL boundary as well as HTTP.
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

  caller_id := public.current_preference_subject();
  if caller_id is null then
    raise exception using errcode = '28000', message = 'Authenticated subject required';
  end if;

  intent_type := intent->>'type';
  if intent_type = 'setReminderEmail' then
    if intent - array['type', 'enabled'] <> '{}'::jsonb
      or jsonb_typeof(intent->'enabled') <> 'boolean' then
      raise exception using errcode = '22023', message = 'Invalid Reminder Email Preference';
    end if;
    enabled := (intent->>'enabled')::boolean;
    if enabled then
      email_confirmed_at :=
        public.current_preference_identity_email_confirmed_at();
      if email_confirmed_at is null then
        raise exception using errcode = 'P0001', message = 'identity_email_unavailable';
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

  if intent_type <> 'setPushQuietWindow'
    or intent - array['type', 'value'] <> '{}'::jsonb then
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
    raise exception using errcode = 'P0001', message = 'user_time_zone_unresolved';
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

-- The existing narrow owner wrappers already delegate to the generic merger;
-- re-apply their ACL so service_role cannot reach them accidentally.
alter function public.set_appearance_preference(text)
  owner to betterr_profile_preferences;
alter function public.set_localization_preference(text)
  owner to betterr_profile_preferences;
alter function public.set_fitness_preference(text)
  owner to betterr_profile_preferences;
alter function public.set_notification_preference(jsonb)
  owner to betterr_profile_preferences;

revoke execute on function public.set_appearance_preference(text)
  from public, anon, service_role;
revoke execute on function public.set_localization_preference(text)
  from public, anon, service_role;
revoke execute on function public.set_fitness_preference(text)
  from public, anon, service_role;
revoke execute on function public.set_notification_preference(jsonb)
  from public, anon, service_role;
grant execute on function public.set_appearance_preference(text)
  to authenticated;
grant execute on function public.set_localization_preference(text)
  to authenticated;
grant execute on function public.set_fitness_preference(text)
  to authenticated;
grant execute on function public.set_notification_preference(jsonb)
  to authenticated;

-- Legacy browser compatibility remains an owner-only envelope. It accepts a
-- profile identifier solely to preserve the old RPC shape, then requires that
-- identifier to match auth.uid() before entering the one-row merger.
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
  updated_profile jsonb;
begin
  request_subject := public.current_preference_subject();
  if request_subject is null then
    raise exception using errcode = '28000', message = 'Authenticated subject required';
  end if;
  if request_subject is distinct from profile_id then
    raise exception using
      errcode = '42501',
      message = 'Cannot update preferences for another user';
  end if;

  perform public.merge_profile_preference_intent_for_subject(
    profile_id,
    preference_patch
  );

  select to_jsonb(profile)
  into updated_profile
  from public.profiles as profile
  where profile.id = profile_id;
  if updated_profile is null then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;
  return updated_profile;
end;
$$;

alter function public.update_profile_preferences(uuid, jsonb)
  owner to betterr_profile_preferences;
revoke execute on function public.update_profile_preferences(uuid, jsonb)
  from public, anon, service_role;
grant execute on function public.update_profile_preferences(uuid, jsonb)
  to authenticated;

-- Server jobs must opt into the explicit privileged capability. This function
-- intentionally has a different name and ACL from the legacy browser RPC.
create or replace function public.update_profile_preferences_for_service(
  profile_id uuid,
  preference_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  updated_profile jsonb;
begin
  perform public.merge_profile_preference_intent_for_subject(
    profile_id,
    preference_patch
  );

  select to_jsonb(profile)
  into updated_profile
  from public.profiles as profile
  where profile.id = profile_id;
  if updated_profile is null then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;
  return updated_profile;
end;
$$;

alter function public.update_profile_preferences_for_service(uuid, jsonb)
  owner to betterr_profile_preferences;
revoke execute on function public.update_profile_preferences_for_service(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.update_profile_preferences_for_service(uuid, jsonb)
  to service_role;

revoke create on schema public from betterr_profile_preferences;
