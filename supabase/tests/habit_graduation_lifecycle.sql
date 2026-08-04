-- constrained-sql-fixture: true
-- Exercise habit graduation through the public RPC as an authenticated owner.
-- The transaction leaves all disposable identities and habit records unchanged.
begin;

select public.sql_fixture_create_auth_user(
  '64200000-0000-0000-0000-000000000001',
  'habit-graduation@example.test'
);

select public.sql_fixture_create_auth_user(
  '64200000-0000-0000-0000-000000000002',
  'other-habit-graduation@example.test'
);

create function pg_temp.reject_habit_graduation_insert()
returns trigger
language plpgsql
as $$
begin
  if new.habit_id = '64200000-0000-0000-0000-000000000103'::uuid then
    raise exception 'forced habit graduation history failure';
  end if;
  return new;
end
$$;

create trigger reject_habit_graduation_insert
before insert on public.habit_graduations
for each row execute function pg_temp.reject_habit_graduation_insert();

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"64200000-0000-0000-0000-000000000001"}',
  true
);

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.graduate_habit_atomically(uuid,uuid,timestamptz)'::regprocedure
  ) into function_definition;

  if position('FOR UPDATE' in upper(function_definition)) = 0 then
    raise exception 'habit graduation lifecycle does not lock the habit row';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.graduate_habit_atomically(uuid,uuid,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'authenticated lacks habit graduation execute privilege';
  end if;

  if has_function_privilege(
    'anon',
    'public.graduate_habit_atomically(uuid,uuid,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'anonymous habit graduation execute privilege leaked';
  end if;

  if exists (
    select 1
    from pg_proc
    where oid = 'public.graduate_habit_atomically(uuid,uuid,timestamptz)'::regprocedure
      and prosecdef
  ) then
    raise exception 'habit graduation lifecycle must remain SECURITY INVOKER';
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
  nudge_dismissed_at
)
values
  (
    '64200000-0000-0000-0000-000000000101',
    '64200000-0000-0000-0000-000000000001',
    'Successful graduation',
    '{"type":"daily"}'::jsonb,
    'active',
    18,
    24,
    '2026-07-15T10:00:00Z'
  ),
  (
    '64200000-0000-0000-0000-000000000102',
    '64200000-0000-0000-0000-000000000001',
    'Paused graduation',
    '{"type":"daily"}'::jsonb,
    'paused',
    7,
    9,
    '2026-07-16T10:00:00Z'
  ),
  (
    '64200000-0000-0000-0000-000000000103',
    '64200000-0000-0000-0000-000000000001',
    'Rollback graduation',
    '{"type":"daily"}'::jsonb,
    'active',
    29,
    31,
    '2026-07-17T10:00:00Z'
  );

select set_config(
  'request.jwt.claims',
  '{"sub":"64200000-0000-0000-0000-000000000002"}',
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
  '64200000-0000-0000-0000-000000000104',
  '64200000-0000-0000-0000-000000000002',
  'Private graduation',
  '{"type":"daily"}'::jsonb,
  'active',
  11,
  11
);

select set_config(
  'request.jwt.claims',
  '{"sub":"64200000-0000-0000-0000-000000000001"}',
  true
);

do $$
declare
  graduated jsonb;
  repeated jsonb;
  history_count integer;
begin
  graduated := public.graduate_habit_atomically(
    '64200000-0000-0000-0000-000000000101',
    '64200000-0000-0000-0000-000000000001',
    timestamptz '2026-08-01 12:00:00+00'
  );

  if graduated->>'type' <> 'graduated'
    or graduated->'habit'->>'status' <> 'formed'
    or (graduated->'habit'->>'graduated_at')::timestamptz
      is distinct from timestamptz '2026-08-01 12:00:00+00'
    or (graduated->'habit'->>'graduated_streak')::integer is distinct from 18
    or graduated->'habit'->>'nudge_dismissed_at' is not null then
    raise exception 'graduated outcome was incorrect: %', graduated;
  end if;

  select count(*) into history_count
  from public.habit_graduations
  where habit_id = '64200000-0000-0000-0000-000000000101'
    and user_id = '64200000-0000-0000-0000-000000000001';

  if history_count <> 1 or not exists (
    select 1
    from public.habit_graduations
    where habit_id = '64200000-0000-0000-0000-000000000101'
      and user_id = '64200000-0000-0000-0000-000000000001'
      and graduated_at = timestamptz '2026-08-01 12:00:00+00'
      and graduated_streak = 18
      and reactivated_at is null
  ) then
    raise exception 'graduation history was not committed with the habit: %', history_count;
  end if;

  repeated := public.graduate_habit_atomically(
    '64200000-0000-0000-0000-000000000101',
    '64200000-0000-0000-0000-000000000001',
    timestamptz '2026-08-02 12:00:00+00'
  );

  if repeated->>'type' <> 'already-formed' then
    raise exception 'repeated graduation did not return already-formed: %', repeated;
  end if;

  if (
    select count(*)
    from public.habit_graduations
    where habit_id = '64200000-0000-0000-0000-000000000101'
  ) <> 1 then
    raise exception 'repeated graduation created a duplicate history row';
  end if;
end
$$;

do $$
declare
  invalid_transition jsonb;
begin
  invalid_transition := public.graduate_habit_atomically(
    '64200000-0000-0000-0000-000000000102',
    '64200000-0000-0000-0000-000000000001',
    timestamptz '2026-08-01 12:00:00+00'
  );

  if invalid_transition->>'type' <> 'invalid-transition'
    or invalid_transition->>'current_status' <> 'paused' then
    raise exception 'paused graduation outcome was incorrect: %', invalid_transition;
  end if;

  if not exists (
    select 1
    from public.habits
    where id = '64200000-0000-0000-0000-000000000102'
      and status = 'paused'
      and current_streak = 7
      and graduated_at is null
      and graduated_streak is null
      and nudge_dismissed_at = timestamptz '2026-07-16 10:00:00+00'
  ) or exists (
    select 1
    from public.habit_graduations
    where habit_id = '64200000-0000-0000-0000-000000000102'
  ) then
    raise exception 'invalid graduation changed the paused habit';
  end if;
end
$$;

do $$
declare
  missing jsonb;
  cross_owner jsonb;
begin
  missing := public.graduate_habit_atomically(
    '64200000-0000-0000-0000-000000000199',
    '64200000-0000-0000-0000-000000000001',
    timestamptz '2026-08-01 12:00:00+00'
  );
  cross_owner := public.graduate_habit_atomically(
    '64200000-0000-0000-0000-000000000104',
    '64200000-0000-0000-0000-000000000002',
    timestamptz '2026-08-01 12:00:00+00'
  );

  if missing <> jsonb_build_object('type', 'not-found')
    or cross_owner <> jsonb_build_object('type', 'not-found') then
    raise exception 'ownership or missing-habit result disclosed state: missing=%, cross_owner=%',
      missing, cross_owner;
  end if;
end
$$;

do $$
begin
  begin
    perform public.graduate_habit_atomically(
      '64200000-0000-0000-0000-000000000103',
      '64200000-0000-0000-0000-000000000001',
      timestamptz '2026-08-01 12:00:00+00'
    );
    raise exception 'rollback graduation unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'forced habit graduation history failure' then
        raise;
      end if;
  end;

  if not exists (
    select 1
    from public.habits
    where id = '64200000-0000-0000-0000-000000000103'
      and status = 'active'
      and current_streak = 29
      and best_streak = 31
      and graduated_at is null
      and graduated_streak is null
      and nudge_dismissed_at = timestamptz '2026-07-17 10:00:00+00'
  ) or exists (
    select 1
    from public.habit_graduations
    where habit_id = '64200000-0000-0000-0000-000000000103'
  ) then
    raise exception 'failed graduation left partial habit or history state';
  end if;
end
$$;

rollback;
