-- constrained-sql-fixture: true
-- Verifies the post-retirement database contract: no row-shaped compatibility
-- envelopes, a private generic merger, a narrow service command, and preserved
-- unknown/dormant Preference storage.

select public.sql_fixture_create_auth_user(
  '67500000-0000-0000-0000-000000000001',
  'profile-retirement@example.test'
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'email_notifications_enabled'
  ) then
    raise exception 'retirement left the duplicated top-level email column';
  end if;

  if to_regprocedure('public.update_profile_preferences(uuid,jsonb)') is not null
    or to_regprocedure('public.update_profile_preferences_for_service(uuid,jsonb)') is not null then
    raise exception 'retirement left a row-shaped Preference envelope';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.merge_profile_preference_intent(jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'public.merge_profile_preference_intent(jsonb)',
    'EXECUTE'
  ) then
    raise exception 'the private generic Preference merger is exposed';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.merge_profile_preference_intent_for_subject(uuid,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'service_role',
    'public.merge_profile_preference_intent_for_subject(uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'the subject-taking Preference merger is exposed';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.disable_reminder_email_for_service(uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.disable_reminder_email_for_service(uuid)',
    'EXECUTE'
  ) then
    raise exception 'the service Reminder Email command has the wrong ACL';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.set_appearance_preference(text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'authenticated',
    'public.set_notification_preference(jsonb)',
    'EXECUTE'
  ) then
    raise exception 'a surviving owner Preference command is not authenticated-only';
  end if;
end
$$;

select set_config(
  'request.jwt.claim.sub',
  '67500000-0000-0000-0000-000000000001',
  false
);
select set_config(
  'request.jwt.claims',
  '{"sub":"67500000-0000-0000-0000-000000000001","role":"authenticated"}',
  false
);

do $$
declare
  stored_preferences jsonb;
  starting_revision bigint;
begin
  select preferences, preference_revision
  into stored_preferences, starting_revision
  from public.profiles
  where id = '67500000-0000-0000-0000-000000000001';

  update public.profiles
  set preferences = preferences || jsonb_build_object(
    'date_format', 'DD/MM/YYYY',
    'future_preference', jsonb_build_object('preserve', true)
  )
  where id = '67500000-0000-0000-0000-000000000001';

  select preference_revision
  into starting_revision
  from public.profiles
  where id = '67500000-0000-0000-0000-000000000001';
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
    raise exception 'surviving Appearance command returned the wrong outcome: %',
      command_result;
  end if;

  command_result := public.set_notification_preference(
    '{"type":"setReminderEmail","enabled":true}'::jsonb
  );
  if command_result->'reminderEmail'->>'enabled' <> 'true' then
    raise exception 'surviving Reminder Email command returned the wrong outcome: %',
      command_result;
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
  where id = '67500000-0000-0000-0000-000000000001';
  if stored_preferences->>'date_format' <> 'DD/MM/YYYY'
    or stored_preferences->'future_preference' <> '{"preserve":true}'::jsonb
    or stored_preferences->>'theme' <> 'dark'
    or stored_preferences->>'email_notifications_enabled' <> 'true'
    or profile_revision <= 1 then
    raise exception 'retirement did not preserve Preference storage or revision: % / %',
      stored_preferences, profile_revision;
  end if;
end
$$;

select public.sql_fixture_delete_auth_user(
  '67500000-0000-0000-0000-000000000001'
);
