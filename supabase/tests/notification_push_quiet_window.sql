-- ralph-ci: true
-- Covers the Notifications Push Quiet Window command, local-time invariants,
-- User Time Zone gating, revision semantics, and degraded legacy storage.

select public.ralph_ci_create_auth_user(
  '67200000-0000-0000-0000-000000000001',
  'push-quiet-window@example.test'
);

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '67200000-0000-0000-0000-000000000001',
  false
);
select set_config(
  'request.jwt.claims',
  '{"sub":"67200000-0000-0000-0000-000000000001","role":"authenticated"}',
  false
);

do $$
declare
  command_result jsonb;
begin
  command_result := public.set_notification_preference(
    '{"type":"setPushQuietWindow","value":{"status":"disabled"}}'::jsonb
  );
  if command_result->'pushQuietWindow'->>'status' <> 'disabled'
    or command_result->>'changed' <> 'false'
    or (command_result->>'preferenceRevision')::bigint <> 0 then
    raise exception 'disabled Push Quiet Window was not a no-op without a User Time Zone: %',
      command_result;
  end if;

  begin
    perform public.set_notification_preference(
      '{"type":"setPushQuietWindow","value":{"status":"enabled","startLocal":"22:00","endLocal":"07:00"}}'::jsonb
    );
    raise exception 'Push Quiet Window unexpectedly accepted without a User Time Zone';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'user_time_zone_unresolved' then raise; end if;
  end;

  command_result := public.set_notification_preference(
    '{"type":"setPushQuietWindow","value":{"status":"disabled"}}'::jsonb
  );
  if command_result->>'changed' <> 'false'
    or (command_result->>'preferenceRevision')::bigint <> 0 then
    raise exception 'rejected unresolved-zone enable changed accepted state: %',
      command_result;
  end if;

  command_result := public.set_user_time_zone('America/New_York');
  if command_result->>'timeZone' <> 'America/New_York'
    or command_result->>'changed' <> 'true' then
    raise exception 'User Time Zone command returned wrong outcome: %', command_result;
  end if;

  command_result := public.set_notification_preference(
    '{"type":"setPushQuietWindow","value":{"status":"enabled","startLocal":"22:00","endLocal":"07:00"}}'::jsonb
  );
  if command_result->'pushQuietWindow'->>'startLocal' <> '22:00'
    or command_result->'pushQuietWindow'->>'endLocal' <> '07:00'
    or command_result->>'changed' <> 'true'
    or (command_result->>'preferenceRevision')::bigint <> 1 then
    raise exception 'enabled Push Quiet Window returned wrong outcome: %', command_result;
  end if;

  begin
    perform public.set_notification_preference(
      '{"type":"setPushQuietWindow","value":{"status":"enabled","startLocal":"21:00"}}'::jsonb
    );
    raise exception 'one-sided Push Quiet Window unexpectedly accepted';
  exception
    when sqlstate '22023' then null;
  end;

  begin
    perform public.set_notification_preference(
      '{"type":"setPushQuietWindow","value":{"status":"enabled","startLocal":"21:00","endLocal":"21:00"}}'::jsonb
    );
    raise exception 'equal-endpoint Push Quiet Window unexpectedly accepted';
  exception
    when sqlstate '22023' then null;
  end;

  command_result := public.set_notification_preference(
    '{"type":"setPushQuietWindow","value":{"status":"enabled","startLocal":"22:00","endLocal":"07:00"}}'::jsonb
  );
  if command_result->>'changed' <> 'false'
    or (command_result->>'preferenceRevision')::bigint <> 1 then
    raise exception 'same Push Quiet Window changed the Preference Revision: %', command_result;
  end if;

  command_result := public.set_user_time_zone(null);
  if command_result->>'timeZone' is not null
    or command_result->>'changed' <> 'true' then
    raise exception 'User Time Zone did not become unresolved: %', command_result;
  end if;

  command_result := public.set_notification_preference(
    '{"type":"setPushQuietWindow","value":{"status":"disabled"}}'::jsonb
  );
  if command_result->'pushQuietWindow'->>'status' <> 'disabled'
    or command_result->>'changed' <> 'true'
    or (command_result->>'preferenceRevision')::bigint <> 2 then
    raise exception 'disabled Push Quiet Window did not clear a preserved pair: %', command_result;
  end if;

  command_result := public.set_notification_preference(
    '{"type":"setPushQuietWindow","value":{"status":"disabled"}}'::jsonb
  );
  if command_result->>'changed' <> 'false'
    or (command_result->>'preferenceRevision')::bigint <> 2 then
    raise exception 'disabled Push Quiet Window was not a no-op after clearing: %', command_result;
  end if;
end
$$;

reset role;
select public.ralph_ci_delete_auth_user(
  '67200000-0000-0000-0000-000000000001'
);
