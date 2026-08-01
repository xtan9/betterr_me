-- Run after `supabase db reset --local` against the local instance.
-- ralph-ci: true
-- Exercises every terminal transition outcome through the constrained RPC
-- boundary, including explicit ownership, controlled time, idempotency, and
-- transaction rollback of completion metadata.

set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '64700000-0000-0000-0000-000000000001',
  false
);
delete from public.workouts
where user_id = '64700000-0000-0000-0000-000000000001';
select set_config(
  'request.jwt.claim.sub',
  '64700000-0000-0000-0000-000000000002',
  false
);
delete from public.workouts
where user_id = '64700000-0000-0000-0000-000000000002';
reset role;

do $$
begin
  begin
    perform public.ralph_ci_delete_auth_user(
      '64700000-0000-0000-0000-000000000001'
    );
  exception when others then null;
  end;
  begin
    perform public.ralph_ci_delete_auth_user(
      '64700000-0000-0000-0000-000000000002'
    );
  exception when others then null;
  end;
end
$$;

begin;

select public.ralph_ci_create_auth_user(
  '64700000-0000-0000-0000-000000000001',
  'workout-terminal-owner@example.test'
);
select public.ralph_ci_create_auth_user(
  '64700000-0000-0000-0000-000000000002',
  'workout-terminal-other@example.test'
);

select set_config(
  'request.jwt.claim.sub',
  '64700000-0000-0000-0000-000000000001',
  true
);

insert into public.workouts (
  id,
  user_id,
  title,
  started_at,
  status,
  notes
)
values
  (
    '64700000-0000-0000-0000-000000000401',
    '64700000-0000-0000-0000-000000000001',
    'Completion workout',
    '2026-08-01 12:00:00+00',
    'in_progress',
    null
  ),
  (
    '64700000-0000-0000-0000-000000000402',
    '64700000-0000-0000-0000-000000000001',
    'Completed workout',
    '2026-08-01 10:00:00+00',
    'completed',
    'Original completion'
  ),
  (
    '64700000-0000-0000-0000-000000000403',
    '64700000-0000-0000-0000-000000000001',
    'Discarded workout',
    '2026-08-01 11:00:00+00',
    'discarded',
    null
  );

select set_config(
  'request.jwt.claim.sub',
  '64700000-0000-0000-0000-000000000002',
  true
);
insert into public.workouts (
  id,
  user_id,
  title,
  started_at,
  status,
  notes
)
values (
  '64700000-0000-0000-0000-000000000406',
  '64700000-0000-0000-0000-000000000002',
  'Other owner workout',
  '2026-08-01 12:00:00+00',
  'in_progress',
  null
);

select set_config(
  'request.jwt.claim.sub',
  '64700000-0000-0000-0000-000000000001',
  true
);

set local role authenticated;

do $$
declare
  outcome jsonb;
  current_status text;
  current_completed_at timestamptz;
  current_duration integer;
  current_notes text;
  failed boolean := false;
begin
  -- The active-detail RPC no longer provides a terminal transition bypass.
  outcome := public.update_active_workout(
    '64700000-0000-0000-0000-000000000001',
    '64700000-0000-0000-0000-000000000401',
    '{"status":"completed"}'::jsonb
  );
  if outcome <> '{"type":"invalid-transition","current_status":"in_progress"}'::jsonb then
    raise exception 'active detail RPC retained terminal status handling: %', outcome;
  end if;

  -- A controlled completion timestamp is used for a deterministic derived
  -- duration: 65 minutes after started_at is exactly 3900 seconds.
  outcome := public.complete_workout_atomically(
    '64700000-0000-0000-0000-000000000001',
    '64700000-0000-0000-0000-000000000401',
    '2026-08-01 13:05:00+00',
    '{"title":"Completed workout","notes":"Strong session"}'::jsonb
  );
  if outcome->>'type' <> 'transitioned'
    or outcome->'workout'->>'status' <> 'completed'
    or outcome->'workout'->>'title' <> 'Completed workout'
    or outcome->'workout'->>'notes' <> 'Strong session'
    or (outcome->'workout'->>'completed_at')::timestamptz
      <> '2026-08-01 13:05:00+00'::timestamptz
    or (outcome->'workout'->>'duration_seconds')::integer <> 3900 then
    raise exception 'completion outcome was incorrect: %', outcome;
  end if;

  -- Repeating completion is idempotent and cannot overwrite terminal data.
  outcome := public.complete_workout_atomically(
    '64700000-0000-0000-0000-000000000001',
    '64700000-0000-0000-0000-000000000401',
    '2026-08-01 14:00:00+00',
    '{"notes":"Should not overwrite"}'::jsonb
  );
  if outcome->>'type' <> 'already-applied'
    or (outcome->'workout'->>'completed_at')::timestamptz
      <> '2026-08-01 13:05:00+00'::timestamptz
    or outcome->'workout'->>'notes' <> 'Strong session' then
    raise exception 'repeated completion was not idempotent: %', outcome;
  end if;

  insert into public.workouts (
    id,
    user_id,
    title,
    started_at,
    status,
    notes
  )
  values
    (
      '64700000-0000-0000-0000-000000000404',
      '64700000-0000-0000-0000-000000000001',
      'Discard transition workout',
      '2026-08-01 12:00:00+00',
      'in_progress',
      null
    );

  outcome := public.discard_workout_atomically(
    '64700000-0000-0000-0000-000000000001',
    '64700000-0000-0000-0000-000000000404',
    '{"notes":"Stopped early"}'::jsonb
  );
  if outcome->>'type' <> 'transitioned'
    or outcome->'workout'->>'status' <> 'discarded'
    or outcome->'workout'->>'notes' <> 'Stopped early'
    or outcome->'workout'->>'completed_at' is not null
    or outcome->'workout'->>'duration_seconds' is not null then
    raise exception 'discard outcome was incorrect: %', outcome;
  end if;

  outcome := public.discard_workout_atomically(
    '64700000-0000-0000-0000-000000000001',
    '64700000-0000-0000-0000-000000000404',
    '{"notes":"Should not overwrite"}'::jsonb
  );
  if outcome->>'type' <> 'already-applied'
    or outcome->'workout'->>'notes' <> 'Stopped early' then
    raise exception 'repeated discard was not idempotent: %', outcome;
  end if;

  outcome := public.complete_workout_atomically(
    '64700000-0000-0000-0000-000000000001',
    '64700000-0000-0000-0000-000000000403',
    '2026-08-01 14:00:00+00',
    '{}'::jsonb
  );
  if outcome <> '{"type":"invalid-transition","current_status":"discarded"}'::jsonb then
    raise exception 'completion of discarded workout was not rejected: %', outcome;
  end if;

  outcome := public.discard_workout_atomically(
    '64700000-0000-0000-0000-000000000001',
    '64700000-0000-0000-0000-000000000402',
    '{}'::jsonb
  );
  if outcome <> '{"type":"invalid-transition","current_status":"completed"}'::jsonb then
    raise exception 'discard of completed workout was not rejected: %', outcome;
  end if;

  -- Missing and cross-owner targets are deliberately indistinguishable.
  outcome := public.complete_workout_atomically(
    '64700000-0000-0000-0000-000000000001',
    '64700000-0000-0000-0000-000000000099',
    '2026-08-01 14:00:00+00',
    '{}'::jsonb
  );
  if outcome <> '{"type":"not-found"}'::jsonb then
    raise exception 'missing workout was not masked: %', outcome;
  end if;

  select public.complete_workout_atomically(
    '64700000-0000-0000-0000-000000000001',
    '64700000-0000-0000-0000-000000000406',
    '2026-08-01 14:00:00+00',
    '{}'::jsonb
  ) into outcome;
  if outcome <> '{"type":"not-found"}'::jsonb then
    raise exception 'cross-owner workout was not masked: %', outcome;
  end if;

  -- A caller cannot spoof the trusted identity parameter either.
  select public.discard_workout_atomically(
    '64700000-0000-0000-0000-000000000002',
    '64700000-0000-0000-0000-000000000401',
    '{}'::jsonb
  ) into outcome;
  if outcome <> '{"type":"not-found"}'::jsonb then
    raise exception 'spoofed user identity was not masked: %', outcome;
  end if;

  insert into public.workouts (
    id,
    user_id,
    title,
    started_at,
    status,
    notes
  )
  values (
    '64700000-0000-0000-0000-000000000405',
    '64700000-0000-0000-0000-000000000001',
    'Rollback workout',
    '2026-08-01 12:00:00+00',
    'in_progress',
    null
  );

  -- A failure in the same terminal write rolls back status and completion
  -- metadata together. A NULL title violates the NOT NULL constraint after
  -- the statement has already selected the in-progress row.
  begin
    perform public.complete_workout_atomically(
      '64700000-0000-0000-0000-000000000001',
      '64700000-0000-0000-0000-000000000405',
      '2026-08-01 13:05:00+00',
      '{"title":null}'::jsonb
    );
  exception when others then
    failed := true;
  end;
  if not failed then
    raise exception 'invalid terminal write unexpectedly succeeded';
  end if;

  select status, completed_at, duration_seconds, notes
  into current_status, current_completed_at, current_duration, current_notes
  from public.workouts
  where id = '64700000-0000-0000-0000-000000000405';
  if current_status <> 'in_progress'
    or current_completed_at is not null
    or current_duration is not null
    or current_notes is not null then
    raise exception 'failed completion left partial terminal state: %, %, %, %',
      current_status, current_completed_at, current_duration, current_notes;
  end if;
end
$$;

reset role;
set role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '64700000-0000-0000-0000-000000000001',
  false
);
delete from public.workouts
where user_id = '64700000-0000-0000-0000-000000000001';
select set_config(
  'request.jwt.claim.sub',
  '64700000-0000-0000-0000-000000000002',
  false
);
delete from public.workouts
where user_id = '64700000-0000-0000-0000-000000000002';
reset role;
select public.ralph_ci_delete_auth_user(
  '64700000-0000-0000-0000-000000000001'
);
select public.ralph_ci_delete_auth_user(
  '64700000-0000-0000-0000-000000000002'
);
commit;
