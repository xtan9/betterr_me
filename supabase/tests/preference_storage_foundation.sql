-- constrained-sql-fixture: true
-- Exercises the current Preference storage foundation without reintroducing
-- the retired top-level column or replaying a pre-retirement migration.
-- Direct storage assertions use the constrained runner role; owner commands
-- intentionally switch to the production authenticated role.

begin;

select public.sql_fixture_create_auth_user(
  '66000000-0000-0000-0000-000000000001',
  'preference-storage@example.test'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"66000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  stored_preferences jsonb;
  starting_revision bigint;
begin
  select preferences, preference_revision
  into stored_preferences, starting_revision
  from public.profiles
  where id = '66000000-0000-0000-0000-000000000001';

  if stored_preferences->>'theme' <> 'system'
    or stored_preferences->>'week_start_day' <> '1'
    or stored_preferences->>'weight_unit' <> 'kg'
    or stored_preferences->>'email_notifications_enabled' <> 'false'
    or stored_preferences->'quiet_hours_start' <> 'null'::jsonb
    or stored_preferences->'quiet_hours_end' <> 'null'::jsonb
    or starting_revision <> 0 then
    raise exception 'stable Preference defaults were not assigned: % / %',
      stored_preferences, starting_revision;
  end if;

  update public.profiles
  set preferences = preferences || jsonb_build_object(
    'date_format', jsonb_build_object('legacy', 'opaque'),
    'future_preference', jsonb_build_object('preserve', true)
  )
  where id = '66000000-0000-0000-0000-000000000001';
end
$$;

set role authenticated;

do $$
declare
  command_result jsonb;
begin
  command_result := public.set_appearance_preference('dark');
  if command_result->>'theme' <> 'dark'
    or command_result->>'changed' <> 'true' then
    raise exception 'Appearance command returned the wrong outcome: %', command_result;
  end if;

  command_result := public.set_appearance_preference('dark');
  if command_result->>'changed' <> 'false' then
    raise exception 'Appearance no-op changed revision: %', command_result;
  end if;
end
$$;

reset role;

do $$
declare
  stored_preferences jsonb;
  profile_revision bigint;
begin
  select preferences, preference_revision
  into stored_preferences, profile_revision
  from public.profiles
  where id = '66000000-0000-0000-0000-000000000001';
  if stored_preferences->'date_format' <> '{"legacy":"opaque"}'::jsonb
    or stored_preferences->'future_preference' <> '{"preserve":true}'::jsonb
    or stored_preferences->>'theme' <> 'dark'
    or profile_revision <> 2 then
    raise exception 'unknown or dormant Preference storage was not preserved: % / %',
      stored_preferences, profile_revision;
  end if;

  begin
    update public.profiles
    set preferences = preferences || '{"theme":"chartreuse"}'::jsonb
    where id = '66000000-0000-0000-0000-000000000001';
    raise exception 'unsupported Theme bypassed the database constraint';
  exception when check_violation then null;
  end;

  begin
    update public.profiles
    set preferences = preferences || '{"week_start_day":2}'::jsonb
    where id = '66000000-0000-0000-0000-000000000001';
    raise exception 'unsupported Week Start bypassed the database constraint';
  exception when check_violation then null;
  end;

  begin
    update public.profiles
    set preferences = preferences || '{"weight_unit":"stones"}'::jsonb
    where id = '66000000-0000-0000-0000-000000000001';
    raise exception 'unsupported Weight Unit bypassed the database constraint';
  exception when check_violation then null;
  end;

  begin
    update public.profiles
    set preferences = preferences || '{"email_notifications_enabled":"yes"}'::jsonb
    where id = '66000000-0000-0000-0000-000000000001';
    raise exception 'malformed Reminder Email bypassed the database constraint';
  exception when check_violation then null;
  end;

  begin
    update public.profiles
    set preferences = preferences || '{"quiet_hours_start":"22:00","quiet_hours_end":null}'::jsonb
    where id = '66000000-0000-0000-0000-000000000001';
    raise exception 'one-sided Push Quiet Window bypassed the database constraint';
  exception when check_violation then null;
  end;

  begin
    update public.profiles
    set preferences = '[]'::jsonb
    where id = '66000000-0000-0000-0000-000000000001';
    raise exception 'non-object Preference document bypassed the database constraint';
  exception when check_violation then null;
  end;

  update public.profiles
  set preference_revision = 0
  where id = '66000000-0000-0000-0000-000000000001';
  if (select preference_revision from public.profiles
      where id = '66000000-0000-0000-0000-000000000001') <> profile_revision then
    raise exception 'direct Preference Revision rewrite was accepted';
  end if;
end
$$;

reset role;
rollback;
