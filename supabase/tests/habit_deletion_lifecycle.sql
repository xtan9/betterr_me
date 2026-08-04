-- constrained-sql-fixture: true
-- Exercise Habit deletion through the public RPC as an authenticated owner.
-- Logs, milestones, graduation history, and Habit-owned Reminder Configuration
-- are deleted atomically; reusable reminder defaults are preserved.
begin;

select public.sql_fixture_create_auth_user(
  '64400000-0000-0000-0000-000000000001',
  'habit-deletion@example.test'
);

select public.sql_fixture_create_auth_user(
  '64400000-0000-0000-0000-000000000002',
  'other-habit-deletion@example.test'
);

create function pg_temp.reject_habit_deletion()
returns trigger
language plpgsql
as $$
begin
  if old.id = '64400000-0000-0000-0000-000000000103'::uuid then
    raise exception 'forced habit deletion failure';
  end if;
  return old;
end
$$;

create trigger reject_habit_deletion
before delete on public.habits
for each row execute function pg_temp.reject_habit_deletion();

select set_config('request.jwt.claims', '', false);
select set_config(
  'request.jwt.claim.sub',
  '64400000-0000-0000-0000-000000000001',
  false
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
values
  (
    '64400000-0000-0000-0000-000000000101',
    '64400000-0000-0000-0000-000000000001',
    'Successful deletion',
    '{"type":"daily"}'::jsonb,
    'active',
    12,
    20
  ),
  (
    '64400000-0000-0000-0000-000000000103',
    '64400000-0000-0000-0000-000000000001',
    'Rollback deletion',
    '{"type":"daily"}'::jsonb,
    'formed',
    30,
    30
  );

insert into public.habit_logs (id, habit_id, user_id, logged_date)
values
  (
    '64400000-0000-0000-0000-000000000501',
    '64400000-0000-0000-0000-000000000101',
    '64400000-0000-0000-0000-000000000001',
    '2026-08-01'
  ),
  (
    '64400000-0000-0000-0000-000000000503',
    '64400000-0000-0000-0000-000000000103',
    '64400000-0000-0000-0000-000000000001',
    '2026-08-02'
  );

insert into public.habit_milestones (id, habit_id, user_id, milestone)
values
  (
    '64400000-0000-0000-0000-000000000601',
    '64400000-0000-0000-0000-000000000101',
    '64400000-0000-0000-0000-000000000001',
    7
  ),
  (
    '64400000-0000-0000-0000-000000000603',
    '64400000-0000-0000-0000-000000000103',
    '64400000-0000-0000-0000-000000000001',
    30
  );

insert into public.habit_graduations (
  id,
  habit_id,
  user_id,
  graduated_at,
  graduated_streak
)
values
  (
    '64400000-0000-0000-0000-000000000701',
    '64400000-0000-0000-0000-000000000101',
    '64400000-0000-0000-0000-000000000001',
    '2026-07-31T10:00:00Z',
    12
  ),
  (
    '64400000-0000-0000-0000-000000000703',
    '64400000-0000-0000-0000-000000000103',
    '64400000-0000-0000-0000-000000000001',
    '2026-07-30T10:00:00Z',
    30
  );

set local role authenticated;

reset role;
insert into public.tasks (
  id,
  user_id,
  title,
  due_date,
  due_time
)
values (
  '64400000-0000-0000-0000-000000000802',
  '64400000-0000-0000-0000-000000000001',
  'Unrelated Task reminder source',
  '2026-08-03',
  '09:00:00'
);
set local role authenticated;

do $$
declare
  configured jsonb;
begin
  configured := public.configure_task_reminders(
    '64400000-0000-0000-0000-000000000001',
    '64400000-0000-0000-0000-000000000802',
    '[{
      "reminder_type": "absolute",
      "absolute_time": "2026-08-03T09:00:00Z",
      "channels": ["push"]
    }]'::jsonb
  );
  if configured->>'type' <> 'configured' then
    raise exception 'Task Reminder Configuration seed was incorrect: %', configured;
  end if;
end
$$;

set local role authenticated;
do $habit_reminder_seed$
declare
  outcome jsonb;
begin
  outcome := public.configure_habit_reminders(
    '64400000-0000-0000-0000-000000000001',
    '64400000-0000-0000-0000-000000000101',
    '[{
      "reminder_type": "absolute",
      "relative_minutes": null,
      "absolute_time": "2026-08-03T08:00:00Z",
      "channels": ["push"]
    }]'::jsonb,
    null
  );
  if outcome->>'type' is distinct from 'configured'
     or jsonb_array_length(outcome->'reminders') <> 1
     or outcome->'reminders'->0->>'source_type' is distinct from 'habit'
     or (outcome->'reminders'->0->>'source_id')::uuid
       is distinct from '64400000-0000-0000-0000-000000000101'::uuid
     or outcome->'reminders'->0->>'reminder_type' is distinct from 'absolute'
     or (outcome->'reminders'->0->>'fire_at')::timestamptz
       is distinct from timestamptz '2026-08-03 08:00:00+00' then
    raise exception 'successful-deletion Habit reminder seed outcome was incorrect: %', outcome;
  end if;
  perform set_config(
    'sql_fixture.habit_deletion_success_reminder_id',
    outcome->'reminders'->0->>'id',
    false
  );

  outcome := public.configure_habit_reminders(
    '64400000-0000-0000-0000-000000000001',
    '64400000-0000-0000-0000-000000000103',
    '[{
      "reminder_type": "absolute",
      "relative_minutes": null,
      "absolute_time": "2026-08-03T10:00:00Z",
      "channels": ["push"]
    }]'::jsonb,
    null
  );
  if outcome->>'type' is distinct from 'configured'
     or jsonb_array_length(outcome->'reminders') <> 1
     or outcome->'reminders'->0->>'source_type' is distinct from 'habit'
     or (outcome->'reminders'->0->>'source_id')::uuid
       is distinct from '64400000-0000-0000-0000-000000000103'::uuid
     or outcome->'reminders'->0->>'reminder_type' is distinct from 'absolute'
     or (outcome->'reminders'->0->>'fire_at')::timestamptz
       is distinct from timestamptz '2026-08-03 10:00:00+00' then
    raise exception 'rollback-deletion Habit reminder seed outcome was incorrect: %', outcome;
  end if;
  perform set_config(
    'sql_fixture.habit_deletion_rollback_reminder_id',
    outcome->'reminders'->0->>'id',
    false
  );
end
$habit_reminder_seed$;
reset role;

insert into public.reminder_defaults (
  id,
  user_id,
  source_type,
  relative_minutes,
  channels
)
values (
  '64400000-0000-0000-0000-000000001001',
  '64400000-0000-0000-0000-000000000001',
  'habit',
  15,
  '{push}'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"64400000-0000-0000-0000-000000000002"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '64400000-0000-0000-0000-000000000002',
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
  '64400000-0000-0000-0000-000000000104',
  '64400000-0000-0000-0000-000000000002',
  'Private deletion',
  '{"type":"daily"}'::jsonb,
  'formed',
  11,
  11
);

insert into public.habit_logs (id, habit_id, user_id, logged_date)
values (
  '64400000-0000-0000-0000-000000000504',
  '64400000-0000-0000-0000-000000000104',
  '64400000-0000-0000-0000-000000000002',
  '2026-08-01'
);

insert into public.habit_milestones (id, habit_id, user_id, milestone)
values (
  '64400000-0000-0000-0000-000000000604',
  '64400000-0000-0000-0000-000000000104',
  '64400000-0000-0000-0000-000000000002',
  7
);

insert into public.habit_graduations (
  id,
  habit_id,
  user_id,
  graduated_at,
  graduated_streak
)
values (
  '64400000-0000-0000-0000-000000000704',
  '64400000-0000-0000-0000-000000000104',
  '64400000-0000-0000-0000-000000000002',
  '2026-07-31T10:00:00Z',
  11
);

set local role authenticated;
do $habit_reminder_seed$
declare
  outcome jsonb;
begin
  outcome := public.configure_habit_reminders(
    '64400000-0000-0000-0000-000000000002',
    '64400000-0000-0000-0000-000000000104',
    '[{
      "reminder_type": "absolute",
      "relative_minutes": null,
      "absolute_time": "2026-08-03T11:00:00Z",
      "channels": ["push"]
    }]'::jsonb,
    null
  );
  if outcome->>'type' is distinct from 'configured'
     or jsonb_array_length(outcome->'reminders') <> 1
     or outcome->'reminders'->0->>'source_type' is distinct from 'habit'
     or (outcome->'reminders'->0->>'source_id')::uuid
       is distinct from '64400000-0000-0000-0000-000000000104'::uuid
     or outcome->'reminders'->0->>'reminder_type' is distinct from 'absolute'
     or (outcome->'reminders'->0->>'fire_at')::timestamptz
       is distinct from timestamptz '2026-08-03 11:00:00+00' then
    raise exception 'other-owner Habit reminder seed outcome was incorrect: %', outcome;
  end if;
  perform set_config(
    'sql_fixture.habit_deletion_other_reminder_id',
    outcome->'reminders'->0->>'id',
    false
  );
end
$habit_reminder_seed$;
reset role;

insert into public.reminder_defaults (
  id,
  user_id,
  source_type,
  relative_minutes,
  channels
)
values (
  '64400000-0000-0000-0000-000000001004',
  '64400000-0000-0000-0000-000000000002',
  'habit',
  30,
  '{push}'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"64400000-0000-0000-0000-000000000001"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '64400000-0000-0000-0000-000000000001',
  true
);

set local role authenticated;

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.delete_habit_atomically(uuid,uuid)'::regprocedure
  ) into function_definition;

  if position('FOR UPDATE' in upper(function_definition)) = 0 then
    raise exception 'habit deletion lifecycle does not lock the habit row';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.delete_habit_atomically(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated lacks habit deletion execute privilege';
  end if;

  if has_function_privilege(
    'anon',
    'public.delete_habit_atomically(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'anonymous habit deletion execute privilege leaked';
  end if;

  if not exists (
    select 1
    from pg_proc
    where oid = 'public.delete_habit_atomically(uuid,uuid)'::regprocedure
      and prosecdef
  ) then
    raise exception 'habit deletion lifecycle must use the Habit lifecycle owner';
  end if;

  if has_table_privilege('authenticated', 'public.reminders', 'DELETE') then
    raise exception 'authenticated retained direct source reminder delete privilege';
  end if;

  if not exists (
    select 1
    from pg_attribute
    where attrelid = 'public.reminders'::regclass
      and attname = 'habit_source_id'
      and attgenerated = 's'
  ) then
    raise exception 'Habit reminder generated source key is unavailable';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.reminders'::regclass
      and conname = 'reminders_habit_owner_fkey'
  ) then
    raise exception 'Habit reminder owner foreign key is unavailable';
  end if;
end
$$;

do $$
declare
  deleted jsonb;
  repeated jsonb;
begin
  deleted := public.delete_habit_atomically(
    '64400000-0000-0000-0000-000000000101',
    '64400000-0000-0000-0000-000000000001'
  );

  if deleted <> jsonb_build_object('type', 'deleted') then
    raise exception 'deleted outcome was incorrect: %', deleted;
  end if;

  if exists (
    select 1 from public.habits
    where id = '64400000-0000-0000-0000-000000000101'
  ) or exists (
    select 1 from public.habit_logs
    where id = '64400000-0000-0000-0000-000000000501'
  ) or exists (
    select 1 from public.habit_milestones
    where id = '64400000-0000-0000-0000-000000000601'
  ) or exists (
    select 1 from public.habit_graduations
    where id = '64400000-0000-0000-0000-000000000701'
  ) or exists (
    select 1 from public.reminders
    where id = current_setting('sql_fixture.habit_deletion_success_reminder_id')::uuid
  ) then
    raise exception 'Habit deletion left dependent lifecycle data';
  end if;

  if not exists (
    select 1 from public.reminders
    where source_type = 'task'
      and source_id = '64400000-0000-0000-0000-000000000802'
  ) then
    raise exception 'Habit deletion removed reusable or unrelated reminder data';
  end if;

  repeated := public.delete_habit_atomically(
    '64400000-0000-0000-0000-000000000101',
    '64400000-0000-0000-0000-000000000001'
  );

  if repeated <> jsonb_build_object('type', 'not-found') then
    raise exception 'repeated deletion was not not-found: %', repeated;
  end if;
end
$$;

do $$
declare
  missing jsonb;
  cross_owner jsonb;
begin
  missing := public.delete_habit_atomically(
    '64400000-0000-0000-0000-000000000199',
    '64400000-0000-0000-0000-000000000001'
  );
  cross_owner := public.delete_habit_atomically(
    '64400000-0000-0000-0000-000000000104',
    '64400000-0000-0000-0000-000000000001'
  );

  if missing <> jsonb_build_object('type', 'not-found')
    or cross_owner <> jsonb_build_object('type', 'not-found') then
    raise exception 'missing and cross-owner deletion outcomes differed: missing=%, cross_owner=%',
      missing, cross_owner;
  end if;
end
$$;

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"64400000-0000-0000-0000-000000000002"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '64400000-0000-0000-0000-000000000002',
  true
);

do $$
begin
  if not exists (
    select 1 from public.habits
    where id = '64400000-0000-0000-0000-000000000104'
      and user_id = '64400000-0000-0000-0000-000000000002'
  ) or not exists (
    select 1 from public.habit_logs
    where id = '64400000-0000-0000-0000-000000000504'
  ) or not exists (
    select 1 from public.habit_milestones
    where id = '64400000-0000-0000-0000-000000000604'
  ) or not exists (
    select 1 from public.habit_graduations
    where id = '64400000-0000-0000-0000-000000000704'
  ) or not exists (
    select 1 from public.reminders
    where id = current_setting('sql_fixture.habit_deletion_other_reminder_id')::uuid
  ) then
    raise exception 'cross-owner deletion destructively changed the other owner data';
  end if;
end
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"64400000-0000-0000-0000-000000000001"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '64400000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;

do $$
declare
  failure_error text;
begin
  begin
    perform public.delete_habit_atomically(
      '64400000-0000-0000-0000-000000000103',
      '64400000-0000-0000-0000-000000000001'
    );
    raise exception 'rollback deletion unexpectedly succeeded';
  exception
    when raise_exception then
      failure_error := sqlerrm;
      if failure_error <> 'forced habit deletion failure' then
        raise;
      end if;
  end;

  if not exists (
    select 1 from public.habits
    where id = '64400000-0000-0000-0000-000000000103'
  ) or not exists (
    select 1 from public.habit_logs
    where id = '64400000-0000-0000-0000-000000000503'
  ) or not exists (
    select 1 from public.habit_milestones
    where id = '64400000-0000-0000-0000-000000000603'
  ) or not exists (
    select 1 from public.habit_graduations
    where id = '64400000-0000-0000-0000-000000000703'
  ) or not exists (
    select 1 from public.reminders
    where id = current_setting('sql_fixture.habit_deletion_rollback_reminder_id')::uuid
  ) then
    raise exception 'failed Habit deletion left a partial persisted outcome';
  end if;
end
$$;

reset role;

do $$
begin
  if not exists (
    select 1 from public.reminder_defaults
    where id = '64400000-0000-0000-0000-000000001001'
  ) then
    raise exception 'Habit deletion removed the owner reminder default';
  end if;
end
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"64400000-0000-0000-0000-000000000002"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '64400000-0000-0000-0000-000000000002',
  true
);

do $$
begin
  if not exists (
    select 1 from public.reminder_defaults
    where id = '64400000-0000-0000-0000-000000001004'
  ) then
    raise exception 'Habit deletion removed the other owner reminder default';
  end if;
end
$$;

rollback;
