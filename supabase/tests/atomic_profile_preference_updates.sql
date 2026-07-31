-- ralph-ci: true
-- Exercises validation, ownership, atomic merge, and concurrent writes through
-- the public preference RPC using only the disposable constrained test role.

select public.ralph_ci_create_auth_user(
  '48600000-0000-0000-0000-000000000001',
  'atomic-preferences@example.test'
);
select public.ralph_ci_create_auth_user(
  '48600000-0000-0000-0000-000000000002',
  'other-atomic-preferences@example.test'
);

set role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"48600000-0000-0000-0000-000000000001"}',
  false
);

select public.update_profile_preferences(
  '48600000-0000-0000-0000-000000000001',
  '{
    "date_format": "MM/DD/YYYY",
    "week_start_day": 1,
    "theme": "system",
    "weight_unit": "kg",
    "email_notifications_enabled": false
  }'::jsonb
);

do $$
declare
  before_invalid_patch jsonb;
  after_invalid_patch jsonb;
begin
  before_invalid_patch := public.update_profile_preferences(
    '48600000-0000-0000-0000-000000000001',
    '{"date_format":"MM/DD/YYYY"}'::jsonb
  )->'preferences';

  begin
    perform public.update_profile_preferences(
      '48600000-0000-0000-0000-000000000001',
      '{"theme":"invalid","week_start_day":0}'::jsonb
    );
    raise exception 'invalid preference patch unexpectedly succeeded';
  exception
    when invalid_parameter_value then null;
  end;

  after_invalid_patch := public.update_profile_preferences(
    '48600000-0000-0000-0000-000000000001',
    '{"date_format":"MM/DD/YYYY"}'::jsonb
  )->'preferences';
  if after_invalid_patch <> before_invalid_patch then
    raise exception 'invalid patch partially changed the profile';
  end if;

  begin
    perform public.update_profile_preferences(
      '48600000-0000-0000-0000-000000000002',
      '{"theme":"dark"}'::jsonb
    );
    raise exception 'cross-user preference patch unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'Cannot update preferences for another user' then
        raise;
      end if;
  end;
end
$$;

reset role;
select public.ralph_ci_open_connection('atomic-preference-writer');

select extensions.dblink_send_query(
  'atomic-preference-writer',
  $query$
    with request_context as materialized (
      select set_config(
        'request.jwt.claims',
        '{"sub":"48600000-0000-0000-0000-000000000001"}',
        false
      )
    ),
    updated as materialized (
      select public.update_profile_preferences(
        '48600000-0000-0000-0000-000000000001',
        '{"week_start_day":0}'::jsonb
      ) profile
      from request_context
    ),
    paused as materialized (
      select pg_sleep(0.4) from updated
    )
    select updated.profile from updated cross join paused
  $query$
);

select pg_sleep(0.1);

set role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"48600000-0000-0000-0000-000000000001"}',
  false
);
select public.update_profile_preferences(
  '48600000-0000-0000-0000-000000000001',
  '{"weight_unit":"lbs"}'::jsonb
);
reset role;

select *
from extensions.dblink_get_result('atomic-preference-writer')
  as result(profile jsonb);
select extensions.dblink_disconnect('atomic-preference-writer');

set role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"48600000-0000-0000-0000-000000000001"}',
  false
);
do $$
declare
  accepted_preferences jsonb;
begin
  accepted_preferences := public.update_profile_preferences(
    '48600000-0000-0000-0000-000000000001',
    '{"date_format":"MM/DD/YYYY"}'::jsonb
  )->'preferences';

  if accepted_preferences <> '{
    "date_format": "MM/DD/YYYY",
    "week_start_day": 0,
    "theme": "system",
    "weight_unit": "lbs",
    "email_notifications_enabled": false
  }'::jsonb then
    raise exception
      'overlapping partial updates did not preserve unrelated keys: %',
      accepted_preferences;
  end if;
end
$$;

do $$
declare
  accepted_preferences jsonb;
begin
  accepted_preferences := public.update_profile_preferences(
    '48600000-0000-0000-0000-000000000001',
    '{"email_notifications_enabled":true}'::jsonb
  )->'preferences';

  if accepted_preferences->>'email_notifications_enabled' <> 'true'
    or accepted_preferences->>'weight_unit' <> 'lbs'
    or accepted_preferences->>'week_start_day' <> '0' then
    raise exception 'email preference intent did not preserve unrelated keys: %',
      accepted_preferences;
  end if;
end
$$;
reset role;

select public.ralph_ci_delete_auth_user(
  '48600000-0000-0000-0000-000000000001'
);
select public.ralph_ci_delete_auth_user(
  '48600000-0000-0000-0000-000000000002'
);
