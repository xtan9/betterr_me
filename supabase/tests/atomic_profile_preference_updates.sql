-- Run after `supabase db reset --local` with:
-- psql postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--   -v ON_ERROR_STOP=1 -f supabase/tests/atomic_profile_preference_updates.sql
--
-- This exercises the public RPC against PostgreSQL, including two overlapping
-- partial updates. Synthetic data and the test-only trigger are removed.

create extension if not exists dblink with schema extensions;

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
  '48600000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'atomic-preferences@example.test',
  crypt('not-used', gen_salt('bf')),
  now(),
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

update public.profiles
set preferences = '{
  "date_format": "MM/DD/YYYY",
  "week_start_day": 1,
  "theme": "system",
  "weight_unit": "kg"
}'::jsonb
where id = '48600000-0000-0000-0000-000000000001';

do $$
declare
  before_invalid_patch jsonb;
begin
  select preferences into before_invalid_patch
  from public.profiles
  where id = '48600000-0000-0000-0000-000000000001';

  begin
    perform public.update_profile_preferences(
      '48600000-0000-0000-0000-000000000001',
      '{"theme":"invalid","week_start_day":0}'::jsonb
    );
    raise exception 'invalid preference patch unexpectedly succeeded';
  exception
    when invalid_parameter_value then null;
  end;

  if (
    select preferences
    from public.profiles
    where id = '48600000-0000-0000-0000-000000000001'
  ) <> before_invalid_patch then
    raise exception 'invalid patch partially changed the profile';
  end if;
end
$$;

create function public.test_pause_atomic_preference_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id = '48600000-0000-0000-0000-000000000001'
    and new.preferences->>'week_start_day' = '0' then
    perform pg_catalog.pg_sleep(0.4);
  end if;
  return new;
end
$$;

create trigger test_pause_atomic_preference_update
before update on public.profiles
for each row execute function public.test_pause_atomic_preference_update();

select extensions.dblink_connect(
  'atomic_preference_writer',
  format(
    'host=%s port=%s dbname=%I user=postgres password=postgres',
    inet_server_addr(),
    inet_server_port(),
    current_database()
  )
);

select extensions.dblink_send_query(
  'atomic_preference_writer',
  $query$
    select public.update_profile_preferences(
      '48600000-0000-0000-0000-000000000001',
      '{"week_start_day":0}'::jsonb
    )
  $query$
);

select pg_sleep(0.1);

select public.update_profile_preferences(
  '48600000-0000-0000-0000-000000000001',
  '{"weight_unit":"lbs"}'::jsonb
);

select *
from extensions.dblink_get_result('atomic_preference_writer')
  as result(profile jsonb);

select extensions.dblink_disconnect('atomic_preference_writer');

do $$
declare
  accepted_preferences jsonb;
begin
  select preferences into accepted_preferences
  from public.profiles
  where id = '48600000-0000-0000-0000-000000000001';

  if accepted_preferences <> '{
    "date_format": "MM/DD/YYYY",
    "week_start_day": 0,
    "theme": "system",
    "weight_unit": "lbs"
  }'::jsonb then
    raise exception
      'overlapping partial updates did not preserve unrelated keys: %',
      accepted_preferences;
  end if;
end
$$;

drop trigger test_pause_atomic_preference_update on public.profiles;
drop function public.test_pause_atomic_preference_update();
delete from auth.users
where id = '48600000-0000-0000-0000-000000000001';
