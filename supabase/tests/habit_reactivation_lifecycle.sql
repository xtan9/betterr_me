-- ralph-ci: true
-- Exercise habit reactivation through the public RPC as an authenticated owner.
-- The core transition commits independently from the best-effort history reaction.
begin;

select public.ralph_ci_create_auth_user(
  '64300000-0000-0000-0000-000000000001',
  'habit-reactivation@example.test'
);

select public.ralph_ci_create_auth_user(
  '64300000-0000-0000-0000-000000000002',
  'other-habit-reactivation@example.test'
);

create function pg_temp.reject_habit_reactivation_update()
returns trigger
language plpgsql
as $$
begin
  if new.id = '64300000-0000-0000-0000-000000000104'::uuid then
    raise exception 'forced habit reactivation core failure';
  end if;
  return new;
end
$$;

create trigger reject_habit_reactivation_update
before update on public.habits
for each row execute function pg_temp.reject_habit_reactivation_update();

create function pg_temp.reject_reactivation_history_update()
returns trigger
language plpgsql
as $$
begin
  if new.habit_id = '64300000-0000-0000-0000-000000000103'::uuid then
    raise exception 'forced habit reactivation history failure';
  end if;
  return new;
end
$$;

create trigger reject_reactivation_history_update
before update on public.habit_graduations
for each row execute function pg_temp.reject_reactivation_history_update();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"64300000-0000-0000-0000-000000000001"}',
  true
);

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.reactivate_habit_atomically(uuid,uuid)'::regprocedure
  ) into function_definition;

  if position('FOR UPDATE' in upper(function_definition)) = 0 then
    raise exception 'habit reactivation lifecycle does not lock the habit row';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.reactivate_habit_atomically(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated lacks habit reactivation execute privilege';
  end if;

  if not has_table_privilege(
    'authenticated',
    'public.habit_graduations',
    'UPDATE'
  ) then
    raise exception 'authenticated lacks habit reactivation history update privilege';
  end if;

  if has_function_privilege(
    'anon',
    'public.reactivate_habit_atomically(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'anonymous habit reactivation execute privilege leaked';
  end if;

  if exists (
    select 1
    from pg_proc
    where oid = 'public.reactivate_habit_atomically(uuid,uuid)'::regprocedure
      and prosecdef
  ) then
    raise exception 'habit reactivation lifecycle must remain SECURITY INVOKER';
  end if;
end
$$;

insert into public.habits (
  id,
  user_id,
  name,
  frequency,
  status,
  current_streak,
  best_streak,
  paused_at,
  graduated_at,
  graduated_streak,
  nudge_dismissed_at
)
values
  (
    '64300000-0000-0000-0000-000000000101',
    '64300000-0000-0000-0000-000000000001',
    'Successful reactivation',
    '{"type":"daily"}'::jsonb,
    'formed',
    87,
    120,
    null,
    '2026-07-31T10:00:00Z',
    87,
    '2026-07-30T10:00:00Z'
  ),
  (
    '64300000-0000-0000-0000-000000000102',
    '64300000-0000-0000-0000-000000000001',
    'Paused reactivation',
    '{"type":"daily"}'::jsonb,
    'paused',
    7,
    9,
    '2026-07-16T10:00:00Z',
    null,
    null,
    '2026-07-16T10:00:00Z'
  ),
  (
    '64300000-0000-0000-0000-000000000103',
    '64300000-0000-0000-0000-000000000001',
    'History reaction failure',
    '{"type":"daily"}'::jsonb,
    'formed',
    41,
    55,
    null,
    '2026-07-29T10:00:00Z',
    41,
    null
  ),
  (
    '64300000-0000-0000-0000-000000000104',
    '64300000-0000-0000-0000-000000000001',
    'Core failure',
    '{"type":"daily"}'::jsonb,
    'formed',
    29,
    31,
    null,
    '2026-07-28T10:00:00Z',
    29,
    '2026-07-27T10:00:00Z'
  );

insert into public.habit_graduations (
  habit_id,
  user_id,
  graduated_at,
  graduated_streak
)
values
  (
    '64300000-0000-0000-0000-000000000101',
    '64300000-0000-0000-0000-000000000001',
    '2026-07-31T10:00:00Z',
    87
  ),
  (
    '64300000-0000-0000-0000-000000000103',
    '64300000-0000-0000-0000-000000000001',
    '2026-07-29T10:00:00Z',
    41
  ),
  (
    '64300000-0000-0000-0000-000000000104',
    '64300000-0000-0000-0000-000000000001',
    '2026-07-28T10:00:00Z',
    29
  );

select set_config(
  'request.jwt.claims',
  '{"sub":"64300000-0000-0000-0000-000000000002"}',
  true
);

insert into public.habits (
  id,
  user_id,
  name,
  frequency,
  status,
  current_streak,
  best_streak
)
values (
  '64300000-0000-0000-0000-000000000105',
  '64300000-0000-0000-0000-000000000002',
  'Private reactivation',
  '{"type":"daily"}'::jsonb,
  'formed',
  11,
  11
);

select set_config(
  'request.jwt.claims',
  '{"sub":"64300000-0000-0000-0000-000000000001"}',
  true
);

do $$
declare
  reactivated jsonb;
  repeated jsonb;
begin
  reactivated := public.reactivate_habit_atomically(
    '64300000-0000-0000-0000-000000000101',
    '64300000-0000-0000-0000-000000000001'
  );

  if reactivated->>'type' <> 'reactivated'
    or reactivated->'habit'->>'status' <> 'active'
    or (reactivated->'habit'->>'current_streak')::integer is distinct from 0
    or (reactivated->'habit'->>'best_streak')::integer is distinct from 120
    or reactivated->'habit'->>'graduated_at' is not null
    or reactivated->'habit'->>'graduated_streak' is not null
    or reactivated->'habit'->>'nudge_dismissed_at' is not null then
    raise exception 'reactivated outcome was incorrect: %', reactivated;
  end if;

  if not exists (
    select 1
    from public.habits
    where id = '64300000-0000-0000-0000-000000000101'
      and status = 'active'
      and current_streak = 0
      and best_streak = 120
      and graduated_at is null
      and graduated_streak is null
      and nudge_dismissed_at is null
  ) then
    raise exception 'reactivation core state was not persisted';
  end if;

  if not exists (
    select 1
    from public.habit_graduations
    where habit_id = '64300000-0000-0000-0000-000000000101'
      and reactivated_at is null
  ) then
    raise exception 'core reactivation unexpectedly changed history';
  end if;

  repeated := public.reactivate_habit_atomically(
    '64300000-0000-0000-0000-000000000101',
    '64300000-0000-0000-0000-000000000001'
  );

  if repeated->>'type' <> 'already-active'
    or repeated->'habit'->>'status' <> 'active'
    or (repeated->'habit'->>'current_streak')::integer is distinct from 0 then
    raise exception 'repeated reactivation did not return already-active: %', repeated;
  end if;
end
$$;

do $$
declare
  invalid_transition jsonb;
begin
  invalid_transition := public.reactivate_habit_atomically(
    '64300000-0000-0000-0000-000000000102',
    '64300000-0000-0000-0000-000000000001'
  );

  if invalid_transition->>'type' <> 'invalid-transition'
    or invalid_transition->>'current_status' <> 'paused' then
    raise exception 'paused reactivation outcome was incorrect: %', invalid_transition;
  end if;

  if not exists (
    select 1
    from public.habits
    where id = '64300000-0000-0000-0000-000000000102'
      and status = 'paused'
      and current_streak = 7
      and nudge_dismissed_at = '2026-07-16T10:00:00Z'
  ) then
    raise exception 'invalid reactivation changed the paused habit';
  end if;
end
$$;

do $$
declare
  missing jsonb;
  cross_owner jsonb;
begin
  missing := public.reactivate_habit_atomically(
    '64300000-0000-0000-0000-000000000199',
    '64300000-0000-0000-0000-000000000001'
  );
  cross_owner := public.reactivate_habit_atomically(
    '64300000-0000-0000-0000-000000000105',
    '64300000-0000-0000-0000-000000000001'
  );

  if missing <> jsonb_build_object('type', 'not-found')
    or cross_owner <> jsonb_build_object('type', 'not-found') then
    raise exception 'ownership or missing-habit result disclosed state: missing=%, cross_owner=%',
      missing, cross_owner;
  end if;
end
$$;

do $$
declare
  history_error text;
begin
  perform public.reactivate_habit_atomically(
    '64300000-0000-0000-0000-000000000103',
    '64300000-0000-0000-0000-000000000001'
  );

  begin
    update public.habit_graduations
    set reactivated_at = '2026-08-01T12:00:00Z'
    where habit_id = '64300000-0000-0000-0000-000000000103';
    raise exception 'history reaction unexpectedly succeeded';
  exception
    when raise_exception then
      history_error := sqlerrm;
      if history_error <> 'forced habit reactivation history failure' then
        raise;
      end if;
  end;

  if not exists (
    select 1
    from public.habits
    where id = '64300000-0000-0000-0000-000000000103'
      and status = 'active'
      and current_streak = 0
      and best_streak = 55
      and graduated_at is null
      and graduated_streak is null
      and nudge_dismissed_at is null
  ) or not exists (
    select 1
    from public.habit_graduations
    where habit_id = '64300000-0000-0000-0000-000000000103'
      and reactivated_at is null
  ) then
    raise exception 'history failure did not leave the core result committed';
  end if;
end
$$;

do $$
declare
  core_error text;
begin
  begin
    perform public.reactivate_habit_atomically(
      '64300000-0000-0000-0000-000000000104',
      '64300000-0000-0000-0000-000000000001'
    );
    raise exception 'core reactivation unexpectedly succeeded';
  exception
    when raise_exception then
      core_error := sqlerrm;
      if core_error <> 'forced habit reactivation core failure' then
        raise;
      end if;
  end;

  if not exists (
    select 1
    from public.habits
    where id = '64300000-0000-0000-0000-000000000104'
      and status = 'formed'
      and current_streak = 29
      and best_streak = 31
      and graduated_at = '2026-07-28T10:00:00Z'
      and graduated_streak = 29
      and nudge_dismissed_at = '2026-07-27T10:00:00Z'
  ) then
    raise exception 'failed core reactivation changed the habit';
  end if;
end
$$;

rollback;
