-- Run against the disposable database after the preference storage migration.
-- This administrative fixture temporarily downgrades the disposable profiles
-- table, reapplies the production migration, and rolls back every change.

begin;

delete from auth.users
where id = '66000000-0000-0000-0000-000000000001';

alter table public.profiles
  drop constraint if exists profiles_preference_revision_nonnegative_check,
  drop constraint if exists profiles_preferences_object_check,
  drop constraint if exists profiles_supported_preferences_check,
  drop constraint if exists profiles_push_quiet_window_pair_check;
drop trigger if exists profiles_preference_revision on public.profiles;
alter table public.profiles
  alter column preferences drop not null;
alter table public.profiles
  drop column if exists preference_revision;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '66000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'preference-preflight@example.test',
  'not-used',
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

update public.profiles
set preferences = '{"theme":"chartreuse"}'::jsonb
where id = '66000000-0000-0000-0000-000000000001';

savepoint before_preflight;

\set ON_ERROR_STOP 0
\ir ../migrations/20260801000000_harden_profile_preference_storage.sql
\set migration_failed :ERROR
\set ON_ERROR_STOP 1

\if :migration_failed
\else
  do $$
  begin
    raise exception 'malformed preference unexpectedly passed migration preflight';
  end
  $$;
\endif

rollback to before_preflight;

do $$
begin
  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.profiles'::regclass
      and attname = 'preference_revision'
      and not attisdropped
  ) then
    raise exception 'migration changed schema before rejecting malformed preference';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = '66000000-0000-0000-0000-000000000001'
      and preferences = '{"theme":"chartreuse"}'::jsonb
    ) then
    raise exception 'migration changed data before rejecting malformed preference';
  end if;
end
$$;

update public.profiles
set preferences = '{"week_start_day":2}'::jsonb
where id = '66000000-0000-0000-0000-000000000001';

savepoint before_unsupported_week_start;

\set ON_ERROR_STOP 0
\ir ../migrations/20260801000000_harden_profile_preference_storage.sql
\set migration_failed :ERROR
\set ON_ERROR_STOP 1

\if :migration_failed
\else
  do $$
  begin
    raise exception 'unsupported Week Start unexpectedly passed migration preflight';
  end
  $$;
\endif

rollback to before_unsupported_week_start;

do $$
begin
  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.profiles'::regclass
      and attname = 'preference_revision'
      and not attisdropped
  ) then
    raise exception 'migration changed schema before rejecting unsupported Week Start';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = '66000000-0000-0000-0000-000000000001'
      and preferences = '{"week_start_day":2}'::jsonb
  ) then
    raise exception 'migration changed data before rejecting unsupported Week Start';
  end if;
end
$$;

rollback;

begin;

alter table public.profiles
  drop constraint if exists profiles_preference_revision_nonnegative_check,
  drop constraint if exists profiles_preferences_object_check,
  drop constraint if exists profiles_supported_preferences_check,
  drop constraint if exists profiles_push_quiet_window_pair_check;
drop trigger if exists profiles_preference_revision on public.profiles;
alter table public.profiles
  alter column preferences drop not null;
alter table public.profiles
  drop column if exists preference_revision;

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '66000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'preference-null@example.test',
    'not-used',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '66000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'preference-repair@example.test',
    'not-used',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '66000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'preference-preserve@example.test',
    'not-used',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

update public.profiles
set email_notifications_enabled = false,
    preferences = null
where id = '66000000-0000-0000-0000-000000000001';

update public.profiles
set email_notifications_enabled = true,
    preferences = '{
      "date_format":"DD/MM/YYYY",
      "future_preference":{"preserve":true},
      "theme":"dark",
      "quiet_hours_start":"22:00"
    }'::jsonb
where id = '66000000-0000-0000-0000-000000000002';

update public.profiles
set email_notifications_enabled = false,
    preferences = '{
      "date_format":{"legacy":"opaque"},
      "future_preference":{"preserve":true},
      "theme":"light",
      "week_start_day":0,
      "weight_unit":"lbs",
      "email_notifications_enabled":false,
      "quiet_hours_start":"22:00",
      "quiet_hours_end":"06:00"
    }'::jsonb
where id = '66000000-0000-0000-0000-000000000003';

\ir ../migrations/20260801000000_harden_profile_preference_storage.sql

do $$
declare
  null_preferences jsonb;
  repaired_preferences jsonb;
  preserved_preferences jsonb;
begin
  select preferences into null_preferences
  from public.profiles
  where id = '66000000-0000-0000-0000-000000000001';
  if null_preferences->>'theme' is distinct from 'system'
    or null_preferences->>'week_start_day' is distinct from '1'
    or null_preferences->>'weight_unit' is distinct from 'kg'
    or null_preferences->>'email_notifications_enabled' is distinct from 'false'
    or null_preferences->'quiet_hours_start' is distinct from 'null'::jsonb
    or null_preferences->'quiet_hours_end' is distinct from 'null'::jsonb then
    raise exception 'missing preference defaults were not assigned: %', null_preferences;
  end if;

  select preferences into repaired_preferences
  from public.profiles
  where id = '66000000-0000-0000-0000-000000000002';
  if repaired_preferences->>'theme' is distinct from 'dark'
    or repaired_preferences->>'weight_unit' is distinct from 'kg'
    or repaired_preferences->>'email_notifications_enabled' is distinct from 'true'
    or repaired_preferences->'quiet_hours_start' is distinct from 'null'::jsonb
    or repaired_preferences->'quiet_hours_end' is distinct from 'null'::jsonb
    or repaired_preferences->>'date_format' is distinct from 'DD/MM/YYYY'
    or repaired_preferences->'future_preference' is distinct from '{"preserve":true}'::jsonb then
    raise exception 'preference repair or preservation was incorrect: %', repaired_preferences;
  end if;

  select preferences into preserved_preferences
  from public.profiles
  where id = '66000000-0000-0000-0000-000000000003';
  if preserved_preferences->>'theme' is distinct from 'light'
    or preserved_preferences->>'week_start_day' is distinct from '0'
    or preserved_preferences->>'weight_unit' is distinct from 'lbs'
    or preserved_preferences->>'email_notifications_enabled' is distinct from 'false'
    or preserved_preferences->>'quiet_hours_start' is distinct from '22:00'
    or preserved_preferences->>'quiet_hours_end' is distinct from '06:00'
    or preserved_preferences->'date_format' is distinct from '{"legacy":"opaque"}'::jsonb
    or preserved_preferences->'future_preference' is distinct from '{"preserve":true}'::jsonb then
    raise exception 'valid preferences or dormant storage was not preserved: %', preserved_preferences;
  end if;

  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.profiles'::regclass
      and attname = 'preference_revision'
      and attnotnull
      and not attisdropped
  ) then
    raise exception 'preference revision is not non-null';
  end if;

  if (select preference_revision from public.profiles where id = '66000000-0000-0000-0000-000000000001') <> 0
    or (select preference_revision from public.profiles where id = '66000000-0000-0000-0000-000000000002') <> 0
    or (select preference_revision from public.profiles where id = '66000000-0000-0000-0000-000000000003') <> 0 then
    raise exception 'backfilled profiles did not receive revision zero';
  end if;
end
$$;

do $$
declare
  rejected boolean;
begin
  rejected := false;
  begin
    update public.profiles
    set preferences = preferences || '{"theme":"chartreuse"}'::jsonb
    where id = '66000000-0000-0000-0000-000000000001';
  exception when check_violation then
    rejected := true;
  end;
  if not rejected then
    raise exception 'unsupported theme was accepted';
  end if;

  rejected := false;
  begin
    update public.profiles
    set preferences = preferences || '{"week_start_day":2}'::jsonb
    where id = '66000000-0000-0000-0000-000000000001';
  exception when check_violation then
    rejected := true;
  end;
  if not rejected then
    raise exception 'Tuesday week start was accepted';
  end if;

  rejected := false;
  begin
    update public.profiles
    set preferences = preferences || '{"weight_unit":"stones"}'::jsonb
    where id = '66000000-0000-0000-0000-000000000001';
  exception when check_violation then
    rejected := true;
  end;
  if not rejected then
    raise exception 'unsupported weight unit was accepted';
  end if;

  rejected := false;
  begin
    update public.profiles
    set preferences = preferences || '{"email_notifications_enabled":"yes"}'::jsonb
    where id = '66000000-0000-0000-0000-000000000001';
  exception when check_violation then
    rejected := true;
  end;
  if not rejected then
    raise exception 'non-boolean reminder email preference was accepted';
  end if;

  rejected := false;
  begin
    update public.profiles
    set preferences = preferences || '{"quiet_hours_start":"22:00","quiet_hours_end":null}'::jsonb
    where id = '66000000-0000-0000-0000-000000000001';
  exception when check_violation then
    rejected := true;
  end;
  if not rejected then
    raise exception 'one-sided Push Quiet Window was accepted';
  end if;

  rejected := false;
  begin
    update public.profiles
    set preferences = '[]'::jsonb
    where id = '66000000-0000-0000-0000-000000000001';
  exception when check_violation then
    rejected := true;
  end;
  if not rejected then
    raise exception 'non-object preference document was accepted';
  end if;
end
$$;

set role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"66000000-0000-0000-0000-000000000003"}',
  false
);

select public.update_profile_preferences(
  '66000000-0000-0000-0000-000000000003',
  '{"theme":"system"}'::jsonb
);

do $$
begin
  if (select preference_revision from public.profiles where id = '66000000-0000-0000-0000-000000000003') <> 1 then
    raise exception 'accepted preference change did not advance revision';
  end if;
end
$$;

select public.update_profile_preferences(
  '66000000-0000-0000-0000-000000000003',
  '{"theme":"system"}'::jsonb
);

select public.update_profile_preferences(
  '66000000-0000-0000-0000-000000000003',
  '{"weight_unit":"kg"}'::jsonb
);

reset role;

do $$
declare
  revision_after_noop bigint;
begin
  revision_after_noop := (
    select preference_revision
    from public.profiles
    where id = '66000000-0000-0000-0000-000000000003'
  );
  if revision_after_noop <> 2 then
    raise exception 'no-op or subsequent preference revision was incorrect: %', revision_after_noop;
  end if;

  update public.profiles
  set preference_revision = 0
  where id = '66000000-0000-0000-0000-000000000003';
  if (select preference_revision from public.profiles where id = '66000000-0000-0000-0000-000000000003') <> 2 then
    raise exception 'direct revision rewrite was not ignored';
  end if;

  update public.profiles
  set preferences = preferences
  where id = '66000000-0000-0000-0000-000000000003';
  if (select preference_revision from public.profiles where id = '66000000-0000-0000-0000-000000000003') <> 2 then
    raise exception 'no-op direct preference update advanced revision';
  end if;
end
$$;

rollback;
