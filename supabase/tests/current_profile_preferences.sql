-- ralph-ci: true
-- Exercises Current Profile storage defaults, owner commands, revision semantics,
-- subject scoping, and database-enforced supported Preference invariants.

select public.ralph_ci_create_auth_user(
  '63400000-0000-0000-0000-000000000001',
  'current-profile@example.test'
);

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '63400000-0000-0000-0000-000000000001',
  false
);
select set_config(
  'request.jwt.claims',
  '{"sub":"63400000-0000-0000-0000-000000000001","role":"authenticated"}',
  false
);

do $$
declare
  profile_preferences jsonb;
  revision bigint;
  command_result jsonb;
begin
  select preferences, preference_revision
  into profile_preferences, revision
  from public.profiles
  where id = '63400000-0000-0000-0000-000000000001';

  if profile_preferences->>'theme' <> 'system'
    or profile_preferences->>'week_start_day' <> '1'
    or profile_preferences->>'weight_unit' <> 'kg'
    or profile_preferences->>'email_notifications_enabled' <> 'false'
    or profile_preferences->'quiet_hours_start' <> 'null'::jsonb
    or profile_preferences->'quiet_hours_end' <> 'null'::jsonb
    or revision <> 0 then
    raise exception 'stable Preference defaults were not assigned: % / %',
      profile_preferences, revision;
  end if;

  command_result := public.set_fitness_preference('kg');
  if command_result->>'changed' <> 'false'
    or (command_result->>'preferenceRevision')::bigint <> 0 then
    raise exception 'no-op Weight Unit command changed revision: %', command_result;
  end if;

  command_result := public.set_fitness_preference('lbs');
  if command_result->>'weightUnit' <> 'lbs'
    or command_result->>'changed' <> 'true'
    or (command_result->>'preferenceRevision')::bigint <> 1 then
    raise exception 'Weight Unit command returned wrong outcome: %', command_result;
  end if;

  command_result := public.set_localization_preference('sunday');
  if command_result->>'weekStart' <> 'sunday'
    or (command_result->>'preferenceRevision')::bigint <> 2 then
    raise exception 'Week Start command returned wrong outcome: %', command_result;
  end if;

  command_result := public.set_appearance_preference('dark');
  if command_result->>'theme' <> 'dark'
    or (command_result->>'preferenceRevision')::bigint <> 3 then
    raise exception 'Theme command returned wrong outcome: %', command_result;
  end if;

  command_result := public.set_notification_preference(
    '{"type":"setReminderEmail","enabled":false}'::jsonb
  );
  if command_result->'reminderEmail'->>'enabled' <> 'false'
    or command_result->>'changed' <> 'false'
    or (command_result->>'preferenceRevision')::bigint <> 3 then
    raise exception 'disabled Reminder Email command was not a no-op: %', command_result;
  end if;

  command_result := public.set_notification_preference(
    '{"type":"setReminderEmail","enabled":true}'::jsonb
  );
  if command_result->'reminderEmail'->>'enabled' <> 'true'
    or command_result->>'changed' <> 'true'
    or (command_result->>'preferenceRevision')::bigint <> 4 then
    raise exception 'verified Identity Email command returned wrong outcome: %', command_result;
  end if;

  begin
    perform public.set_notification_preference(
      '{"type":"setPushQuietWindow","value":{"status":"enabled","startLocal":"22:00","endLocal":"07:00"}}'::jsonb
    );
    raise exception 'Push Quiet Window unexpectedly accepted without User Time Zone';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'user_time_zone_unresolved' then raise; end if;
  end;

  command_result := public.set_user_time_zone('America/Los_Angeles');
  if command_result->>'timeZone' <> 'America/Los_Angeles'
    or command_result->>'changed' <> 'true' then
    raise exception 'User Time Zone command returned wrong outcome: %', command_result;
  end if;

  command_result := public.set_notification_preference(
    '{"type":"setPushQuietWindow","value":{"status":"enabled","startLocal":"22:00","endLocal":"07:00"}}'::jsonb
  );
  if command_result->'pushQuietWindow'->>'startLocal' <> '22:00'
    or command_result->'pushQuietWindow'->>'endLocal' <> '07:00' then
    raise exception 'Push Quiet Window command returned wrong outcome: %', command_result;
  end if;

  command_result := public.update_profile_details('{"full_name":"Current Profile User"}'::jsonb);
  if command_result->>'fullName' <> 'Current Profile User'
    or command_result->>'avatarUrl' is not null then
    raise exception 'dirty-only Profile Details command returned wrong outcome: %', command_result;
  end if;

  begin
    perform public.merge_profile_preference_intent('{"theme":"light"}'::jsonb);
    raise exception 'private generic Preference merger is executable by authenticated callers';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.profiles
    set preferences = preferences || '{"weight_unit":"stones"}'::jsonb
    where id = '63400000-0000-0000-0000-000000000001';
    raise exception 'invalid Weight Unit bypassed the database constraint';
  exception
    when check_violation then null;
  end;

  begin
    update public.profiles
    set preferences = preferences - 'weight_unit'
    where id = '63400000-0000-0000-0000-000000000001';
    raise exception 'missing supported Preference bypassed the database constraint';
  exception
    when check_violation then null;
  end;
end
$$;

reset role;
select public.ralph_ci_delete_auth_user(
  '63400000-0000-0000-0000-000000000001'
);
