-- constrained-sql-fixture: true
-- Exercise the public habit completion lifecycle as an authenticated user.
-- The transaction leaves the disposable database unchanged.
begin;

select public.sql_fixture_create_auth_user(
  '48400000-0000-0000-0000-000000000001',
  'habit-completion@example.test'
);

select public.sql_fixture_create_auth_user(
  '48400000-0000-0000-0000-000000000002',
  'other-habit-completion@example.test'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"48400000-0000-0000-0000-000000000001"}',
  true
);

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.set_habit_completion_atomically(uuid,uuid,date,boolean,date)'::regprocedure
  ) into function_definition;

  if position('FOR UPDATE' in upper(function_definition)) = 0 then
    raise exception 'habit completion lifecycle does not lock the habit row';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.set_habit_completion_atomically(uuid,uuid,date,boolean,date)',
    'EXECUTE'
  ) then
    raise exception 'authenticated lacks habit completion execute privilege';
  end if;
end
$$;

-- Desired-state retries create one daily log and preserve one derived streak.
insert into public.habits (id, user_id, name, frequency)
values (
  '48400000-0000-0000-0000-000000000101',
  '48400000-0000-0000-0000-000000000001',
  'Daily completion lifecycle',
  '{"type":"daily"}'::jsonb
);

insert into public.habit_logs (habit_id, user_id, logged_date, completed)
select
  '48400000-0000-0000-0000-000000000101',
  '48400000-0000-0000-0000-000000000001',
  logged_date,
  true
from generate_series(date '2026-07-23', date '2026-07-28', interval '1 day')
  as completed_days(logged_date);

do $$
declare
  first_outcome jsonb;
  retry_outcome jsonb;
  reversal_outcome jsonb;
begin
  first_outcome := public.set_habit_completion_atomically(
    '48400000-0000-0000-0000-000000000101',
    '48400000-0000-0000-0000-000000000001',
    date '2026-07-29',
    true,
    date '2026-07-29'
  );
  retry_outcome := public.set_habit_completion_atomically(
    '48400000-0000-0000-0000-000000000101',
    '48400000-0000-0000-0000-000000000001',
    date '2026-07-29',
    true,
    date '2026-07-29'
  );

  if first_outcome->>'completed' is distinct from 'true'
    or (first_outcome->>'current_streak')::integer is distinct from 7
    or (first_outcome->>'best_streak')::integer is distinct from 7
    or retry_outcome is distinct from first_outcome then
    raise exception 'daily completion retry changed its outcome: first=%, retry=%',
      first_outcome, retry_outcome;
  end if;

  if (
    select count(*)
    from public.habit_logs
    where habit_id = '48400000-0000-0000-0000-000000000101'
      and logged_date = date '2026-07-29'
  ) is distinct from 1 then
    raise exception 'daily completion retry duplicated its log';
  end if;

  reversal_outcome := public.set_habit_completion_atomically(
    '48400000-0000-0000-0000-000000000101',
    '48400000-0000-0000-0000-000000000001',
    date '2026-07-29',
    false,
    date '2026-07-29'
  );

  if reversal_outcome->>'completed' is distinct from 'false'
    or (reversal_outcome->>'current_streak')::integer is distinct from 6
    or (reversal_outcome->>'best_streak')::integer is distinct from 7
    or (reversal_outcome->'log'->>'completed')::boolean is distinct from false then
    raise exception 'daily reversal did not update log and streak together: %',
      reversal_outcome;
  end if;
end
$$;

-- The threshold outcome is persisted once even when the request is retried.
insert into public.habit_milestones (habit_id, user_id, milestone)
values (
  '48400000-0000-0000-0000-000000000101',
  '48400000-0000-0000-0000-000000000001',
  7
)
on conflict (habit_id, milestone) do nothing;

do $$
declare
  duplicate_id uuid;
begin
  insert into public.habit_milestones (habit_id, user_id, milestone)
  values (
    '48400000-0000-0000-0000-000000000101',
    '48400000-0000-0000-0000-000000000001',
    7
  )
  on conflict (habit_id, milestone) do nothing
  returning id into duplicate_id;

  if duplicate_id is not null or (
    select count(*)
    from public.habit_milestones
    where habit_id = '48400000-0000-0000-0000-000000000101'
      and milestone = 7
  ) is distinct from 1 then
    raise exception 'milestone retry did not remain unique';
  end if;
end
$$;

-- Custom schedules skip unscheduled days while walking the current streak.
insert into public.habits (id, user_id, name, frequency)
values (
  '48400000-0000-0000-0000-000000000102',
  '48400000-0000-0000-0000-000000000001',
  'Custom completion lifecycle',
  '{"type":"custom","days":[1,3,5]}'::jsonb
);

insert into public.habit_logs (habit_id, user_id, logged_date, completed)
values
  (
    '48400000-0000-0000-0000-000000000102',
    '48400000-0000-0000-0000-000000000001',
    date '2026-07-24',
    true
  ),
  (
    '48400000-0000-0000-0000-000000000102',
    '48400000-0000-0000-0000-000000000001',
    date '2026-07-27',
    true
  );

do $$
declare
  outcome jsonb;
begin
  outcome := public.set_habit_completion_atomically(
    '48400000-0000-0000-0000-000000000102',
    '48400000-0000-0000-0000-000000000001',
    date '2026-07-29',
    true,
    date '2026-07-29'
  );

  if (outcome->>'current_streak')::integer is distinct from 3
    or (outcome->>'best_streak')::integer is distinct from 3 then
    raise exception 'custom schedule streak semantics changed: %', outcome;
  end if;
end
$$;

-- In-progress weekly targets preserve completed prior weeks without counting
-- the current week until its threshold is met.
insert into public.habits (id, user_id, name, frequency)
values (
  '48400000-0000-0000-0000-000000000103',
  '48400000-0000-0000-0000-000000000001',
  'Weekly completion lifecycle',
  '{"type":"times_per_week","count":2}'::jsonb
);

insert into public.habit_logs (habit_id, user_id, logged_date, completed)
values
  ('48400000-0000-0000-0000-000000000103', '48400000-0000-0000-0000-000000000001', date '2026-07-13', true),
  ('48400000-0000-0000-0000-000000000103', '48400000-0000-0000-0000-000000000001', date '2026-07-17', true),
  ('48400000-0000-0000-0000-000000000103', '48400000-0000-0000-0000-000000000001', date '2026-07-20', true),
  ('48400000-0000-0000-0000-000000000103', '48400000-0000-0000-0000-000000000001', date '2026-07-24', true),
  ('48400000-0000-0000-0000-000000000103', '48400000-0000-0000-0000-000000000001', date '2026-07-27', true);

do $$
declare
  completed_outcome jsonb;
  reversal_outcome jsonb;
begin
  completed_outcome := public.set_habit_completion_atomically(
    '48400000-0000-0000-0000-000000000103',
    '48400000-0000-0000-0000-000000000001',
    date '2026-07-29',
    true,
    date '2026-07-29'
  );

  if (completed_outcome->>'current_streak')::integer is distinct from 3
    or (completed_outcome->>'best_streak')::integer is distinct from 3 then
    raise exception 'weekly threshold completion changed streak semantics: %',
      completed_outcome;
  end if;

  reversal_outcome := public.set_habit_completion_atomically(
    '48400000-0000-0000-0000-000000000103',
    '48400000-0000-0000-0000-000000000001',
    date '2026-07-29',
    false,
    date '2026-07-29'
  );

  if (reversal_outcome->>'current_streak')::integer is distinct from 2
    or (reversal_outcome->>'best_streak')::integer is distinct from 3 then
    raise exception 'in-progress weekly reversal changed streak semantics: %',
      reversal_outcome;
  end if;
end
$$;

-- A failure after the upsert rolls the log and denormalized streak back.
insert into public.habits (
  id, user_id, name, frequency, current_streak, best_streak
)
values (
  '48400000-0000-0000-0000-000000000104',
  '48400000-0000-0000-0000-000000000001',
  'Atomic rollback lifecycle',
  '{"type":"times_per_week","count":"invalid"}'::jsonb,
  4,
  9
);

do $$
begin
  begin
    perform public.set_habit_completion_atomically(
      '48400000-0000-0000-0000-000000000104',
      '48400000-0000-0000-0000-000000000001',
      date '2026-07-29',
      true,
      date '2026-07-29'
    );
    raise exception 'invalid frequency unexpectedly completed';
  exception
    when invalid_text_representation then null;
  end;

  if exists (
    select 1
    from public.habit_logs
    where habit_id = '48400000-0000-0000-0000-000000000104'
  ) then
    raise exception 'failed completion left a partial habit log';
  end if;

  if not exists (
    select 1
    from public.habits
    where id = '48400000-0000-0000-0000-000000000104'
      and current_streak = 4
      and best_streak = 9
  ) then
    raise exception 'failed completion changed denormalized streaks';
  end if;
end
$$;

-- The authenticated identity cannot complete another user's habit.
select set_config(
  'request.jwt.claims',
  '{"sub":"48400000-0000-0000-0000-000000000002"}',
  true
);

insert into public.habits (id, user_id, name, frequency)
values (
  '48400000-0000-0000-0000-000000000105',
  '48400000-0000-0000-0000-000000000002',
  'Other user habit',
  '{"type":"daily"}'::jsonb
);

select set_config(
  'request.jwt.claims',
  '{"sub":"48400000-0000-0000-0000-000000000001"}',
  true
);

do $$
begin
  begin
    perform public.set_habit_completion_atomically(
      '48400000-0000-0000-0000-000000000105',
      '48400000-0000-0000-0000-000000000002',
      date '2026-07-29',
      true,
      date '2026-07-29'
    );
    raise exception 'cross-user completion unexpectedly succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'Habit not found' then
        raise;
      end if;
  end;
end
$$;

rollback;
