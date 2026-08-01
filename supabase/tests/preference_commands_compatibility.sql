-- ralph-ci: true
-- Covers owner authorization, one-step revisions, legacy atomic envelopes,
-- service-job separation, and privacy-safe SQL diagnostics.

select public.ralph_ci_create_auth_user(
  '66100000-0000-0000-0000-000000000001',
  'preference-owner@example.test'
);
select public.ralph_ci_create_auth_user(
  '66100000-0000-0000-0000-000000000002',
  'preference-other@example.test'
);

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.merge_profile_preference_intent(jsonb)',
    'EXECUTE'
  ) then
    raise exception 'authenticated can execute the generic Preference merger';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.merge_profile_preference_intent_for_subject(uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'authenticated can execute the subject-taking Preference merger';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.update_profile_preferences_for_service(uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'authenticated can execute the service Preference interface';
  end if;
  if has_function_privilege(
    'service_role',
    'public.update_profile_preferences(uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'service_role can execute the legacy user-facing Preference interface';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.update_profile_preferences_for_service(uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'service_role cannot execute the separate Preference interface';
  end if;
  if to_regprocedure('public.set_fitness_preference(uuid,text)') is not null then
    raise exception 'owner Preference commands accept an arbitrary profile identifier';
  end if;
end
$$;

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '66100000-0000-0000-0000-000000000001',
  false
);
select set_config(
  'request.jwt.claims',
  '{"sub":"66100000-0000-0000-0000-000000000001","role":"authenticated"}',
  false
);

do $$
declare
  command_result jsonb;
  legacy_result jsonb;
  before_legacy_result jsonb;
  after_legacy_result jsonb;
begin
  command_result := public.set_fitness_preference('lbs');
  if command_result->>'weightUnit' <> 'lbs'
    or command_result->>'changed' <> 'true'
    or (command_result->>'preferenceRevision')::bigint <> 1 then
    raise exception 'owner Preference command did not accept exactly one revision: %',
      command_result;
  end if;

  command_result := public.set_fitness_preference('lbs');
  if command_result->>'changed' <> 'false'
    or (command_result->>'preferenceRevision')::bigint <> 1 then
    raise exception 'owner Preference no-op changed the revision: %', command_result;
  end if;

  command_result := public.set_appearance_preference('dark');
  if command_result->>'theme' <> 'dark'
    or command_result->>'changed' <> 'true'
    or (command_result->>'preferenceRevision')::bigint <> 2 then
    raise exception 'second owner Preference change did not increment once: %',
      command_result;
  end if;

  begin
    perform public.update_profile_preferences(
      '66100000-0000-0000-0000-000000000002',
      '{"theme":"light"}'::jsonb
    );
    raise exception 'owner legacy Preference write crossed the subject boundary';
  exception
    when insufficient_privilege then
      if sqlerrm <> 'Cannot update preferences for another user'
        or sqlerrm like '%66100000-0000-0000-0000-000000000002%' then
        raise exception 'cross-subject diagnostic was not privacy-safe: %', sqlerrm;
      end if;
  end;

  before_legacy_result := public.update_profile_preferences(
    '66100000-0000-0000-0000-000000000001',
    '{"theme":"dark"}'::jsonb
  );

  begin
    perform public.update_profile_preferences(
      '66100000-0000-0000-0000-000000000001',
      '{"theme":"light","weight_unit":"stones"}'::jsonb
    );
    raise exception 'invalid cross-domain legacy patch unexpectedly succeeded';
  exception
    when invalid_parameter_value then null;
  end;

  after_legacy_result := public.update_profile_preferences(
    '66100000-0000-0000-0000-000000000001',
    '{"theme":"dark"}'::jsonb
  );
  if after_legacy_result->'preferences' <> before_legacy_result->'preferences'
    or after_legacy_result->>'preference_revision'
      <> before_legacy_result->>'preference_revision' then
    raise exception 'invalid legacy patch partially changed Preferences: % / %',
      before_legacy_result, after_legacy_result;
  end if;

  legacy_result := public.update_profile_preferences(
    '66100000-0000-0000-0000-000000000001',
    '{
      "theme":"light",
      "week_start_day":0,
      "weight_unit":"kg",
      "email_notifications_enabled":true,
      "quiet_hours_start":"22:00",
      "quiet_hours_end":"07:00"
    }'::jsonb
  );
  if not (legacy_result ? 'id')
    or not (legacy_result ? 'preferences')
    or (legacy_result->>'preference_revision')::bigint <> 3
    or legacy_result->'preferences'->>'theme' <> 'light'
    or legacy_result->'preferences'->>'week_start_day' <> '0'
    or legacy_result->'preferences'->>'weight_unit' <> 'kg' then
    raise exception 'legacy envelope or one-step revision was incorrect: %', legacy_result;
  end if;

  legacy_result := public.update_profile_preferences(
    '66100000-0000-0000-0000-000000000001',
    '{
      "theme":"light",
      "week_start_day":0,
      "weight_unit":"kg",
      "email_notifications_enabled":true,
      "quiet_hours_start":"22:00",
      "quiet_hours_end":"07:00"
    }'::jsonb
  );
  if (legacy_result->>'preference_revision')::bigint <> 3 then
    raise exception 'legacy no-op changed the Preference Revision: %', legacy_result;
  end if;

end
$$;

reset role;
do $$
declare
  other_revision bigint;
begin
  select preference_revision
  into other_revision
  from public.profiles
  where id = '66100000-0000-0000-0000-000000000002';
  if other_revision <> 0 then
    raise exception 'cross-subject write changed the other profile revision: %', other_revision;
  end if;
end
$$;
select public.ralph_ci_delete_auth_user(
  '66100000-0000-0000-0000-000000000001'
);
select public.ralph_ci_delete_auth_user(
  '66100000-0000-0000-0000-000000000002'
);
